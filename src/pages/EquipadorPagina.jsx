import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Edit, Plus, X, Search, EyeOff } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    esDeEquipador, fotosDeCroquis, nombreEquipador, esMiEquipador, esAdmin, puedeVerEquipador,
    puedeEditarCroquis, cambiarViaComoEquipador, solicitarVinculo, cancelarSolicitudVinculo,
    responderVinculo, guardarPreferenciasEquipador, desvincularEquipador,
} from '../utils/equipadores';
import { normalizarNombre } from '../utils/escuelas';
import { useAccesoDirecto } from '../utils/accesoDirecto';
import BotonAccesoDirecto from '../components/BotonAccesoDirecto';
import { GradeSelector } from '../CroquisEscalada';

const ubicacion = (c) => [c.infoCroquis?.escuela, c.infoCroquis?.sector].filter(Boolean).join(' · ') || 'Sin ubicación';

export default function EquipadorPagina({ equipadorId, onVolver, onVerCroquis }) {
    const { usuario, setModalAuth } = useAuth();
    const [equipador, setEquipador] = useState(null);
    const [croquis, setCroquis] = useState([]);
    const [pendientes, setPendientes] = useState(new Set()); // viaIds con propuesta mía pendiente
    const [cargando, setCargando] = useState(true);
    const [editando, setEditando] = useState(null); // { via, croquis }
    const [anadiendo, setAnadiendo] = useState(false);
    const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'error', texto }

    const cargar = useCallback(async () => {
        try {
            const snap = await getDoc(doc(db, 'equipadores', equipadorId));
            if (!snap.exists()) { setEquipador(null); return; }
            setEquipador({ id: snap.id, ...snap.data() });
            const snapCroquis = await getDocs(collection(db, 'croquis_escalada'));
            setCroquis(snapCroquis.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.visibilidad || c.visibilidad === 'publico'));
        } catch (e) { console.error(e); }
        finally { setCargando(false); }
    }, [equipadorId]);

    useEffect(() => { cargar(); }, [cargar]);

    const mia = esMiEquipador(equipador, usuario);

    const cargarPendientes = useCallback(async () => {
        if (!usuario || !mia) return;
        try {
            const snap = await getDocs(query(collection(db, 'propuestas_via'), where('autorUid', '==', usuario.uid)));
            setPendientes(new Set(snap.docs.map(d => d.data()).filter(p => p.estado === 'pendiente' && p.equipadorId === equipadorId).map(p => `${p.croquisId}/${p.viaId}`)));
        } catch (e) { console.error(e); }
    }, [usuario, mia, equipadorId]);

    useEffect(() => { cargarPendientes(); }, [cargarPendientes]);

    useAccesoDirecto(equipador && puedeVerEquipador(equipador, usuario) ? nombreEquipador(equipador) : null);

    const vias = croquis.flatMap(c => fotosDeCroquis(c).flatMap(f => (f.vias || [])
        .filter(v => esDeEquipador(v.info, equipador || {}))
        .map(v => ({ via: v, croquis: c }))));

    const accion = async (fn, textoOk) => {
        setAviso(null);
        try {
            await fn();
            if (textoOk) setAviso({ tipo: 'ok', texto: textoOk });
            await cargar();
        } catch (e) { setAviso({ tipo: 'error', texto: 'No se pudo completar: ' + e.message }); }
    };

    const cambiarVia = async (item, cambiosInfo) => {
        const r = await cambiarViaComoEquipador({ equipador, usuario, croquis: item.croquis, via: item.via, cambiosInfo });
        setAviso({ tipo: 'ok', texto: r === 'aplicado' ? 'Vía actualizada.' : 'Propuesta enviada a quien creó el croquis. Se aplicará cuando la acepte.' });
        await Promise.all([cargar(), cargarPendientes()]);
    };

    if (cargando) return <div style={st.mensaje}>Cargando…</div>;
    if (!equipador || !puedeVerEquipador(equipador, usuario)) {
        return (
            <div style={st.mensaje}>
                <p>{equipador ? 'Este equipador ha ocultado su ficha.' : 'Este equipador no existe.'}</p>
                <button onClick={onVolver} style={st.btnVolver}>Volver</button>
            </div>
        );
    }

    const solicitud = equipador.vinculoPendiente ? equipador.solicitudVinculo : null;
    const nombre = nombreEquipador(equipador);

    return (
        <div style={st.app}>
            <div style={st.topbar}>
                <button onClick={onVolver} style={st.btnIcono} title="Volver"><ArrowLeft size={20} /></button>
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'white', fontWeight: 'bold', overflowWrap: 'anywhere' }}>
                        🔩 {nombre}
                        {equipador.usuarioUid && <span title="Ficha gestionada por el propio equipador" style={st.verificado}>✔</span>}
                        {equipador.oculto && <span style={st.etiquetaOculta}><EyeOff size={12} /> Oculta</span>}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{vias.length} {vias.length === 1 ? 'vía equipada' : 'vías equipadas'}</div>
                </div>
                <div style={{ flex: 1 }} />
                {!equipador.oculto && <BotonAccesoDirecto nombre={nombre} estilo={st.btnIcono} />}
            </div>
            <div style={st.scroll}>
                <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {aviso && <div style={aviso.tipo === 'ok' ? st.ok : st.error}>{aviso.texto}</div>}

                    {mia && <PanelMiFicha equipador={equipador}
                        onGuardar={(prefs) => accion(() => guardarPreferenciasEquipador(equipador, prefs), 'Preferencias guardadas.')}
                        onDesvincular={() => window.confirm('¿Dejar de gestionar esta ficha? Las vías seguirán asociadas a ella.')
                            && accion(() => desvincularEquipador(equipador), 'Has dejado de gestionar esta ficha.')} />}

                    {!equipador.usuarioUid && (
                        <PanelVinculo equipador={equipador} usuario={usuario} solicitud={solicitud}
                            onPedirLogin={() => setModalAuth(true)}
                            onSolicitar={() => accion(() => solicitarVinculo(equipador, usuario), 'Solicitud enviada. Te avisaremos cuando se revise.')}
                            onCancelar={() => accion(() => cancelarSolicitudVinculo(equipador), 'Solicitud cancelada.')}
                            onResponder={(aceptar) => accion(() => responderVinculo(equipador, aceptar, usuario), aceptar ? 'Ficha vinculada al usuario.' : 'Solicitud rechazada.')} />
                    )}

                    <div style={st.lista}>
                        {mia && (
                            <button onClick={() => setAnadiendo(true)} style={st.btnAnadir}><Plus size={16} /> Añadir una vía que equipé</button>
                        )}
                        {vias.length === 0 && <div style={{ color: '#7f8c8d', fontStyle: 'italic', textAlign: 'center', padding: 24 }}>Aún no hay vías públicas de este equipador.</div>}
                        {vias.map(item => {
                            const { via, croquis: c } = item;
                            const pendiente = pendientes.has(`${c.id}/${via.id}`);
                            return (
                                <div key={`${c.id}-${via.id}`} style={st.fila}>
                                    <button onClick={() => onVerCroquis(c)} style={st.filaPrincipal}>
                                        <span style={{ ...st.grado, background: via.color || '#2c3e50' }}>{via.info?.grado || '?'}</span>
                                        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                            <strong style={{ overflowWrap: 'anywhere' }}>{via.info?.nombre}</strong>
                                            <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d' }}>
                                                {ubicacion(c)}{via.info?.anio ? ` · ${via.info.anio}` : ''}
                                            </span>
                                        </span>
                                    </button>
                                    {pendiente && <span style={st.pendiente}>Propuesta pendiente</span>}
                                    {mia && (
                                        <button onClick={() => setEditando(item)} style={st.btnEditar} title="Editar vía"><Edit size={15} /></button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {editando && (
                <EditarViaModal item={editando} directo={puedeEditarCroquis(editando.croquis, usuario)}
                    onClose={() => setEditando(null)}
                    onGuardar={async (cambios) => { await cambiarVia(editando, cambios); setEditando(null); }} />
            )}
            {anadiendo && (
                <AnadirViaModal equipador={equipador} croquis={croquis} usuario={usuario} pendientes={pendientes}
                    onClose={() => setAnadiendo(false)}
                    onAnadir={(item) => cambiarVia(item, {})} />
            )}
        </div>
    );
}

// Lo que decide el equipador sobre su propia ficha
function PanelMiFicha({ equipador, onGuardar, onDesvincular }) {
    const [nombreVisible, setNombreVisible] = useState(equipador.nombreVisible || '');
    const [oculto, setOculto] = useState(Boolean(equipador.oculto));
    const [guardando, setGuardando] = useState(false);
    const cambiado = nombreVisible.trim() !== (equipador.nombreVisible || '') || oculto !== Boolean(equipador.oculto);

    const guardar = async () => {
        setGuardando(true);
        await onGuardar({ nombreVisible, oculto });
        setGuardando(false);
    };

    return (
        <div style={st.panel}>
            <div style={st.panelTitulo}>Tu ficha de equipador</div>
            <label style={st.label}>Nombre con el que apareces</label>
            <input value={nombreVisible} onChange={e => setNombreVisible(e.target.value)} maxLength={60}
                placeholder={equipador.nombre} style={st.input} />
            <p style={st.ayuda}>Si lo dejas vacío aparecerás como «{equipador.nombre}».</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontSize: '0.9rem', color: '#2c3e50' }}>
                <input type="checkbox" checked={oculto} onChange={e => setOculto(e.target.checked)} />
                Ocultar mi ficha
            </label>
            <p style={st.ayuda}>Oculta, tu ficha no aparece en la lista de equipadores y nadie más puede abrirla. En las vías se mostrará el nombre sin enlace.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={guardar} disabled={!cambiado || guardando} style={{ ...st.btnPrimario, opacity: cambiado ? 1 : 0.5 }}>
                    {guardando ? 'Guardando…' : 'Guardar'}
                </button>
                <button onClick={onDesvincular} style={st.btnSecundario}>Dejar de gestionar la ficha</button>
            </div>
        </div>
    );
}

// Asociar la ficha a un usuario: el usuario lo solicita y la administración lo aprueba
function PanelVinculo({ equipador, usuario, solicitud, onPedirLogin, onSolicitar, onCancelar, onResponder }) {
    if (solicitud && esAdmin(usuario)) {
        return (
            <div style={{ ...st.panel, background: '#fff8e1' }}>
                <div style={st.panelTitulo}>Solicitud de vinculación</div>
                <p style={{ margin: '4px 0 10px', fontSize: '0.9rem' }}>
                    <strong>{solicitud.nombre || solicitud.email}</strong>{solicitud.nombre && solicitud.email ? ` (${solicitud.email})` : ''} dice ser «{equipador.nombre}».
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => onResponder(false)} style={st.btnSecundario}>Rechazar</button>
                    <button onClick={() => onResponder(true)} style={st.btnPrimario}>Aprobar</button>
                </div>
            </div>
        );
    }
    if (solicitud && solicitud.uid === usuario?.uid) {
        return (
            <div style={st.panel}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Has solicitado gestionar esta ficha. Te avisaremos cuando se revise.</p>
                <button onClick={onCancelar} style={{ ...st.btnSecundario, marginTop: 10 }}>Cancelar solicitud</button>
            </div>
        );
    }
    if (solicitud) return null;
    return (
        <div style={st.panel}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
                ¿Eres {equipador.nombre}? Vincula esta ficha a tu cuenta para elegir cómo apareces, ocultarla y mantener al día tus vías.
            </p>
            <button onClick={usuario ? onSolicitar : onPedirLogin} style={{ ...st.btnPrimario, marginTop: 10 }}>
                {usuario ? 'Soy yo, solicitar gestionarla' : 'Inicia sesión para reclamarla'}
            </button>
        </div>
    );
}

function EditarViaModal({ item, directo, onClose, onGuardar }) {
    const info = item.via.info || {};
    const [nombre, setNombre] = useState(info.nombre || '');
    const [grado, setGrado] = useState(info.grado || '');
    const [numero, setNumero] = useState(info.numero || '');
    const [anio, setAnio] = useState(info.anio || '');
    const [infoExtra, setInfoExtra] = useState(info.info || '');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    const guardar = async () => {
        if (!nombre.trim()) { setError('La vía necesita un nombre.'); return; }
        setGuardando(true);
        setError('');
        try {
            await onGuardar({ nombre: nombre.trim(), grado, numero: numero.trim(), anio: String(anio).trim(), info: infoExtra.trim() });
        } catch (e) {
            setError('No se pudo guardar: ' + e.message);
            setGuardando(false);
        }
    };

    return (
        <Modal titulo="Editar vía" onClose={onClose}>
            <p style={st.ayuda}>{ubicacion(item.croquis)}</p>
            {error && <div style={st.error}>{error}</div>}
            <label style={st.label}>Nombre de la vía</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} style={st.input} />
            <label style={st.label}>Grado</label>
            <GradeSelector value={grado} onChange={setGrado} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                    <label style={st.label}>Número en la pared</label>
                    <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ej: 7a" style={st.input} />
                </div>
                <div>
                    <label style={st.label}>Año</label>
                    <input type="number" value={anio} onChange={e => setAnio(e.target.value)} placeholder="Ej: 2018" style={st.input} />
                </div>
            </div>
            <label style={st.label}>Información adicional</label>
            <textarea value={infoExtra} onChange={e => setInfoExtra(e.target.value)} rows={3} style={{ ...st.input, resize: 'vertical', fontFamily: 'inherit' }} />
            <p style={st.ayuda}>{directo ? 'Puedes editar este croquis: el cambio se aplica al momento.' : 'El croquis es de otra persona: le llegará como propuesta y se aplicará cuando la acepte.'}</p>
            <button onClick={guardar} disabled={guardando} style={{ ...st.btnPrimario, width: '100%', marginTop: 6 }}>
                {guardando ? 'Guardando…' : directo ? 'Guardar' : 'Enviar propuesta'}
            </button>
        </Modal>
    );
}

