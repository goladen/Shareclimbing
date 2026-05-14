import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, ZoomIn, ZoomOut, Edit, Info, X, Sun, Calendar, MapPin, AlertTriangle, MessageCircle, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { deleteDoc, doc } from 'firebase/firestore';
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

export default function CroquisViewer({ croquis, onVolver, onEditar }) {
    const { usuario } = useAuth();
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [imgSize, setImgSize] = useState({ w: 800, h: 600 });
    const [viaSeleccionada, setViaSeleccionada] = useState(null);
    const [mostrarInfo, setMostrarInfo] = useState(false);
    const [mostrarComentarios, setMostrarComentarios] = useState(false);
    const [fotoIdx, setFotoIdx] = useState(0);
    const contenedorRef = useRef(null);

    // Soporte multi-foto (compatibilidad con formato antiguo)
    const fotos = croquis.fotos?.length > 0
        ? croquis.fotos
        : [{ id: 'f0', imagenUrl: croquis.imagenUrl, vias: croquis.vias || [], formas: croquis.formas || [] }];
    const fotoActual = fotos[fotoIdx] || fotos[0];

    const info = croquis.infoCroquis || {};
    const vias = fotoActual?.vias || [];

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

    const handleWheel = (e) => {
        e.preventDefault();
        setScale(s => Math.min(Math.max(s * (e.deltaY > 0 ? 0.9 : 1.1), 0.1), 5));
    };

    const handlePointerDown = (e) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };
    const handlePointerMove = (e) => {
        if (isDragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handlePointerUp = () => setIsDragging(false);

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
                    {usuario?.uid === croquis.creadoPor && (
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
                    <button onClick={() => onEditar(croquis)} style={{ ...st.btnIcono, background: 'rgba(52,152,219,0.5)' }} title="Editar croquis">
                        <Edit size={18} />
                        <span style={{ color: 'white', fontSize: '0.8rem', marginLeft: 4 }}>Editar</span>
                    </button>
                </div>
            </div>

            {/* VISOR */}
            <div
                ref={contenedorRef}
                onWheel={handleWheel}
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
                            const pts = [via.inicio, ...interOrd, via.fin].filter(Boolean);
                            return (
                                <g key={via.id} onClick={() => setViaSeleccionada({ ...via, num: idx + 1 })} style={{ cursor: 'pointer' }}>
                                    <path d={generarCurvaSuave(pts)} fill="none" stroke="black" strokeWidth="6" opacity="0.4" />
                                    <path d={generarCurvaSuave(pts)} fill="none" stroke={via.color} strokeWidth="4" strokeLinecap="round" />
                                    {(via.textos || []).map((txt, i) => (
                                        <TextoSvg key={i} txt={txt} color={via.color} />
                                    ))}
                                    {via.inicio && (
                                        <>
                                            <circle cx={via.inicio.x} cy={via.inicio.y + 20} r="15" fill={via.color} />
                                            <text x={via.inicio.x} y={via.inicio.y + 25} fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">{idx + 1}</text>
                                        </>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                </div>

                {/* Leyenda lateral */}
                {vias.length > 0 && (
                    <div style={st.leyenda}>
                        {vias.map((v, i) => (
                            <div key={v.id} onClick={() => setViaSeleccionada({ ...v, num: i + 1 })}
                                style={{ ...st.leyendaItem, borderLeft: `4px solid ${v.color}` }}>
                                <span style={{ fontWeight: 'bold', color: v.color }}>{i + 1}</span>
                                <span style={st.leyendaNombre}>{v.info?.nombre}</span>
                                {v.info?.grado && <span style={st.leyendaGrado}>{v.info.grado}</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

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

            {/* PANEL: Comentarios (drawer lateral) */}
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
    return (
        <g transform={`translate(${txt.x}, ${txt.y})`}>
            {isGrado
                ? <><rect x="-20" y="-12" width="40" height="24" rx="4" fill="white" stroke={color} strokeWidth="2" />
                    <text x="0" y="4" fill={color} fontSize="14" fontWeight="bold" textAnchor="middle">{txt.text}</text></>
                : <><text x="0" y="0" fill="white" stroke="black" strokeWidth="3" fontSize="18" fontWeight="bold" paintOrder="stroke">{txt.text}</text>
                    <text x="0" y="0" fill="white" fontSize="18" fontWeight="bold">{txt.text}</text></>
            }
        </g>
    );
};

const st = {
    app: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Segoe UI', sans-serif" },
    topbar: { background: '#2c3e50', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' },
    btnIcono: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 },
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
};
