import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import {
    collection, onSnapshot, query, where,
    orderBy, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Bell, X, Unlink } from 'lucide-react';
import { DesvincularCroquisModal } from './AsociacionEscuela';
import RevisarPropuestaModal from './RevisarPropuestaModal';
import RevisarPropuestaCroquisModal from './RevisarPropuestaCroquisModal';
import { esAdmin, responderVinculo } from '../utils/equipadores';
import { TIPOS_NOTIF_ENTRENO, COL_BLOQUES, COL_INVITACIONES } from '../utils/entrenador';

const TIPOS_EQUIPADOR = ['equipador_vinculado', 'equipador_rechazado'];

export default function NotificacionesCampana({ onVerCroquis, onDesvinculado, onPropuestaAplicada, onVerEquipador, onVerRocodromo }) {
    const { usuario } = useAuth();
    const [notifs, setNotifs] = useState([]);
    const [abierto, setAbierto] = useState(false);
    const [desvinculando, setDesvinculando] = useState(null);
    const [propuestas, setPropuestas] = useState([]);
    const [revisando, setRevisando] = useState(null);
    const [propuestasCroquis, setPropuestasCroquis] = useState([]);
    const [revisandoCroquis, setRevisandoCroquis] = useState(null);
    const panelRef = useRef();

    useEffect(() => {
        if (!usuario) return;
        const q = query(
            collection(db, 'notificaciones', usuario.uid, 'items'),
            orderBy('createdAt', 'desc')
        );
        return onSnapshot(q, snap =>
            setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
    }, [usuario?.uid]);

    // Propuestas de cambios enviadas desde tarjetas de vía, pendientes de revisar
    useEffect(() => {
        if (!usuario) return;
        const q = query(collection(db, 'propuestas_via'), where('paraUid', '==', usuario.uid), where('estado', '==', 'pendiente'));
        return onSnapshot(q, snap => setPropuestas(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.error(e));
    }, [usuario?.uid]);

    // Propuestas enviadas desde el enlace de sugerencias de un croquis entero
    useEffect(() => {
        if (!usuario) return;
        const q = query(collection(db, 'propuestas_croquis'), where('paraUid', '==', usuario.uid), where('estado', '==', 'pendiente'));
        return onSnapshot(q, snap => setPropuestasCroquis(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.error(e));
    }, [usuario?.uid]);

    // La administración revisa quién pide gestionar una ficha de equipador
    const [vinculos, setVinculos] = useState([]);
    const admin = esAdmin(usuario);
    useEffect(() => {
        if (!admin) return;
        const q = query(collection(db, 'equipadores'), where('vinculoPendiente', '==', true));
        return onSnapshot(q, snap => setVinculos(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.error(e));
    }, [admin]);

    // La administración revisa los bloques de entrenamiento que proponen los entrenadores
    const [bloquesPendientes, setBloquesPendientes] = useState([]);
    useEffect(() => {
        if (!admin) return;
        const q = query(collection(db, COL_BLOQUES), where('estado', '==', 'pendiente'));
        return onSnapshot(q, snap => setBloquesPendientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.error(e));
    }, [admin]);

    // Planes que un entrenador ha preparado para este usuario
    const [invitacionesPlan, setInvitacionesPlan] = useState([]);
    useEffect(() => {
        const email = usuario?.email?.toLowerCase();
        if (!email) return;
        const q = query(collection(db, COL_INVITACIONES), where('atletaEmail', '==', email), where('estado', '==', 'pendiente'));
        return onSnapshot(q, snap => setInvitacionesPlan(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.error(e));
    }, [usuario?.email]);

    const responder = async (eq, aceptar, e) => {
        e.stopPropagation();
        try { await responderVinculo(eq, aceptar, usuario); } catch (err) { alert('No se pudo completar: ' + err.message); }
    };

    useEffect(() => {
        const handler = (e) => {
            if (!panelRef.current?.contains(e.target)) setAbierto(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (!usuario) return null;

    const noLeidas = notifs.filter(n => !n.leido).length + propuestas.length + propuestasCroquis.length + vinculos.length + bloquesPendientes.length + invitacionesPlan.length;

    const marcarLeida = async (n) => {
        await updateDoc(doc(db, 'notificaciones', usuario.uid, 'items', n.id), { leido: true });
        setAbierto(false);
        if (TIPOS_EQUIPADOR.includes(n.tipo)) onVerEquipador?.(n.equipadorId);
        else if (n.tipo === 'bloque_nuevo') onVerRocodromo?.(n.rocodromoId, n.bloqueId);
        else if (TIPOS_NOTIF_ENTRENO[n.tipo]) window.location.hash = TIPOS_NOTIF_ENTRENO[n.tipo];
        else onVerCroquis?.(n.croquisId);
    };

    const eliminar = async (id, e) => {
        e.stopPropagation();
        await deleteDoc(doc(db, 'notificaciones', usuario.uid, 'items', id));
    };

    const abrirDesvincular = async (n, e) => {
        e.stopPropagation();
        setAbierto(false);
        setDesvinculando(n);
        if (!n.leido) await updateDoc(doc(db, 'notificaciones', usuario.uid, 'items', n.id), { leido: true });
    };

    const formatFecha = (ts) => {
        if (!ts?.toDate) return '';
        return ts.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    };

    return (
        <div ref={panelRef} style={{ position: 'relative' }}>
            <button onClick={() => setAbierto(a => !a)} style={st.btn} title="Notificaciones">
                <Bell size={20} />
                {noLeidas > 0 && <span style={st.badge}>{noLeidas > 9 ? '9+' : noLeidas}</span>}
            </button>

            {abierto && (
                <div className="panel-notificaciones" style={st.panel}>
                    <div style={st.panelHeader}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Notificaciones</span>
                        {notifs.length > 0 && (
                            <span style={{ fontSize: '0.78rem', color: '#7f8c8d' }}>{noLeidas} sin leer</span>
                        )}
                    </div>

                    {propuestas.map(pr => (
                        <div key={pr.id} onClick={() => { setAbierto(false); setRevisando(pr); }} style={{ ...st.item, background: '#fff8e1' }}>
                            <div style={{ ...st.punto, background: '#f39c12' }} />
                            <div style={st.itemCuerpo}>
                                <div style={st.itemTitulo}><strong>{pr.autorNombre}</strong> propone cambios en <em>{pr.cambios?.info?.nombre || 'una vía'}</em></div>
                                <div style={st.itemPreview}>Pulsa para revisar y aceptar o rechazar</div>
                            </div>
                        </div>
                    ))}
                    {propuestasCroquis.map(pr => (
                        <div key={pr.id} onClick={() => { setAbierto(false); setRevisandoCroquis(pr); }} style={{ ...st.item, background: '#fff8e1' }}>
                            <div style={{ ...st.punto, background: '#f39c12' }} />
                            <div style={st.itemCuerpo}>
                                <div style={st.itemTitulo}><strong>{pr.autorNombre}</strong> propone {pr.cambios?.length || 0} cambio(s) en un croquis</div>
                                <div style={st.itemPreview}>{(pr.cambios || []).map(c => c.info?.nombre).filter(Boolean).join(', ') || 'Pulsa para revisar'}</div>
                            </div>
                        </div>
                    ))}
                    {vinculos.map(eq => (
                        <div key={eq.id} onClick={() => { setAbierto(false); onVerEquipador?.(eq.id); }} style={{ ...st.item, background: '#fff8e1' }}>
                            <div style={{ ...st.punto, background: '#f39c12' }} />
                            <div style={st.itemCuerpo}>
                                <div style={st.itemTitulo}>
                                    <strong>{eq.solicitudVinculo?.nombre || eq.solicitudVinculo?.email}</strong> pide gestionar la ficha de equipador <em>{eq.nombre}</em>
                                </div>
                                {eq.solicitudVinculo?.email && <div style={st.itemPreview}>{eq.solicitudVinculo.email}</div>}
                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                    <button onClick={(e) => responder(eq, true, e)} style={{ ...st.btnDesvincular, color: '#27ae60', borderColor: '#27ae60' }}>Aprobar</button>
                                    <button onClick={(e) => responder(eq, false, e)} style={st.btnDesvincular}>Rechazar</button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {invitacionesPlan.map(inv => (
                        <div key={inv.id} onClick={() => { setAbierto(false); window.location.hash = '#/entrenamiento'; }} style={{ ...st.item, background: '#f5eef8' }}>
                            <div style={{ ...st.punto, background: '#8e44ad' }} />
                            <div style={st.itemCuerpo}>
                                <div style={st.itemTitulo}><strong>{inv.entrenadorNombre}</strong> te ha preparado el plan <em>{inv.plan?.nombre}</em></div>
                                <div style={st.itemPreview}>Pulsa para verlo y empezarlo</div>
                            </div>
                        </div>
                    ))}
                    {bloquesPendientes.map(b => (
                        <div key={b.id} onClick={() => { setAbierto(false); window.location.hash = '#/entrenamiento/catalogo'; }} style={{ ...st.item, background: '#fff8e1' }}>
                            <div style={{ ...st.punto, background: '#f39c12' }} />
                            <div style={st.itemCuerpo}>
                                <div style={st.itemTitulo}><strong>{b.autorNombre}</strong> propone el bloque de entrenamiento <em>{b.nombre}</em></div>
                                <div style={st.itemPreview}>Pulsa para revisarlo y aprobarlo o rechazarlo</div>
                            </div>
                        </div>
                    ))}
                    {notifs.length === 0 && propuestas.length === 0 && propuestasCroquis.length === 0 && vinculos.length === 0 && bloquesPendientes.length === 0 && invitacionesPlan.length === 0 ? (
                        <p style={st.vacio}>Sin notificaciones.</p>
                    ) : (
                        notifs.map(n => (
                            <div
                                key={n.id}
                                onClick={() => marcarLeida(n)}
                                style={{ ...st.item, background: n.leido ? 'white' : '#eef6ff' }}
                            >
                                {!n.leido && <div style={st.punto} />}
                                <div style={st.itemCuerpo}>
                                    <div style={st.itemTitulo}>
                                        {n.tipo === 'croquis_asociado' && <><strong>{n.autorNombre}</strong> añadió <em>{n.croquisNombre}</em> a tu escuela <em>{n.escuelaNombre}</em></>}
                                        {n.tipo === 'croquis_desvinculado' && <><strong>{n.autorNombre}</strong> desvinculó <em>{n.croquisNombre}</em> de <em>{n.escuelaNombre}</em></>}
                                        {n.tipo === 'equipador_vinculado' && <>Ya gestionas tu ficha de equipador <em>{n.equipadorNombre}</em></>}
                                        {n.tipo === 'equipador_rechazado' && <>Se rechazó tu solicitud para gestionar la ficha <em>{n.equipadorNombre}</em></>}
                                        {n.tipo === 'bloque_nuevo' && <><strong>{n.autorNombre}</strong> creó el bloque <em>{n.bloqueNombre}</em> ({n.bloqueGrado}) en <em>{n.rocodromoNombre}</em></>}
                                        {n.tipo === 'entreno_sesion' && <><strong>{n.autorNombre}</strong> registró la sesión <em>{n.sesionNombre}</em></>}
                                        {n.tipo === 'entreno_aceptado' && <><strong>{n.autorNombre}</strong> ha aceptado tu plan</>}
                                        {n.tipo === 'entreno_entrenador' && <>Tu entrenador <strong>{n.autorNombre}</strong> ha cambiado tu plan</>}
                                        {n.tipo === 'bloque_aprobado' && <>Se aprobó tu bloque de entrenamiento <em>{n.bloqueNombre}</em></>}
                                        {n.tipo === 'bloque_rechazado' && <>Se rechazó tu bloque de entrenamiento <em>{n.bloqueNombre}</em></>}
                                        {n.tipo !== 'croquis_asociado' && n.tipo !== 'croquis_desvinculado' && n.tipo !== 'bloque_nuevo' && !TIPOS_EQUIPADOR.includes(n.tipo) && !TIPOS_NOTIF_ENTRENO[n.tipo] && <><strong>{n.autorNombre}</strong> comentó en <em>{n.croquisNombre}</em></>}
                                    </div>
                                    {n.tipo === 'croquis_desvinculado'
                                        ? <div style={st.itemMotivo}>«{n.textoPreview}»</div>
                                        : n.textoPreview && <div style={st.itemPreview}>{n.textoPreview}</div>}
                                    {n.tipo === 'croquis_asociado' && (
                                        <button onClick={(e) => abrirDesvincular(n, e)} style={st.btnDesvincular}>
                                            <Unlink size={12} /> Desvincular
                                        </button>
                                    )}
                                    <div style={st.itemFecha}>{formatFecha(n.createdAt)}</div>
                                </div>
                                <button onClick={(e) => eliminar(n.id, e)} style={st.btnX} title="Descartar">
                                    <X size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}

            {revisando && (
                <RevisarPropuestaModal propuesta={revisando} onClose={() => setRevisando(null)}
                    onAplicada={(aceptada) => { if (aceptada) onPropuestaAplicada?.(); }} />
            )}

            {revisandoCroquis && (
                <RevisarPropuestaCroquisModal propuesta={revisandoCroquis} onClose={() => setRevisandoCroquis(null)}
                    onAplicada={(aceptada) => { if (aceptada) onPropuestaAplicada?.(); }} />
            )}

            {desvinculando && (
                <DesvincularCroquisModal
                    croquisId={desvinculando.croquisId}
                    croquisNombre={desvinculando.croquisNombre}
                    escuela={{ id: desvinculando.escuelaId, nombre: desvinculando.escuelaNombre }}
                    onClose={() => setDesvinculando(null)}
                    onDesvinculado={onDesvinculado}
                />
            )}
        </div>
    );
}

const st = {
    btn: { position: 'relative', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' },
    badge: { position: 'absolute', top: 2, right: 2, background: '#e74c3c', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: '0.68rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    panel: { position: 'absolute', top: '110%', right: 0, width: 320, maxWidth: 'calc(100vw - 24px)', maxHeight: '70vh', overflowY: 'auto', background: 'white', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.15)', zIndex: 3000, overflow: 'hidden', border: '1px solid #ecf0f1' },
    panelHeader: { padding: '12px 16px', borderBottom: '1px solid #ecf0f1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8f9fa' },
    vacio: { padding: '20px 16px', color: '#95a5a6', fontSize: '0.88rem', textAlign: 'center', margin: 0 },
    item: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s' },
    punto: { width: 8, height: 8, borderRadius: '50%', background: '#3498db', flexShrink: 0, marginTop: 6 },
    itemCuerpo: { flex: 1, minWidth: 0 },
    itemTitulo: { fontSize: '0.85rem', color: '#2c3e50', marginBottom: 3 },
    itemPreview: { fontSize: '0.8rem', color: '#7f8c8d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    itemMotivo: { fontSize: '0.8rem', color: '#555', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
    btnDesvincular: { display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, padding: '3px 8px', background: 'white', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' },
    itemFecha: { fontSize: '0.75rem', color: '#bdc3c7', marginTop: 4 },
    btnX: { background: 'none', border: 'none', color: '#bdc3c7', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex', alignItems: 'center' },
};