// Buscar entre las vías públicas las que equipó y aún no figuran en su ficha
function AnadirViaModal({ equipador, croquis, usuario, pendientes, onClose, onAnadir }) {
    const [busqueda, setBusqueda] = useState('');
    const [procesando, setProcesando] = useState(null);
    const [hechas, setHechas] = useState(new Set());
    const [error, setError] = useState('');

    const texto = normalizarNombre(busqueda);
    const candidatas = texto.length < 2 ? [] : croquis
        .flatMap(c => fotosDeCroquis(c).flatMap(f => (f.vias || []).map(v => ({ via: v, croquis: c }))))
        .filter(({ via, croquis: c }) => via.info?.nombre && !esDeEquipador(via.info, equipador)
            && [via.info.nombre, c.infoCroquis?.escuela, c.infoCroquis?.sector].some(s => normalizarNombre(s).includes(texto)))
        .slice(0, 40);

    const anadir = async (item) => {
        const clave = `${item.croquis.id}/${item.via.id}`;
        setProcesando(clave);
        setError('');
        try {
            await onAnadir(item);
            setHechas(prev => new Set(prev).add(clave));
        } catch (e) { setError('No se pudo completar: ' + e.message); }
        setProcesando(null);
    };

    return (
        <Modal titulo="Añadir una vía que equipé" onClose={onClose}>
            <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 10, top: 12, color: '#95a5a6' }} />
                <input autoFocus value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre de la vía, escuela o sector" style={{ ...st.input, paddingLeft: 34 }} />
            </div>
            <p style={st.ayuda}>Si el croquis es de otra persona, le llegará una propuesta para ponerte como equipador.</p>
            {error && <div style={st.error}>{error}</div>}
            <div style={{ marginTop: 8 }}>
                {texto.length >= 2 && candidatas.length === 0 && <p style={{ color: '#7f8c8d', fontSize: '0.88rem', textAlign: 'center' }}>No hay vías que coincidan.</p>}
                {candidatas.map(item => {
                    const { via, croquis: c } = item;
                    const clave = `${c.id}/${via.id}`;
                    const directo = puedeEditarCroquis(c, usuario);
                    const estado = hechas.has(clave) ? (directo ? 'Añadida' : 'Propuesta enviada') : pendientes.has(clave) ? 'Propuesta pendiente' : null;
                    return (
                        <div key={clave} style={{ ...st.fila, padding: '8px 4px' }}>
                            <span style={{ ...st.grado, background: via.color || '#2c3e50' }}>{via.info?.grado || '?'}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <strong style={{ overflowWrap: 'anywhere' }}>{via.info.nombre}</strong>
                                <span style={{ display: 'block', fontSize: '0.78rem', color: '#7f8c8d' }}>
                                    {ubicacion(c)}{via.info?.equipador ? ` · Equipador: ${via.info.equipador}` : ''}
                                </span>
                            </span>
                            {estado
                                ? <span style={st.pendiente}>{estado}</span>
                                : <button onClick={() => anadir(item)} disabled={procesando === clave} style={{ ...st.btnPrimario, padding: '6px 10px', fontSize: '0.8rem' }}>
                                    {procesando === clave ? '…' : directo ? 'Añadir' : 'Proponer'}
                                </button>}
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}

function Modal({ titulo, onClose, children }) {
    return (
        <div style={st.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={st.modal}>
                <div style={st.modalHeader}>
                    <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '1.05rem' }}>{titulo}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' }}><X size={20} /></button>
                </div>
                <div style={{ padding: 18, overflowY: 'auto' }}>{children}</div>
            </div>
        </div>
    );
}

const st = {
    app: { display: 'flex', flexDirection: 'column', height: '100dvh', fontFamily: "'Segoe UI', Tahoma, sans-serif", background: '#f4f6f8' },
    mensaje: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontFamily: 'sans-serif', color: '#7f8c8d', padding: 20, textAlign: 'center' },
    btnVolver: { marginTop: 12, padding: '9px 16px', background: '#2c3e50', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
    topbar: { background: '#2c3e50', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
    btnIcono: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex' },
    verificado: { marginLeft: 6, color: '#2ecc71', fontSize: '0.9rem' },
    etiquetaOculta: { marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 6, padding: '1px 6px', fontSize: '0.72rem', fontWeight: 'normal' },
    scroll: { flex: 1, overflowY: 'auto', padding: 16 },
    lista: { background: 'white', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
    panel: { background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', color: '#2c3e50' },
    panelTitulo: { fontWeight: 'bold', fontSize: '0.95rem', marginBottom: 4 },
    fila: { display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #ecf0f1', color: '#2c3e50' },
    filaPrincipal: { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, padding: '10px 8px', background: 'none', border: 'none', color: '#2c3e50', cursor: 'pointer', fontSize: '0.95rem' },
    grado: { color: 'white', borderRadius: 7, padding: '5px 8px', fontWeight: 'bold', fontSize: '0.85rem', flexShrink: 0, minWidth: 38, textAlign: 'center' },
    pendiente: { background: '#fff3cd', color: '#8a6d00', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', fontWeight: 'bold', flexShrink: 0 },
    btnEditar: { background: '#f39c12', color: 'white', border: 'none', borderRadius: 7, padding: '7px 9px', cursor: 'pointer', display: 'flex', flexShrink: 0, marginRight: 4 },
    btnAnadir: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: 10, marginBottom: 6, background: '#eafaf1', color: '#1e8449', border: '2px dashed #27ae60', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' },
    btnPrimario: { padding: '9px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
    btnSecundario: { padding: '9px 16px', background: '#f0f0f0', color: '#c0392b', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
    label: { display: 'block', fontWeight: 'bold', color: '#34495e', margin: '12px 0 6px', fontSize: '0.88rem' },
    input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '2px solid #bdc3c7', borderRadius: 8, fontSize: '1rem', color: '#2c3e50', outline: 'none' },
    ayuda: { color: '#7f8c8d', fontSize: '0.78rem', margin: '6px 0' },
    ok: { background: '#eafaf1', color: '#1e8449', padding: '9px 12px', borderRadius: 8, fontSize: '0.88rem' },
    error: { background: '#fdecea', color: '#c0392b', padding: '9px 12px', borderRadius: 8, fontSize: '0.88rem' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 },
    modal: { background: 'white', width: '100%', maxWidth: 560, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' },
    modalHeader: { background: '#f8f9fa', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1', flexShrink: 0 },
};
