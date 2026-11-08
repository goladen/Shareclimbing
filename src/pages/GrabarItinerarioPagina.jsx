import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, setDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Plus, Trash2, CheckCircle, Cloud, CloudOff, Edit } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ItinerarioEditor, distanciaRuta, formatearDistancia } from '../components/ItinerarioMapa';

// Itinerarios grabados con el GPS. Cada punto se guarda en Firestore al momento, así se puede
// grabar en varias sesiones; al final se importa desde el editor de la escuela o del croquis.
// Documento: itinerarios_grabados/{id} = { creadoPor, nombre, puntos, estado, createdAt, updatedAt }
const COL = 'itinerarios_grabados';

export default function GrabarItinerarioPagina({ itinerarioId, onAbrir, onVolver }) {
    const { usuario, cargando, pedirAuth } = useAuth();

    if (cargando) return <Marco titulo="Itinerarios grabados" onVolver={onVolver}><Centro>Cargando…</Centro></Marco>;
    if (!usuario) {
        return (
            <Marco titulo="Itinerarios grabados" onVolver={onVolver}>
                <Centro>
                    <p>Inicia sesión para grabar itinerarios.</p>
                    <button onClick={() => pedirAuth()} style={st.btnPrincipal}>Iniciar sesión</button>
                </Centro>
            </Marco>
        );
    }
    return itinerarioId
        ? <Grabacion key={itinerarioId} id={itinerarioId} onVolver={() => onAbrir(null)} />
        : <Lista uid={usuario.uid} onAbrir={onAbrir} onVolver={onVolver} />;
}

