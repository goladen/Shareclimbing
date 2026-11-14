import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Minus, X, Save, Trash2, Edit, UserPlus, UserMinus, ImagePlus, Check, Replace, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAccesoDirecto } from '../utils/accesoDirecto';
import BotonAccesoDirecto from '../components/BotonAccesoDirecto';
import BotonCompartir, { enlaceRocodromo } from '../components/BotonCompartir';
import { GRADOS_BLOQUE, ListaBloques, ValorarBloqueModal, MODALIDADES, ChipsModalidades } from '../components/BloquesRocodromo';
import AlinearFotoRocodromo from '../components/AlinearFotoRocodromo';
import { useSinDesplazarAlArrastrar } from '../utils/arrastreTactil';
import RocodromoModal, { subirFotosRocodromo, archivoDemasiadoGrande } from '../components/RocodromoModal';

const TIPOS_PRESA = {
    inicio: { label: 'Inicio', color: '#27ae60' },
    intermedia: { label: 'Intermedia', color: '#f1c40f' },
    fin: { label: 'Final', color: '#e74c3c' },
    pie: { label: 'Solo pie', color: '#3498db' },
};
const RADIO_INICIAL = 0.025;
// Distancia en pantalla entre un círculo y su asa, para que el dedo no tape la presa
const DISTANCIA_ASA = 70;

