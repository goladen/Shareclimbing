import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, ZoomIn, ZoomOut, Edit, Info, X, Sun, Calendar, MapPin, AlertTriangle, MessageCircle, Trash2, UserPlus, Users, CheckCircle, XCircle, Shield, Mail, Share2, Printer } from 'lucide-react';
import ModalImpresion from '../components/ModalImpresion';
import { db } from '../firebase';
import { deleteDoc, doc, addDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import ComentariosCroquis from '../components/ComentariosCroquis';

const generarCurvaSuave = (puntos) => {
    if (puntos.length === 0) return "";
    if (puntos.length === 1) return `M ${puntos[0].x},${puntos[0].y}`;
    if (puntos.length === 2) return `M ${puntos[0].x},${puntos[0].y} L ${puntos[1].x},${puntos[1].y}`;
    let path = `M ${puntos[0].x},${puntos[0].y}`;
    for (let i = 0; i < puntos.length - 1; i++) {
        const p0 = puntos[Math.max(0, i - 1)];
        const p1 = puntos[i];
        const p2 = puntos[i + 1];
        const p3 = puntos[Math.min(puntos.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
};

export default function CroquisViewer({ croquis: croquisProp, onVolver, onEditar }) {
    const { usuario } = useAuth();

    // Copia local para reflejar cambios de editores sin recargar
    const [croquis, setCroquis] = useState(croquisProp);

    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [imgSize, setImgSize] = useState({ w: 800, h: 600 });
    const [viaSeleccionada, setViaSeleccionada] = useState(null);
    const [mostrarInfo, setMostrarInfo] = useState(false);
    const [mostrarComentarios, setMostrarComentarios] = useState(false);
    const [fotoIdx, setFotoIdx] = useState(0);

    // Gestión de editores
    const [modalSolicitud, setModalSolicitud] = useState(false);
    const [mensajeSolicitud, setMensajeSolicitud] = useState('');
    const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
    const [solicitudEnviada, setSolicitudEnviada] = useState(false);
    const [mostrarGestorEditores, setMostrarGestorEditores] = useState(false);
    const [solicitudesPendientes, setSolicitudesPendientes] = useState([]);
    const [invitarEmail, setInvitarEmail] = useState('');
    const [invitandoEmail, setInvitandoEmail] = useState(false);
    const [enlaceCopiado, setEnlaceCopiado] = useState(false);
    const [mostrarImpresion, setMostrarImpresion] = useState(false);
    const [mostrarCombinaciones, setMostrarCombinaciones] = useState(false);

    const contenedorRef = useRef(null);

    const esAutor = usuario?.uid === croquis.creadoPor;
    const esEditor = !esAutor && !!(usuario && (
        (croquis.editores || []).includes(usuario.uid) ||
        (croquis.editoresEmail || []).includes(usuario.email)
    ));
    const puedeEditar = esAutor || esEditor;

    // Soporte multi-foto (compatibilidad con formato antiguo)
    const fotos = croquis.fotos?.length > 0
        ? croquis.fotos
        : [{ id: 'f0', imagenUrl: croquis.imagenUrl, vias: croquis.vias || [], formas: croquis.formas || [] }];
    const fotoActual = fotos[fotoIdx] || fotos[0];

    const info = croquis.infoCroquis || {};
    const vias = fotoActual?.vias || [];
    const combinaciones = fotoActual?.combinaciones || [];
    const xRatio = (fotoActual?.srcW && imgSize.w) ? imgSize.w / fotoActual.srcW : 1;
    const yRatio = (fotoActual?.srcH && imgSize.h) ? imgSize.h / fotoActual.srcH : 1;

    useEffect(() => {
        const url = fotoActual?.imagenUrl;
        if (!url) return;
        const img = new Image();
        img.onload = () => {
            setImgSize({ w: img.width, h: img.height });
            const wScale = window.innerWidth / img.width;
            const hScale = (window.innerHeight - 120) / img.height;
            const s = Math.min(wScale, hScale, 1) * 0.9;
            setScale(s);
            setPan({ x: (window.innerWidth - img.width * s) / 2, y: 60 });
        };
        img.src = url;
    }, [fotoIdx]); // eslint-disable-line

    // Cargar solicitudes pendientes (sólo el autor)
    useEffect(() => {
        if (!esAutor || !croquis.id) return;
        const cargar = async () => {
            try {
                const q = query(
                    collection(db, 'solicitudes_edicion'),
                    where('croquisId', '==', croquis.id),
                    where('estado', '==', 'pendiente')
                );
                const snap = await getDocs(q);
                setSolicitudesPendientes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) { console.error(e); }
        };
        cargar();
    }, [esAutor, croquis.id]); // eslint-disable-line

    const handleWheel = useCallback((e) => {
        e.preventDefault();
        setScale(s => Math.min(Math.max(s * (e.deltaY > 0 ? 0.9 : 1.1), 0.1), 5));
    }, []);
    useEffect(() => {
        const el = contenedorRef.current;
        if (!el) return;
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    });
    const handlePointerDown = (e) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };
    const handlePointerMove = (e) => {
        if (isDragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handlePointerUp = () => setIsDragging(false);

    // ── Compartir enlace ──
    const compartir = () => {
        const url = `${window.location.origin}${window.location.pathname}#/croquis/${croquis.id}`;
        const titulo = [info.escuela, info.sector].filter(Boolean).join(' · ') || 'Croquis';
        if (navigator.share) {
            navigator.share({ title: titulo, url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url).then(() => {
                setEnlaceCopiado(true);
                setTimeout(() => setEnlaceCopiado(false), 2000);
            });
        }
    };

    // ── Enviar solicitud de edición ──
    const enviarSolicitud = async () => {
        if (!usuario) return;
        setEnviandoSolicitud(true);
        try {
            await addDoc(collection(db, 'solicitudes_edicion'), {
                croquisId: croquis.id,
                croquisNombre: `${info.escuela || ''}${info.sector ? ' · ' + info.sector : ''}`.trim() || 'Croquis',
                autorUid: croquis.creadoPor,
                solicitanteUid: usuario.uid,
                solicitanteEmail: usuario.email,
                solicitanteNombre: usuario.displayName || usuario.email,
                mensaje: mensajeSolicitud.trim(),
                estado: 'pendiente',
                createdAt: serverTimestamp(),
            });
            setSolicitudEnviada(true);
            setModalSolicitud(false);
            setMensajeSolicitud('');
        } catch (e) { console.error(e); }
        setEnviandoSolicitud(false);
    };

    // ── Invitar por correo (autor) ──
    const invitarEditor = async () => {
        const email = invitarEmail.trim().toLowerCase();
        if (!email || !email.includes('@')) return;
        if ((croquis.editoresEmail || []).includes(email)) {
            setInvitarEmail('');
            return;
        }
        setInvitandoEmail(true);
        try {
            await updateDoc(doc(db, 'croquis_escalada', croquis.id), {
                editoresEmail: arrayUnion(email),
            });
            setCroquis(prev => ({ ...prev, editoresEmail: [...(prev.editoresEmail || []), email] }));
            setInvitarEmail('');
        } catch (e) { console.error(e); }
        setInvitandoEmail(false);
    };

    // ── Aceptar solicitud ──
    const aceptarSolicitud = async (sol) => {
        try {
            await updateDoc(doc(db, 'croquis_escalada', croquis.id), {
                editores: arrayUnion(sol.solicitanteUid),
                editoresEmail: arrayUnion(sol.solicitanteEmail),
            });
            await updateDoc(doc(db, 'solicitudes_edicion', sol.id), { estado: 'aceptada' });
            setCroquis(prev => ({
                ...prev,
                editores: [...(prev.editores || []), sol.solicitanteUid],
                editoresEmail: [...(prev.editoresEmail || []), sol.solicitanteEmail],
            }));
            setSolicitudesPendientes(prev => prev.filter(s => s.id !== sol.id));
        } catch (e) { console.error(e); }
    };

    // ── Rechazar solicitud ──
    const rechazarSolicitud = async (sol) => {
        try {
            await updateDoc(doc(db, 'solicitudes_edicion', sol.id), { estado: 'rechazada' });
            setSolicitudesPendientes(prev => prev.filter(s => s.id !== sol.id));
        } catch (e) { console.error(e); }
    };

    // ── Quitar editor ──
    const quitarEditor = async (email, uid) => {
        try {
            const updates = {};
            if (email) updates.editoresEmail = arrayRemove(email);
            if (uid) updates.editores = arrayRemove(uid);
            await updateDoc(doc(db, 'croquis_escalada', croquis.id), updates);
            setCroquis(prev => ({
                ...prev,
                editoresEmail: (prev.editoresEmail || []).filter(e => e !== email),
                editores: uid ? (prev.editores || []).filter(u => u !== uid) : (prev.editores || []),
            }));
        } catch (e) { console.error(e); }
    };

    return (
        <div style={st.app}>
            {/* TOPBAR */}
            <div style={st.topbar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={onVolver} style={st.btnIcono} title="Volver"><ArrowLeft size={20} /></button>
                    <div>
                        <div style={{ color: 'white', fontWeight: 'bold' }}>{info.escuela || 'Croquis'}</div>
                        {info.sector && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{info.sector}</div>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => setScale(s => s * 1.2)} style={st.btnIcono}><ZoomIn size={18} /></button>
                    <button onClick={() => setScale(s => s * 0.8)} style={st.btnIcono}><ZoomOut size={18} /></button>
                    {fotos.length > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '3px 6px' }}>
                            <button onClick={() => setFotoIdx(i => Math.max(0, i - 1))} disabled={fotoIdx === 0}
                                style={{ ...st.btnIcono, padding: '4px 8px', opacity: fotoIdx === 0 ? 0.4 : 1 }}>◀</button>
                            <span style={{ color: 'white', fontSize: '0.8rem', fontWeight: 'bold' }}>{fotoIdx + 1}/{fotos.length}</span>
                            <button onClick={() => setFotoIdx(i => Math.min(fotos.length - 1, i + 1))} disabled={fotoIdx === fotos.length - 1}
                                style={{ ...st.btnIcono, padding: '4px 8px', opacity: fotoIdx === fotos.length - 1 ? 0.4 : 1 }}>▶</button>
                        </div>
                    )}
                    <button onClick={() => setMostrarInfo(true)} style={st.btnIcono}><Info size={18} /></button>
                    <button onClick={() => setMostrarComentarios(true)} style={st.btnIcono} title="Comentarios">
                        <MessageCircle size={18} />
                    </button>
                    <button onClick={() => setMostrarImpresion(true)} style={st.btnIcono} title="Imprimir / Exportar PNG">
                        <Printer size={18} />
                    </button>
                    {combinaciones.length > 0 && (
                        <button
                            onClick={() => setMostrarCombinaciones(v => !v)}
                            style={{ ...st.btnIcono, background: mostrarCombinaciones ? 'rgba(142,68,173,0.6)' : 'rgba(255,255,255,0.1)' }}
                            title={mostrarCombinaciones ? 'Ocultar combinaciones' : 'Mostrar combinaciones'}
                        >
                            <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>A/B</span>
                        </button>
                    )}
                    <button onClick={compartir} style={{ ...st.btnIcono, background: enlaceCopiado ? 'rgba(39,174,96,0.5)' : 'rgba(255,255,255,0.1)' }} title="Compartir enlace">
                        <Share2 size={18} />
                        {enlaceCopiado && <span style={{ color: 'white', fontSize: '0.78rem', marginLeft: 2 }}>Copiado</span>}
                    </button>

                    {/* Autor: eliminar */}
                    {esAutor && (
                        <button
                            onClick={async () => {
                                if (!window.confirm('¿Eliminar este croquis? Esta acción no se puede deshacer.')) return;
                                await deleteDoc(doc(db, 'croquis_escalada', croquis.id));
                                onVolver();
                            }}
                            style={{ ...st.btnIcono, background: 'rgba(231,76,60,0.5)' }}
                            title="Eliminar croquis"
                        >
                            <Trash2 size={18} />
                        </button>
                    )}

                    {/* Autor: gestionar editores */}
                    {esAutor && (
                        <button
                            onClick={() => setMostrarGestorEditores(true)}
                            style={{ ...st.btnIcono, background: solicitudesPendientes.length > 0 ? 'rgba(231,76,60,0.5)' : 'rgba(255,255,255,0.1)', position: 'relative' }}
                            title="Gestionar editores"
                        >
                            <Users size={18} />
                            {solicitudesPendientes.length > 0 && (
                                <span style={st.badge}>{solicitudesPendientes.length}</span>
                            )}
                        </button>
                    )}

                    {/* Editor: insignia */}
                    {esEditor && (
                        <div style={{ background: 'rgba(39,174,96,0.25)', border: '1px solid rgba(39,174,96,0.5)', borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.9)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Shield size={13} /> Editor
                        </div>
                    )}

                    {/* Autor o editor: botón editar */}
                    {puedeEditar && (
                        <button onClick={() => onEditar(croquis)} style={{ ...st.btnIcono, background: 'rgba(52,152,219,0.5)' }} title="Editar croquis">
                            <Edit size={18} />
                            <span style={{ color: 'white', fontSize: '0.8rem', marginLeft: 4 }}>Editar</span>
                        </button>
                    )}

                    {/* Logueado, sin permiso: solicitar edición */}
                    {usuario && !puedeEditar && !solicitudEnviada && (
                        <button onClick={() => setModalSolicitud(true)} style={{ ...st.btnIcono, background: 'rgba(155,89,182,0.45)' }} title="Solicitar permiso de edición">
                            <UserPlus size={18} />
                            <span style={{ color: 'white', fontSize: '0.8rem', marginLeft: 4 }}>Editar</span>
                        </button>
                    )}
                    {usuario && !puedeEditar && solicitudEnviada && (
                        <div style={{ background: 'rgba(39,174,96,0.25)', border: '1px solid rgba(39,174,96,0.5)', borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem' }}>
                            Solicitud enviada ✓
                        </div>
                    )}
                </div>
            </div>

            {/* VISOR */}
            <div
                ref={contenedorRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{ flex: 1, overflow: 'hidden', background: '#1e272e', position: 'relative', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
            >
                <div style={{
                    position: 'absolute', transformOrigin: '0 0',
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    width: imgSize.w, height: imgSize.h
                }}>
                    <img src={fotoActual?.imagenUrl} alt="Pared" style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />
                    <svg width={imgSize.w} height={imgSize.h} style={{ position: 'absolute', top: 0, left: 0 }}>
                        {vias.map((via, idx) => {
                            const dir = via.inicio && via.fin ? via.fin.y - via.inicio.y : -1;
                            const interOrd = [...(via.intermedios || [])].sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
                            const pts = [via.inicio, ...interOrd, via.fin].filter(Boolean)
                                .map(p => ({ x: p.x * xRatio, y: p.y * yRatio }));
                            const ix = via.inicio ? via.inicio.x * xRatio : 0;
                            const iy = via.inicio ? via.inicio.y * yRatio : 0;
                            return (
                                <g key={via.id} onClick={() => setViaSeleccionada({ ...via, num: idx + 1 })} style={{ cursor: 'pointer' }}>
                                    <path d={generarCurvaSuave(pts)} fill="none" stroke="black" strokeWidth="6" opacity="0.4" />
                                    <path d={generarCurvaSuave(pts)} fill="none" stroke={via.color} strokeWidth="4" strokeLinecap="round" />
                                    {(via.textos || []).map((txt, i) => (
                                        <TextoSvg key={i} txt={{ ...txt, x: txt.x * xRatio, y: txt.y * yRatio }} color={via.color} />
                                    ))}
                                    {via.inicio && (
                                        <>
                                            <circle cx={ix} cy={iy + 20} r="15" fill={via.color} />
                                            <text x={ix} y={iy + 25} fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">{idx + 1}</text>
                                        </>
                                    )}
                                </g>
                            );
                        })}
                        {mostrarCombinaciones && combinaciones.map((combi, idx) => {
                            const letra = String.fromCharCode(65 + idx);
                            const dir = combi.inicio && combi.fin ? combi.fin.y - combi.inicio.y : -1;
                            const interOrd = [...(combi.intermedios || [])].sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
                            const pts = [combi.inicio, ...interOrd, combi.fin].filter(Boolean)
                                .map(p => ({ x: p.x * xRatio, y: p.y * yRatio }));
                            const ix = combi.inicio ? combi.inicio.x * xRatio : 0;
                            const iy = combi.inicio ? combi.inicio.y * yRatio : 0;
                            return (
                                <g key={combi.id} onClick={() => setViaSeleccionada({ ...combi, num: letra, esCombi: true })} style={{ cursor: 'pointer' }}>
                                    <path d={generarCurvaSuave(pts)} fill="none" stroke="black" strokeWidth="6" opacity="0.4" strokeDasharray="10,6" />
                                    <path d={generarCurvaSuave(pts)} fill="none" stroke={combi.color} strokeWidth="4" strokeLinecap="round" strokeDasharray="10,6" />
                                    {(combi.textos || []).map((txt, i) => (
                                        <TextoSvg key={i} txt={{ ...txt, x: txt.x * xRatio, y: txt.y * yRatio }} color={combi.color} />
                                    ))}
                                    {combi.inicio && (
                                        <>
                                            <rect x={ix - 14} y={iy + 6} width={28} height={22} rx={5} fill={combi.color} />
                                            <text x={ix} y={iy + 22} fill="white" fontSize="15" fontWeight="bold" textAnchor="middle">{letra}</text>
                                        </>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                </div>

                {/* Leyenda lateral */}
                {(vias.length > 0 || (mostrarCombinaciones && combinaciones.length > 0)) && (
                    <div style={st.leyenda}>
                        {vias.map((v, i) => (
                            <div key={v.id} onClick={() => setViaSeleccionada({ ...v, num: i + 1 })}
                                style={{ ...st.leyendaItem, borderLeft: `4px solid ${v.color}` }}>
                                <span style={{ fontWeight: 'bold', color: v.color }}>{i + 1}</span>
                                <span style={st.leyendaNombre}>{v.info?.nombre}</span>
                                {v.info?.grado && <span style={st.leyendaGrado}>{v.info.grado}</span>}
                            </div>
                        ))}
                        {mostrarCombinaciones && combinaciones.length > 0 && (
                            <>
                                <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#8e44ad', padding: '4px 8px', borderTop: '1px solid rgba(142,68,173,0.3)', marginTop: 4 }}>Combinaciones</div>
                                {combinaciones.map((c, i) => {
                                    const letra = String.fromCharCode(65 + i);
                                    return (
                                        <div key={c.id} onClick={() => setViaSeleccionada({ ...c, num: letra, esCombi: true })}
                                            style={{ ...st.leyendaItem, borderLeft: `4px dashed ${c.color}` }}>
                                            <span style={{ fontWeight: 'bold', color: c.color }}>{letra}</span>
                                            <span style={st.leyendaNombre}>{c.info?.nombre}</span>
                                            {c.info?.grado && <span style={st.leyendaGrado}>{c.info.grado}</span>}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* MODAL: Solicitar edición */}
            {modalSolicitud && (
                <div style={st.overlay}>
                    <div style={{ ...st.modal, maxWidth: 420 }}>
                        <div style={st.modalHeader}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <UserPlus size={20} /> Solicitar permiso de edición
                            </h3>
                            <button onClick={() => setModalSolicitud(false)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={st.modalBody}>
                            <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: 14 }}>
                                El autor recibirá tu solicitud y podrá aceptarla o rechazarla.
                            </p>
                            <label style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#2c3e50', display: 'block', marginBottom: 6 }}>
                                Mensaje (opcional)
                            </label>
                            <textarea
                                value={mensajeSolicitud}
                                onChange={e => setMensajeSolicitud(e.target.value)}
                                placeholder="Ej: Hola, soy guía en esta zona y me gustaría añadir vías..."
                                style={{ width: '100%', height: 90, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, resize: 'none', fontSize: '0.88rem', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                                <button onClick={() => setModalSolicitud(false)}
                                    style={{ flex: 1, padding: '9px', background: '#f0f0f0', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
                                    Cancelar
                                </button>
                                <button onClick={enviarSolicitud} disabled={enviandoSolicitud}
                                    style={{ flex: 1, padding: '9px', background: '#9b59b6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', opacity: enviandoSolicitud ? 0.6 : 1 }}>
                                    {enviandoSolicitud ? 'Enviando…' : 'Enviar solicitud'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Gestionar editores (autor) */}
            {mostrarGestorEditores && (
                <div style={st.overlay}>
                    <div style={{ ...st.modal, maxWidth: 500, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={st.modalHeader}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Users size={20} /> Editores
                            </h3>
                            <button onClick={() => setMostrarGestorEditores(false)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={{ ...st.modalBody, overflowY: 'auto' }}>

                            {/* Solicitudes pendientes */}
                            {solicitudesPendientes.length > 0 && (
                                <div style={{ marginBottom: 22 }}>
                                    <div style={st.seccionTitulo}>
                                        Solicitudes pendientes
                                        <span style={{ background: '#e74c3c', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: '0.75rem', marginLeft: 8 }}>
                                            {solicitudesPendientes.length}
                                        </span>
                                    </div>
                                    {solicitudesPendientes.map(sol => (
                                        <div key={sol.id} style={st.solicitudCard}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '0.9rem' }}>{sol.solicitanteNombre}</div>
                                                <div style={{ color: '#7f8c8d', fontSize: '0.8rem' }}>{sol.solicitanteEmail}</div>
                                                {sol.mensaje && (
                                                    <div style={{ marginTop: 6, fontSize: '0.85rem', color: '#555', background: '#f8f9fa', borderRadius: 6, padding: '6px 8px', fontStyle: 'italic' }}>
                                                        "{sol.mensaje}"
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 10 }}>
                                                <button onClick={() => aceptarSolicitud(sol)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.82rem' }}>
                                                    <CheckCircle size={14} /> Aceptar
                                                </button>
                                                <button onClick={() => rechazarSolicitud(sol)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.82rem' }}>
                                                    <XCircle size={14} /> Rechazar
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Editores actuales */}
                            <div style={{ marginBottom: 22 }}>
                                <div style={st.seccionTitulo}>Editores actuales</div>
                                {(croquis.editoresEmail || []).length === 0 ? (
                                    <div style={{ color: '#aaa', fontSize: '0.85rem', padding: '8px 0' }}>Aún no hay editores</div>
                                ) : (
                                    (croquis.editoresEmail || []).map(email => {
                                        const uid = (croquis.editores || []).find((_, i) =>
                                            (croquis.editoresEmail || [])[i] === email
                                        ) || null;
                                        return (
                                            <div key={email} style={st.editorRow}>
                                                <Mail size={14} style={{ color: '#7f8c8d', flexShrink: 0 }} />
                                                <span style={{ flex: 1, fontSize: '0.88rem', color: '#2c3e50' }}>{email}</span>
                                                <button onClick={() => quitarEditor(email, uid)}
                                                    style={{ background: 'none', border: '1px solid #e74c3c', color: '#e74c3c', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: '0.78rem' }}>
                                                    Quitar
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Invitar por correo */}
                            <div>
                                <div style={st.seccionTitulo}>Invitar por correo</div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        type="email"
                                        value={invitarEmail}
                                        onChange={e => setInvitarEmail(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && invitarEditor()}
                                        placeholder="correo@ejemplo.com"
                                        style={{ flex: 1, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: '0.88rem' }}
                                    />
                                    <button onClick={invitarEditor} disabled={invitandoEmail || !invitarEmail.includes('@')}
                                        style={{ padding: '8px 14px', background: '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', opacity: (invitandoEmail || !invitarEmail.includes('@')) ? 0.5 : 1 }}>
                                        {invitandoEmail ? '…' : 'Invitar'}
                                    </button>
                                </div>
                                <div style={{ color: '#888', fontSize: '0.78rem', marginTop: 6 }}>
                                    La persona podrá editar este croquis cuando inicie sesión con ese correo.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Info del sector */}
            {mostrarInfo && (
                <div style={st.overlay}>
                    <div style={st.modal}>
                        <div style={st.modalHeader}>
                            <h3 style={{ margin: 0 }}>{info.sector || info.escuela}</h3>
                            <button onClick={() => setMostrarInfo(false)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={st.modalBody}>
                            {info.escuela && <p><strong>Escuela:</strong> {info.escuela}</p>}
                            {info.horarioSol && <p><Sun size={14} style={{ marginRight: 6 }} />{info.horarioSol}</p>}
                            {info.mejorEpoca && <p><Calendar size={14} style={{ marginRight: 6 }} />{info.mejorEpoca}</p>}
                            {info.acceso && <div style={st.bloque}><strong>Acceso:</strong><p>{info.acceso}</p></div>}
                            {info.restricciones && <div style={{ ...st.bloque, background: '#fef9e7', border: '1px solid #f9ca24' }}><AlertTriangle size={14} /> <strong>Restricciones:</strong><p>{info.restricciones}</p></div>}
                            {info.masInfo && <div style={st.bloque}><strong>Más info:</strong><p>{info.masInfo}</p></div>}
                            {info.mapsUrl && (
                                <a href={info.mapsUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#3498db', fontWeight: 'bold', textDecoration: 'none' }}>
                                    <MapPin size={16} /> Ver en Google Maps
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* PANEL: Comentarios */}
            {mostrarComentarios && (
                <div style={st.drawerOverlay} onClick={() => setMostrarComentarios(false)}>
                    <div style={st.drawer} onClick={e => e.stopPropagation()}>
                        <div style={st.drawerHeader}>
                            <span style={{ fontWeight: 'bold', color: '#2c3e50' }}>Comentarios</span>
                            <button onClick={() => setMostrarComentarios(false)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            <ComentariosCroquis croquis={croquis} />
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Impresión */}
            {mostrarImpresion && (
                <ModalImpresion
                    croquis={{
                        infoCroquis: info,
                        vias: fotoActual?.vias || [],
                        formas: fotoActual?.formas || [],
                        combinaciones: fotoActual?.combinaciones || [],
                        imagenUrl: fotoActual?.imagenUrl,
                        srcW: fotoActual?.srcW,
                        srcH: fotoActual?.srcH,
                    }}
                    onClose={() => setMostrarImpresion(false)}
                />
            )}

            {/* MODAL: Info vía */}
            {viaSeleccionada && (
                <div style={st.overlay}>
                    <div style={st.modal}>
                        <div style={st.modalHeader}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ background: viaSeleccionada.color, color: 'white', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                    {viaSeleccionada.num}
                                </div>
                                {viaSeleccionada.info?.nombre}
                            </h3>
                            <button onClick={() => setViaSeleccionada(null)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={st.modalBody}>
                            <p><strong>Grado:</strong> <span style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: '1.1rem' }}>{viaSeleccionada.info?.grado || '–'}</span></p>
                            <p><strong>Equipador:</strong> {viaSeleccionada.info?.equipador || 'Desconocido'}</p>
                            <p><strong>Año:</strong> {viaSeleccionada.info?.anio || '–'}</p>
                            {viaSeleccionada.info?.info && (
                                <div style={st.bloque}><strong>Info técnica:</strong><p style={{ whiteSpace: 'pre-wrap' }}>{viaSeleccionada.info.info}</p></div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const TextoSvg = ({ txt, color }) => {
    const isGrado = txt.type === 'grado';
    const fs = txt.fontSize || (isGrado ? 14 : 18);
    const hw = fs + 6, hh = Math.ceil(fs * 0.9);
    return (
        <g transform={`translate(${txt.x}, ${txt.y})`}>
            {isGrado
                ? <><rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} rx="4" fill="white" stroke={color} strokeWidth="2" />
                    <text x="0" y={Math.ceil(fs * 0.35)} fill={color} fontSize={fs} fontWeight="bold" textAnchor="middle">{txt.text}</text></>
                : <><text x="0" y="0" fill="white" stroke="black" strokeWidth="3" fontSize={fs} fontWeight="bold" paintOrder="stroke">{txt.text}</text>
                    <text x="0" y="0" fill="white" fontSize={fs} fontWeight="bold">{txt.text}</text></>
            }
        </g>
    );
};

const st = {
    app: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Segoe UI', sans-serif" },
    topbar: { background: '#2c3e50', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, boxShadow: '0 4px 10px rgba(0,0,0,0.3)', flexWrap: 'wrap', gap: 8 },
    btnIcono: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 },
    badge: { position: 'absolute', top: 2, right: 2, background: '#e74c3c', color: 'white', borderRadius: '50%', width: 16, height: 16, fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
    leyenda: { position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.7)', borderRadius: 10, padding: 10, maxHeight: 'calc(100% - 24px)', overflowY: 'auto', minWidth: 150, maxWidth: 200 },
    leyendaItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 3, background: 'rgba(255,255,255,0.05)' },
    leyendaNombre: { color: 'white', fontSize: '0.82rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    leyendaGrado: { color: '#e74c3c', fontSize: '0.78rem', fontWeight: 'bold', background: 'rgba(231,76,60,0.2)', padding: '1px 5px', borderRadius: 4 },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 480, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
    modalHeader: { background: '#f8f9fa', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1' },
    modalBody: { padding: 20 },
    btnClose: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' },
    bloque: { background: '#f8f9fa', border: '1px solid #ecf0f1', borderRadius: 8, padding: '10px 14px', marginTop: 10 },
    drawerOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1500, display: 'flex', justifyContent: 'flex-end' },
    drawer: { width: '100%', maxWidth: 420, background: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 30px rgba(0,0,0,0.2)', height: '100%' },
    drawerHeader: { background: '#f8f9fa', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1', flexShrink: 0 },
    seccionTitulo: { fontWeight: 'bold', color: '#2c3e50', fontSize: '0.88rem', marginBottom: 10, display: 'flex', alignItems: 'center' },
    solicitudCard: { display: 'flex', alignItems: 'flex-start', background: '#fef9e7', border: '1px solid #f39c12', borderRadius: 10, padding: '10px 12px', marginBottom: 10 },
    editorRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #f0f0f0' },
};