function Lista({ uid, onAbrir, onVolver }) {
    const [lista, setLista] = useState(null);

    useEffect(() => onSnapshot(
        query(collection(db, COL), where('creadoPor', '==', uid)),
        (snap) => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const seg = (x) => x.updatedAt?.seconds ?? Date.now() / 1000; // recién creado aún sin hora del servidor
            docs.sort((a, b) => seg(b) - seg(a));
            setLista(docs);
        },
        (e) => { console.error(e); setLista([]); }
    ), [uid]);

    const crear = async () => {
        const nombre = window.prompt('Nombre del itinerario (ej: Acceso al sector Placa)');
        if (!nombre?.trim()) return;
        // Sin await: con la caché local el documento existe al momento, aunque no haya cobertura
        const ref = doc(collection(db, COL));
        setDoc(ref, { creadoPor: uid, nombre: nombre.trim().slice(0, 80), puntos: [], estado: 'grabando', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
            .catch(e => console.error(e));
        onAbrir(ref.id);
    };

    return (
        <Marco titulo="Itinerarios grabados" subtitulo="Graba el acceso con el GPS y úsalo después en una escuela o croquis" onVolver={onVolver}
            accion={<button onClick={crear} style={st.btnPrincipal}><Plus size={16} /> Nuevo</button>}>
            {lista === null ? <Centro>Cargando…</Centro> : lista.length === 0 ? (
                <Centro>
                    <div style={{ fontSize: '2.5rem' }}>🥾</div>
                    <p style={{ fontWeight: 'bold', color: '#2c3e50' }}>Aún no has grabado ningún itinerario</p>
                    <p style={{ color: '#7f8c8d', fontSize: '0.88rem', maxWidth: 420 }}>
                        Crea uno, pulsa «Empezar a grabar» al salir del aparcamiento y se irá guardando un punto cada pocos minutos.
                        Puedes pausar, cerrar la app y continuar otro día.
                    </p>
                    <button onClick={crear} style={st.btnPrincipal}><Plus size={16} /> Crear itinerario</button>
                </Centro>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720, margin: '0 auto' }}>
                    {lista.map(it => (
                        <button key={it.id} onClick={() => onAbrir(it.id)}
                            style={{ textAlign: 'left', padding: '12px 14px', background: 'white', border: '1px solid #dfe4ea', borderRadius: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                            <span>
                                <strong style={{ color: '#2c3e50' }}>{it.nombre}</strong>
                                <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d', marginTop: 2 }}>
                                    {it.puntos?.length || 0} puntos · {formatearDistancia(distanciaRuta(it.puntos || []))}
                                    {it.updatedAt?.toDate && ` · ${it.updatedAt.toDate().toLocaleDateString()}`}
                                </span>
                            </span>
                            <EstadoChip estado={it.estado} />
                        </button>
                    ))}
                </div>
            )}
        </Marco>
    );
}

function Grabacion({ id, onVolver }) {
    const [it, setIt] = useState(undefined);       // undefined = cargando, null = no existe
    const [pendiente, setPendiente] = useState(false);
    const ref = doc(db, COL, id);

    useEffect(() => onSnapshot(ref, { includeMetadataChanges: true },
        (snap) => {
            setIt(snap.exists() ? { id: snap.id, ...snap.data() } : null);
            setPendiente(snap.metadata.hasPendingWrites);
        },
        (e) => { console.error(e); setIt(null); }
    ), [id]); // eslint-disable-line

    // Cada cambio (punto GPS, punto manual, nota, borrado) se guarda al instante
    const guardar = (cambios) => updateDoc(ref, { ...cambios, updatedAt: serverTimestamp() }).catch(e => {
        console.error(e);
        alert('No se pudo guardar el cambio.');
    });

    if (it === undefined) return <Marco titulo="Itinerario" onVolver={onVolver}><Centro>Cargando…</Centro></Marco>;
    if (it === null) return <Marco titulo="Itinerario" onVolver={onVolver}><Centro>Este itinerario no existe o no es tuyo.</Centro></Marco>;

    const renombrar = () => {
        const n = window.prompt('Nombre del itinerario', it.nombre);
        if (n?.trim()) guardar({ nombre: n.trim().slice(0, 80) });
    };
    const eliminar = async () => {
        if (!window.confirm(`¿Eliminar «${it.nombre}»? Los croquis o escuelas donde ya lo importaste no se ven afectados.`)) return;
        deleteDoc(ref).catch(e => console.error(e));
        onVolver();
    };
    const terminado = it.estado === 'terminado';

    return (
        <Marco titulo={it.nombre} onVolver={onVolver}
            subtitulo={pendiente
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CloudOff size={12} /> Guardado en el móvil · se subirá al recuperar conexión</span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Cloud size={12} /> Todo guardado</span>}
            accion={<button onClick={renombrar} style={st.btnHeader} title="Cambiar nombre"><Edit size={16} /></button>}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
                <div style={{ background: 'white', borderRadius: 12, padding: 14, border: '1px solid #dfe4ea' }}>
                    <ItinerarioEditor grabar alto={420} puntos={it.puntos || []} onChange={(puntos) => guardar({ puntos })} />
                </div>

                <div style={{ marginTop: 14, background: 'white', borderRadius: 12, padding: 14, border: '1px solid #dfe4ea' }}>
                    {terminado ? (
                        <>
                            <p style={st.texto}><CheckCircle size={14} style={{ color: '#27ae60', verticalAlign: -2 }} /> <strong>Itinerario terminado.</strong> Para publicarlo, abre la escuela o el croquis, ve a «Itinerario» y pulsa <strong>Importar itinerario grabado</strong>.</p>
                            <button onClick={() => guardar({ estado: 'grabando' })} style={st.btnSecundario}>Seguir grabando</button>
                        </>
                    ) : (
                        <>
                            <p style={st.texto}>Cuando tengas todo el recorrido, revisa los puntos, añade a mano los que falten y las observaciones, y márcalo como terminado.</p>
                            <button onClick={() => guardar({ estado: 'terminado' })} disabled={!it.puntos?.length}
                                style={{ ...st.btnPrincipal, opacity: it.puntos?.length ? 1 : 0.5 }}><CheckCircle size={16} /> Marcar como terminado</button>
                        </>
                    )}
                    <button onClick={eliminar} style={{ ...st.btnSecundario, color: '#e74c3c', borderColor: '#e74c3c', marginLeft: 8 }}><Trash2 size={14} /> Eliminar</button>
                </div>
            </div>
        </Marco>
    );
}

function EstadoChip({ estado }) {
    const fin = estado === 'terminado';
    return (
        <span style={{ flexShrink: 0, fontSize: '0.72rem', fontWeight: 'bold', padding: '3px 8px', borderRadius: 10, background: fin ? '#eafaf1' : '#fdf2f1', color: fin ? '#27ae60' : '#c0392b' }}>
            {fin ? 'Terminado' : 'En curso'}
        </span>
    );
}

function Marco({ titulo, subtitulo, accion, onVolver, children }) {
    return (
        <div style={{ minHeight: '100vh', background: '#f4f6f8', fontFamily: "'Segoe UI', sans-serif" }}>
            <div style={{ background: '#2c3e50', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={onVolver} style={st.btnHeader}><ArrowLeft size={22} /></button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</div>
                    {subtitulo && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.76rem' }}>{subtitulo}</div>}
                </div>
                {accion}
            </div>
            <div style={{ padding: 16 }}>{children}</div>
        </div>
    );
}

const Centro = ({ children }) => (
    <div style={{ textAlign: 'center', padding: 40, color: '#7f8c8d', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>{children}</div>
);

const st = {
    btnPrincipal: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
    btnSecundario: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' },
    btnHeader: { background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4, display: 'flex' },
    texto: { margin: '0 0 10px', fontSize: '0.85rem', color: '#555' },
};