// Foto con círculos. Las posiciones y radios de las presas son fracciones del tamaño
// de la foto, de modo que el dibujo se adapta a cualquier pantalla.
// asa: { indice, onMover(pos) } muestra bajo ese círculo un asa a distancia fija en pantalla;
// al arrastrarla el círculo se mueve sin que el dedo lo tape.
export function FotoConPresas({ foto, presas = [], seleccionada = null, renderPresa, asa = null }) {
    const [natural, setNatural] = useState(null);
    const [anchoVisible, setAnchoVisible] = useState(0);
    const contRef = useRef(null);
    const arrastrandoAsa = useRef(false);
    useSinDesplazarAlArrastrar(contRef);

    useEffect(() => {
        const obs = new ResizeObserver(([e]) => setAnchoVisible(e.contentRect.width));
        obs.observe(contRef.current);
        return () => obs.disconnect();
    }, []);

    const f = natural && anchoVisible ? natural.w / anchoVisible : 1; // px de la foto por px de pantalla
    const presaAsa = asa && presas[asa.indice];

    const moverAsa = (e) => {
        if (!arrastrandoAsa.current) return;
        const r = contRef.current.getBoundingClientRect();
        asa.onMover({
            x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
            y: Math.min(1, Math.max(0, (e.clientY - DISTANCIA_ASA - r.top) / r.height)),
        });
    };

    return (
        <div ref={contRef} style={{ position: 'relative', lineHeight: 0 }}>
            <img src={foto.imagenUrl} alt={foto.nombre || 'Pared'} draggable={false}
                onLoad={e => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }} />
            {natural && (
                <svg viewBox={`0 0 ${natural.w} ${natural.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: renderPresa ? 'auto' : 'none' }}>
                    {presas.map((p, i) => {
                        const props = { cx: p.x * natural.w, cy: p.y * natural.h, r: p.r * natural.w, fill: 'none', vectorEffect: 'non-scaling-stroke' };
                        return (
                            <g key={i}>
                                <circle {...props} stroke="white" strokeWidth={6} opacity={0.85} />
                                <circle {...props} stroke={TIPOS_PRESA[p.tipo].color} strokeWidth={3.5} strokeDasharray={seleccionada === i ? '7,5' : undefined} />
                                {renderPresa?.(props, i)}
                            </g>
                        );
                    })}
                    {presaAsa && (
                        <g>
                            <line x1={presaAsa.x * natural.w} y1={presaAsa.y * natural.h + presaAsa.r * natural.w}
                                x2={presaAsa.x * natural.w} y2={presaAsa.y * natural.h + DISTANCIA_ASA * f}
                                stroke="white" strokeWidth={2 * f} strokeDasharray={`${4 * f},${3 * f}`} pointerEvents="none" />
                            <circle data-asa="" data-arrastrable="" cx={presaAsa.x * natural.w} cy={presaAsa.y * natural.h + DISTANCIA_ASA * f} r={18 * f}
                                fill={TIPOS_PRESA[presaAsa.tipo].color} fillOpacity={0.35} stroke="white" strokeWidth={2.5 * f}
                                style={{ cursor: 'move', touchAction: 'none' }}
                                onClick={e => e.stopPropagation()}
                                onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); arrastrandoAsa.current = true; }}
                                onPointerMove={moverAsa}
                                onPointerUp={() => { arrastrandoAsa.current = false; }}
                                onPointerCancel={() => { arrastrandoAsa.current = false; }} />
                        </g>
                    )}
                </svg>
            )}
        </div>
    );
}

// Avisa en la campana a los demás miembros de que hay un bloque nuevo. Un fallo aquí no
// debe deshacer el bloque, que ya está guardado. Un lote admite hasta 500 escrituras.
async function avisarMiembros(rocodromo, bloque, usuario) {
    const destinatarios = (rocodromo.miembros || []).filter(uid => uid !== usuario.uid);
    try {
        for (let i = 0; i < destinatarios.length; i += 500) {
            const lote = writeBatch(db);
            destinatarios.slice(i, i + 500).forEach(uid => lote.set(doc(collection(db, 'notificaciones', uid, 'items')), {
                tipo: 'bloque_nuevo',
                rocodromoId: rocodromo.id,
                rocodromoNombre: rocodromo.nombre,
                bloqueId: bloque.id,
                bloqueNombre: bloque.nombre || 'Bloque sin nombre',
                bloqueGrado: bloque.grado,
                autorNombre: bloque.creadoPorNombre,
                leido: false,
                createdAt: serverTimestamp(),
            }));
            await lote.commit();
        }
    } catch (e) { console.error(e); }
}

function EditorBloque({ rocodromoId, rocodromo, foto, bloque, usuario, onCerrar, onGuardado }) {
    const [presas, setPresas] = useState(bloque?.presas || []);
    const [tipo, setTipo] = useState('inicio');
    const [radio, setRadio] = useState(RADIO_INICIAL);
    const [seleccion, setSeleccion] = useState(null);
    const [asaIdx, setAsaIdx] = useState(null); // círculo con asa: el último colocado o el último tocado
    const [zoom, setZoom] = useState(1);
    const [nombre, setNombre] = useState(bloque?.nombre || '');
    const [grado, setGrado] = useState(bloque?.grado || '');
    const [modalidades, setModalidades] = useState(bloque?.modalidades || []);
    const [observacion, setObservacion] = useState(bloque?.observacion || '');
    const [masDatos, setMasDatos] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const lienzoRef = useRef(null);
    const arrastre = useRef(null);

    useEffect(() => { setError(''); }, [presas, grado]);

    const posicion = (e) => {
        const r = lienzoRef.current.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
            y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
        };
    };

    const clicEnFoto = (e) => {
        // Con un círculo seleccionado, tocar fuera solo lo deselecciona
        if (seleccion !== null) { setSeleccion(null); return; }
        setAsaIdx(presas.length);
        setPresas(ps => [...ps, { ...posicion(e), r: radio, tipo }]);
    };

    const elegirTipo = (t) => {
        setTipo(t);
        if (seleccion !== null) setPresas(ps => ps.map((p, i) => i === seleccion ? { ...p, tipo: t } : p));
    };

    const cambiarRadio = (r) => {
        setRadio(r);
        if (seleccion !== null) setPresas(ps => ps.map((p, i) => i === seleccion ? { ...p, r } : p));
    };

    const quitarSeleccion = () => {
        setPresas(ps => ps.filter((_, i) => i !== seleccion));
        setSeleccion(null);
        setAsaIdx(null);
    };

    const guardar = async () => {
        if (!presas.some(p => p.tipo === 'inicio')) { setError('Marca al menos una presa de inicio (verde).'); return; }
        if (!presas.some(p => p.tipo === 'fin')) { setError('Marca al menos una presa final (roja).'); return; }
        if (!grado.trim()) { setError('Indica el grado del bloque.'); return; }
        setGuardando(true);
        setError('');
        try {
            const datos = {
                nombre: nombre.trim(), grado: grado.trim(), presas,
                modalidades: modalidades.map(m => ({ id: m.id, grado: (m.grado || '').trim() })),
                observacion: observacion.trim().slice(0, 500),
            };
            if (bloque) {
                await updateDoc(doc(db, 'rocodromos', rocodromoId, 'bloques', bloque.id), datos);
                onGuardado({ ...bloque, ...datos });
            } else {
                const nuevo = {
                    ...datos,
                    fotoId: foto.id,
                    creadoPor: usuario.uid,
                    creadoPorNombre: usuario.displayName || usuario.email.split('@')[0],
                    encadenadoPor: [],
                };
                const ref = await addDoc(collection(db, 'rocodromos', rocodromoId, 'bloques'), { ...nuevo, createdAt: serverTimestamp() });
                await avisarMiembros(rocodromo, { id: ref.id, ...nuevo }, usuario);
                onGuardado({ id: ref.id, ...nuevo });
            }
        } catch (e) {
            setError('Error al guardar: ' + e.message);
            setGuardando(false);
        }
    };

    return (
        <div style={st.editor}>
            <div style={st.topbar}>
                <button onClick={onCerrar} style={{ ...st.btnBarra, background: 'rgba(255,255,255,0.12)' }}><X size={16} /> Cancelar</button>
                <button onClick={guardar} disabled={guardando} style={{ ...st.btnBarra, background: '#27ae60' }}>
                    <Save size={16} /> {guardando ? 'Guardando…' : 'Guardar bloque'}
                </button>
            </div>
            <div style={st.herramientas}>
                {error && <div style={st.error}>{error}</div>}
                <div style={st.fila}>
                    <input value={grado} onChange={e => setGrado(e.target.value)} list="grados-bloque" placeholder="Grado *" style={{ ...st.input, width: 90 }} />
                    <datalist id="grados-bloque">{GRADOS_BLOQUE.map(g => <option key={g} value={g} />)}</datalist>
                    <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre (opcional)" style={{ ...st.input, flex: 1, minWidth: 120 }} />
                    <button onClick={() => setMasDatos(m => !m)} style={{ ...st.btnCuadrado, padding: '0 8px' }} aria-expanded={masDatos}>
                        Formas y comentario {masDatos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
                {masDatos && (
                    <div style={st.masDatos}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#34495e' }}>Formas de hacerlo (grado opcional si cambia)</div>
                        {MODALIDADES.map(m => {
                            const elegida = modalidades.find(x => x.id === m.id);
                            return (
                                <div key={m.id} style={st.fila}>
                                    <label style={{ ...st.etiqueta, flex: 1, minWidth: 140, fontWeight: 'normal' }} title={m.desc}>
                                        <input type="checkbox" checked={Boolean(elegida)}
                                            onChange={e => setModalidades(ms => e.target.checked ? [...ms, { id: m.id, grado: '' }] : ms.filter(x => x.id !== m.id))} />
                                        <strong>{m.label}</strong>
                                    </label>
                                    {elegida && (
                                        <input value={elegida.grado} list="grados-bloque" placeholder={grado || 'Grado'} aria-label={`Grado ${m.label}`}
                                            onChange={e => setModalidades(ms => ms.map(x => x.id === m.id ? { ...x, grado: e.target.value } : x))}
                                            style={{ ...st.input, width: 80 }} />
                                    )}
                                </div>
                            );
                        })}
                        <textarea value={observacion} onChange={e => setObservacion(e.target.value)} rows={2} maxLength={500}
                            placeholder="Observación o comentario (opcional)" style={{ ...st.input, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                    </div>
                )}
                <div style={st.fila}>
                    {Object.entries(TIPOS_PRESA).map(([id, t]) => (
                        <button key={id} onClick={() => elegirTipo(id)}
                            style={{ ...st.btnTipo, borderColor: t.color, background: tipo === id ? t.color : 'white', color: tipo === id ? (id === 'intermedia' ? '#2c3e50' : 'white') : '#2c3e50', minWidth: 72 }}>
                            {t.label} ({presas.filter(p => p.tipo === id).length})
                        </button>
                    ))}
                </div>
                <div style={st.fila}>
                    <label style={st.etiqueta}>
                        Tamaño
                        <input type="range" min="0.008" max="0.08" step="0.002" value={seleccion !== null ? presas[seleccion]?.r ?? radio : radio}
                            onChange={e => cambiarRadio(parseFloat(e.target.value))} style={{ width: 90 }} />
                    </label>
                    <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} style={st.btnCuadrado} title="Alejar"><Minus size={15} /></button>
                    <button onClick={() => setZoom(z => Math.min(4, z + 0.5))} style={st.btnCuadrado} title="Acercar"><Plus size={15} /></button>
                    {seleccion !== null
                        ? <button onClick={quitarSeleccion} style={{ ...st.btnCuadrado, color: '#e74c3c', padding: '0 8px' }}><Trash2 size={14} /> Quitar</button>
                        : presas.length > 0 && <button onClick={() => { setAsaIdx(null); setPresas(ps => ps.slice(0, -1)); }} style={{ ...st.btnCuadrado, padding: '0 8px' }}>Deshacer</button>}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#7f8c8d' }}>
                    Toca una presa para rodearla y ajústala con el asa de debajo. Toca un círculo para cambiar su tipo o tamaño.
                </div>
            </div>
            <div style={st.lienzoScroll}>
                <div ref={lienzoRef} onClick={clicEnFoto} style={{ width: `${zoom * 100}%`, cursor: 'crosshair', margin: '0 auto', maxWidth: zoom === 1 ? 1100 : 'none' }}>
                    <FotoConPresas foto={foto} presas={presas} seleccionada={seleccion}
                        asa={asaIdx !== null && presas[asaIdx] ? { indice: asaIdx, onMover: pos => setPresas(ps => ps.map((p, idx) => idx === asaIdx ? { ...p, ...pos } : p)) } : null}
                        renderPresa={(props, i) => (
                            <circle {...props} data-arrastrable="" fill="transparent" stroke="transparent" strokeWidth={14} style={{ cursor: 'move', touchAction: 'none' }}
                                onClick={e => e.stopPropagation()}
                                onPointerDown={e => {
                                    e.stopPropagation();
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                    arrastre.current = i;
                                    setSeleccion(i);
                                    setAsaIdx(i);
                                    setTipo(presas[i].tipo);
                                    setRadio(presas[i].r);
                                }}
                                onPointerMove={e => {
                                    if (arrastre.current !== i) return;
                                    const pos = posicion(e);
                                    setPresas(ps => ps.map((p, idx) => idx === i ? { ...p, ...pos } : p));
                                }}
                                onPointerUp={() => { arrastre.current = null; }}
                                onPointerCancel={() => { arrastre.current = null; }} />
                        )} />
                </div>
            </div>
        </div>
    );
}

// Ficha del bloque que se ve sobre la foto, con flechas para pasar al anterior o al siguiente
function TarjetaBloque({ bloque, posicion, total, onAnterior, onSiguiente }) {
    return (
        <div style={st.tarjetaBloque}>
            <button onClick={onAnterior} disabled={total === 0} style={st.btnFlecha} title="Bloque anterior"><ChevronLeft size={20} /></button>
            <div style={{ flex: 1, minWidth: 0 }}>
                {bloque ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={st.gradoTarjeta}>{bloque.grado}</span>
                            <strong style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', color: '#2c3e50' }}>{bloque.nombre || 'Bloque sin nombre'}</strong>
                            {posicion >= 0 && <span style={{ fontSize: '0.75rem', color: '#7f8c8d', whiteSpace: 'nowrap' }}>{posicion + 1}/{total}</span>}
                        </div>
                        <ChipsModalidades bloque={bloque} tam="0.75rem" />
                        {bloque.observacion && <div style={st.observacion}>💬 {bloque.observacion}</div>}
                        <div style={{ fontSize: '0.72rem', color: '#7f8c8d', marginTop: 3 }}>por {bloque.creadoPorNombre}</div>
                    </>
                ) : (
                    <div style={{ fontSize: '0.84rem', color: '#7f8c8d', textAlign: 'center' }}>
                        {total ? 'Desliza la foto o usa las flechas para ver los bloques' : 'No hay bloques con estos filtros'}
                    </div>
                )}
            </div>
            <button onClick={onSiguiente} disabled={total === 0} style={st.btnFlecha} title="Bloque siguiente"><ChevronRight size={20} /></button>
        </div>
    );
}

export default function RocodromoPagina({ rocodromoId, bloqueInicial = null, onVolver }) {
    const { usuario, setModalAuth } = useAuth();
    const [rocodromo, setRocodromo] = useState(null);
    const [bloques, setBloques] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [fotoIdx, setFotoIdx] = useState(0);
    const [bloqueId, setBloqueId] = useState(bloqueInicial);
    const [valorando, setValorando] = useState(null); // bloque cuyo ascenso se está valorando
    const [editor, setEditor] = useState(null); // { bloque } — bloque null = nuevo
    const [editandoDatos, setEditandoDatos] = useState(false);
    const [subiendo, setSubiendo] = useState('');
    const [cambiandoFoto, setCambiandoFoto] = useState(false);
    const [ordenVisibles, setOrdenVisibles] = useState([]);
    const inicioDeslizar = useRef(null);
    const fotoRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'rocodromos', rocodromoId));
                if (snap.exists()) {
                    setRocodromo({ id: snap.id, ...snap.data() });
                    const snapBloques = await getDocs(collection(db, 'rocodromos', rocodromoId, 'bloques'));
                    const lista = snapBloques.docs.map(d => ({ id: d.id, ...d.data() }));
                    setBloques(lista);
                    // Enlace a un bloque concreto: se abre la foto donde está
                    const inicial = bloqueInicial && lista.find(b => b.id === bloqueInicial);
                    const idxFoto = inicial ? (snap.data().fotos || []).findIndex(f => f.id === inicial.fotoId) : -1;
                    if (idxFoto >= 0) setFotoIdx(idxFoto);
                }
            } catch (e) { console.error(e); }
            setCargando(false);
        })();
    }, [rocodromoId]);

    useAccesoDirecto(rocodromo?.nombre);

    if (cargando) return <div style={st.mensaje}>Cargando…</div>;
    if (!rocodromo) {
        return (
            <div style={st.mensaje}>
                <p>Este rocódromo no existe o no está disponible.</p>
                <button onClick={onVolver} style={{ ...st.btnBarra, background: '#2c3e50', marginTop: 12 }}>Volver</button>
            </div>
        );
    }

    const fotos = rocodromo.fotos || [];
    const foto = fotos[fotoIdx];
    const esPropietario = usuario?.uid === rocodromo.creadoPor;
    const esMiembro = Boolean(usuario && (rocodromo.miembros || []).includes(usuario.uid));
    const hecho = (b) => Boolean(usuario && (b.encadenadoPor || []).includes(usuario.uid));

    const bloquesFoto = bloques.filter(b => b.fotoId === foto?.id);
    const bloqueActivo = bloquesFoto.find(b => b.id === bloqueId);

    const cambiarMembresia = async () => {
        if (!usuario) { setModalAuth(true); return; }
        try {
            await updateDoc(doc(db, 'rocodromos', rocodromo.id), { miembros: esMiembro ? arrayRemove(usuario.uid) : arrayUnion(usuario.uid) });
            setRocodromo(r => ({
                ...r,
                miembros: esMiembro ? (r.miembros || []).filter(u => u !== usuario.uid) : [...(r.miembros || []), usuario.uid],
            }));
        } catch (e) { alert('Error: ' + e.message); }
    };

    const valorar = (b) => {
        if (!usuario) { setModalAuth(true); return; }
        setValorando(b);
    };

    // Ascenso con su valoración (estrellas y grado propuesto); null lo quita de mis hechos
    const guardarAscenso = async (b, valoracion) => {
        const ref = doc(db, 'rocodromos', rocodromo.id, 'bloques', b.id);
        const clave = `valoraciones.${usuario.uid}`;
        const datos = valoracion && {
            estrellas: valoracion.estrellas,
            grado: valoracion.grado || '',
            nombre: usuario.displayName || usuario.email.split('@')[0],
        };
        try {
            await updateDoc(ref, datos
                ? { encadenadoPor: arrayUnion(usuario.uid), [clave]: datos }
                : { encadenadoPor: arrayRemove(usuario.uid), [clave]: deleteField() });
            setBloques(bs => bs.map(x => {
                if (x.id !== b.id) return x;
                const valoraciones = { ...(x.valoraciones || {}) };
                if (datos) valoraciones[usuario.uid] = datos; else delete valoraciones[usuario.uid];
                const otros = (x.encadenadoPor || []).filter(u => u !== usuario.uid);
                return { ...x, valoraciones, encadenadoPor: datos ? [...otros, usuario.uid] : otros };
            }));
            setValorando(null);
        } catch (e) { alert('Error: ' + e.message); }
    };

    const eliminarBloque = async (b) => {
        if (!window.confirm('¿Eliminar este bloque?')) return;
        try {
            await deleteDoc(doc(db, 'rocodromos', rocodromo.id, 'bloques', b.id));
            setBloques(bs => bs.filter(x => x.id !== b.id));
        } catch (e) { alert('Error: ' + e.message); }
    };

    const anadirFotos = async (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        if (files.length === 0) return;
        const aviso = archivoDemasiadoGrande(files);
        if (aviso) { alert(aviso); return; }
        try {
            const nuevas = await subirFotosRocodromo(files, setSubiendo);
            const todas = [...fotos, ...nuevas];
            await updateDoc(doc(db, 'rocodromos', rocodromo.id), { fotos: todas });
            setRocodromo(r => ({ ...r, fotos: todas }));
            setFotoIdx(fotos.length);
        } catch (err) { alert('Error: ' + err.message); }
        setSubiendo('');
    };

    // Foto nueva para la pared: los círculos de sus bloques se recolocan y todo se guarda a la vez
    const asignarFotoNueva = async ({ src, file, presasDe }) => {
        let imagenUrl = src;
        if (file) [{ imagenUrl }] = await subirFotosRocodromo([file], setSubiendo);
        setSubiendo('');
        const todas = fotos.map((f, i) => i === fotoIdx ? { ...f, imagenUrl } : f);
        const cambiados = bloquesFoto.map(b => ({ ...b, presas: presasDe(b) }));
        const lote = writeBatch(db);
        cambiados.forEach(b => lote.update(doc(db, 'rocodromos', rocodromo.id, 'bloques', b.id), { presas: b.presas }));
        lote.update(doc(db, 'rocodromos', rocodromo.id), { fotos: todas });
        await lote.commit();
        setRocodromo(r => ({ ...r, fotos: todas }));
        setBloques(bs => bs.map(b => cambiados.find(c => c.id === b.id) || b));
        setCambiandoFoto(false);
    };

    const renombrarFoto = async () => {
        const nombre = window.prompt('Nombre de esta foto:', foto.nombre || '');
        if (nombre === null) return;
        const todas = fotos.map((f, i) => i === fotoIdx ? { ...f, nombre: nombre.trim() } : f);
        try {
            await updateDoc(doc(db, 'rocodromos', rocodromo.id), { fotos: todas });
            setRocodromo(r => ({ ...r, fotos: todas }));
        } catch (e) { alert('Error: ' + e.message); }
    };

    const eliminarFoto = async () => {
        const n = bloquesFoto.length;
        if (!window.confirm(n ? `¿Eliminar esta foto y sus ${n} bloque(s)?` : '¿Eliminar esta foto?')) return;
        try {
            await Promise.all(bloquesFoto.map(b => deleteDoc(doc(db, 'rocodromos', rocodromo.id, 'bloques', b.id))));
            const todas = fotos.filter((_, i) => i !== fotoIdx);
            await updateDoc(doc(db, 'rocodromos', rocodromo.id), { fotos: todas });
            setBloques(bs => bs.filter(b => b.fotoId !== foto.id));
            setRocodromo(r => ({ ...r, fotos: todas }));
            setFotoIdx(0);
        } catch (e) { alert('Error: ' + e.message); }
    };

    const eliminarRocodromo = async () => {
        if (!window.confirm(`¿Eliminar ${rocodromo.nombre} y todos sus bloques? Esta acción no se puede deshacer.`)) return;
        try {
            await Promise.all(bloques.map(b => deleteDoc(doc(db, 'rocodromos', rocodromo.id, 'bloques', b.id))));
            await deleteDoc(doc(db, 'rocodromos', rocodromo.id));
            onVolver();
        } catch (e) { alert('Error: ' + e.message); }
    };

    // Pasar de un bloque a otro (deslizando la foto o con las flechas), en el orden de la lista
    const irABloque = (delta) => {
        if (ordenVisibles.length === 0) return;
        const i = ordenVisibles.indexOf(bloqueId);
        const j = i < 0 ? (delta > 0 ? 0 : ordenVisibles.length - 1) : (i + delta + ordenVisibles.length) % ordenVisibles.length;
        setBloqueId(ordenVisibles[j]);
    };
    const alEmpezarDeslizar = (e) => { inicioDeslizar.current = { x: e.clientX, y: e.clientY }; };
    const alTerminarDeslizar = (e) => {
        const ini = inicioDeslizar.current;
        inicioDeslizar.current = null;
        if (!ini) return;
        const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) irABloque(dx < 0 ? 1 : -1);
    };

    const seleccionarBloque = (id) => {
        setBloqueId(actual => actual === id ? null : id);
        fotoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    return (
        <div style={st.app}>
            <div style={st.topbar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <button onClick={onVolver} style={st.btnIcono} title="Volver"><ArrowLeft size={20} /></button>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'white', fontWeight: 'bold' }}>{rocodromo.nombre}</div>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>{(rocodromo.miembros || []).length} {(rocodromo.miembros || []).length === 1 ? 'miembro' : 'miembros'}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <BotonCompartir titulo={rocodromo.nombre} url={enlaceRocodromo(rocodromo.id)} estilo={st.btnIcono} />
                    <BotonAccesoDirecto nombre={rocodromo.nombre} estilo={st.btnIcono} />
                    {!esPropietario && (
                        <button onClick={cambiarMembresia} style={{ ...st.btnBarra, background: esMiembro ? 'rgba(255,255,255,0.12)' : '#27ae60' }}>
                            {esMiembro ? <><UserMinus size={16} /> Dejar de ser miembro</> : <><UserPlus size={16} /> Hacerme miembro</>}
                        </button>
                    )}
                    {esPropietario && (
                        <>
                            <button onClick={() => setEditandoDatos(true)} style={st.btnIcono} title="Editar rocódromo"><Edit size={18} /></button>
                            <button onClick={eliminarRocodromo} style={{ ...st.btnIcono, background: 'rgba(231,76,60,0.5)' }} title="Eliminar rocódromo"><Trash2 size={18} /></button>
                        </>
                    )}
                </div>
            </div>

            <div style={st.scroll}>
                {rocodromo.descripcion && <p style={{ color: '#555', marginBottom: 12, maxWidth: 1280, marginInline: 'auto' }}>{rocodromo.descripcion}</p>}

                <div style={st.pestanas}>
                    {fotos.map((f, i) => (
                        <button key={f.id} onClick={() => { setFotoIdx(i); setBloqueId(null); }}
                            style={{ ...st.pestana, ...(i === fotoIdx ? st.pestanaActiva : {}) }}>
                            {f.nombre || `Foto ${i + 1}`}
                        </button>
                    ))}
                    {esPropietario && (
                        <label style={{ ...st.pestana, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <ImagePlus size={14} /> {subiendo || 'Añadir foto'}
                            <input type="file" accept="image/*" multiple onChange={anadirFotos} disabled={Boolean(subiendo)} style={{ display: 'none' }} />
                        </label>
                    )}
                    {esPropietario && foto && (
                        <>
                            <button onClick={renombrarFoto} style={st.pestana} title="Cambiar el nombre de la foto"><Edit size={13} /></button>
                            <button onClick={() => setCambiandoFoto(true)} style={st.pestana} title="Cambiar la foto y recolocar los bloques"><Replace size={13} /></button>
                            <button onClick={eliminarFoto} style={{ ...st.pestana, color: '#e74c3c' }} title="Eliminar la foto"><Trash2 size={13} /></button>
                        </>
                    )}
                </div>

                {!foto ? (
                    <div style={st.vacio}>Este rocódromo aún no tiene fotos.</div>
                ) : (
                    <div className="roc-layout">
                        <div ref={fotoRef} style={{ minWidth: 0 }}>
                            <TarjetaBloque bloque={bloqueActivo} posicion={ordenVisibles.indexOf(bloqueId)} total={ordenVisibles.length}
                                onAnterior={() => irABloque(-1)} onSiguiente={() => irABloque(1)} />
                            <div data-deslizable="" style={{ touchAction: 'pan-y' }}
                                onPointerDown={alEmpezarDeslizar} onPointerUp={alTerminarDeslizar} onPointerCancel={() => { inicioDeslizar.current = null; }}>
                                <FotoConPresas foto={foto} presas={bloqueActivo?.presas} />
                            </div>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            {esMiembro ? (
                                <button onClick={() => setEditor({ bloque: null })} style={st.btnNuevo}><Plus size={18} /> Nuevo bloque</button>
                            ) : (
                                <div style={st.aviso}>Hazte miembro para añadir bloques.</div>
                            )}
                            <div style={st.leyenda}>
                                {Object.values(TIPOS_PRESA).map(t => (
                                    <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ width: 12, height: 12, borderRadius: '50%', border: `3px solid ${t.color}` }} /> {t.label}
                                    </span>
                                ))}
                            </div>
                            <ListaBloques bloques={bloquesFoto} usuario={usuario} esPropietario={esPropietario} bloqueId={bloqueId}
                                onSeleccionar={seleccionarBloque} onEditar={(b) => setEditor({ bloque: b })}
                                onEliminar={eliminarBloque} onValorar={valorar} onVisibles={setOrdenVisibles} />
                        </div>
                    </div>
                )}
            </div>

            {editor && foto && (
                <EditorBloque rocodromoId={rocodromo.id} rocodromo={rocodromo} foto={foto} bloque={editor.bloque} usuario={usuario}
                    onCerrar={() => setEditor(null)}
                    onGuardado={(guardado) => {
                        setBloques(bs => bs.some(b => b.id === guardado.id) ? bs.map(b => b.id === guardado.id ? guardado : b) : [...bs, guardado]);
                        setBloqueId(guardado.id);
                        setEditor(null);
                    }} />
            )}
            {valorando && (
                <ValorarBloqueModal bloque={valorando} valoracion={valorando.valoraciones?.[usuario.uid]} yaHecho={hecho(valorando)}
                    onGuardar={(v) => guardarAscenso(valorando, v)} onQuitar={() => guardarAscenso(valorando, null)}
                    onClose={() => setValorando(null)} />
            )}
            {cambiandoFoto && foto && (
                <AlinearFotoRocodromo foto={foto} bloques={bloquesFoto} onAsignar={asignarFotoNueva} onClose={() => setCambiandoFoto(false)} />
            )}
            {editandoDatos && (
                <RocodromoModal rocodromoEditar={rocodromo} onClose={() => setEditandoDatos(false)} onEditado={setRocodromo} />
            )}
        </div>
    );
}

const st = {
    app: { display: 'flex', flexDirection: 'column', height: '100dvh', fontFamily: "'Segoe UI', Tahoma, sans-serif", background: '#f4f6f8' },
    mensaje: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontFamily: 'sans-serif', color: '#7f8c8d', padding: 20, textAlign: 'center' },
    topbar: { background: '#2c3e50', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 },
    btnIcono: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' },
    btnBarra: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
    scroll: { flex: 1, overflowY: 'auto', padding: 16 },
    pestanas: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, maxWidth: 1280, marginInline: 'auto' },
    pestana: { padding: '6px 12px', background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 16, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'bold' },
    pestanaActiva: { background: '#2c3e50', color: 'white', borderColor: '#2c3e50' },
    vacio: { color: '#7f8c8d', fontStyle: 'italic', textAlign: 'center', padding: 24 },
    aviso: { background: '#eaf4fb', color: '#2980b9', borderRadius: 8, padding: '10px 12px', fontSize: '0.88rem', marginBottom: 10 },
    btnNuevo: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, background: '#3498db', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', marginBottom: 10 },
    leyenda: { display: 'flex', gap: 12, fontSize: '0.78rem', color: '#555', marginBottom: 10, flexWrap: 'wrap' },
    bloque: { display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '2px solid #ecf0f1', borderRadius: 10, padding: 8, marginBottom: 8 },
    bloqueInfo: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.92rem' },
    grado: { background: '#2c3e50', color: 'white', borderRadius: 7, padding: '5px 8px', fontWeight: 'bold', fontSize: '0.85rem', flexShrink: 0 },
    btnFila: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer', padding: 5, display: 'flex' },
    btnHecho: { display: 'flex', alignItems: 'center', gap: 3, padding: '6px 8px', background: 'white', color: '#7f8c8d', border: '1px solid #bdc3c7', borderRadius: 7, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 'bold' },
    btnHechoActivo: { background: '#27ae60', color: 'white', borderColor: '#27ae60' },
    editor: { position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', flexDirection: 'column', background: '#ecf0f1' },
    herramientas: { background: 'white', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.12)' },
    fila: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    input: { padding: '7px 10px', border: '2px solid #bdc3c7', borderRadius: 7, fontSize: '0.9rem', color: '#2c3e50', outline: 'none' },
    btnTipo: { flex: 1, padding: '7px 4px', border: '3px solid', borderRadius: 8, fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' },
    etiqueta: { display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', fontWeight: 'bold', color: '#34495e' },
    btnCuadrado: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 32, height: 32, background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 7, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 'bold' },
    // Margen inferior: el asa de una presa cerca del borde queda fuera de la foto
    masDatos: { display: 'flex', flexDirection: 'column', gap: 6, background: '#f8f9fa', borderRadius: 8, padding: 8 },
    tarjetaBloque: { display: 'flex', alignItems: 'center', gap: 6, background: 'white', borderRadius: 10, padding: '8px 6px', marginBottom: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', minHeight: 54 },
    btnFlecha: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 44, background: '#f4f6f8', color: '#2c3e50', border: 'none', borderRadius: 8, cursor: 'pointer', flexShrink: 0 },
    gradoTarjeta: { background: '#2c3e50', color: 'white', borderRadius: 7, padding: '3px 8px', fontWeight: 'bold', fontSize: '0.85rem', flexShrink: 0 },
    observacion: { fontSize: '0.8rem', color: '#34495e', marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
    lienzoScroll: { flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: DISTANCIA_ASA + 30 },
    error: { background: '#fdecea', color: '#c0392b', padding: '6px 10px', borderRadius: 7, fontSize: '0.84rem' },
};
