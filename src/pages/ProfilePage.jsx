import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { ArrowLeft, Plus, Globe, Lock, Edit, Trash2, Bell } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function ProfilePage({ onVolver, onVerCroquis, onEditarCroquis, onCrearCroquis }) {
    const { usuario } = useAuth();
    const [croquis, setCroquis] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);

    useEffect(() => {
        if (!usuario) return;
        const cargar = async () => {
            setCargando(true);
            try {
                const q = query(collection(db, 'croquis_escalada'), where('creadoPor', '==', usuario.uid));
                const snap = await getDocs(q);
                const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                docs.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
                setCroquis(docs);
            } catch (e) { console.error(e); }
            setCargando(false);
        };
        const cargarSolicitudes = async () => {
            try {
                const q = query(
                    collection(db, 'solicitudes_edicion'),
                    where('autorUid', '==', usuario.uid),
                    where('estado', '==', 'pendiente')
                );
                const snap = await getDocs(q);
                setSolicitudesPendientes(snap.size);
            } catch (e) { /* requiere índice compuesto en Firestore */ }
        };
        cargar();
        cargarSolicitudes();
    }, [usuario]);

    const eliminar = async (id) => {
        if (!window.confirm('¿Eliminar este croquis? Esta acción no se puede deshacer.')) return;
        await deleteDoc(doc(db, 'croquis_escalada', id));
        setCroquis(prev => prev.filter(c => c.id !== id));
    };

    const publicos = croquis.filter(c => !c.visibilidad || c.visibilidad === 'publico').length;
    const privados = croquis.filter(c => c.visibilidad === 'privado').length;
    const totalVias = croquis.reduce((sum, c) => sum + (c.vias?.length || 0), 0);

    return (
        <div style={{ minHeight: '100vh', background: '#f4f6f8', fontFamily: "'Segoe UI', sans-serif" }}>
            {/* Header */}
            <div style={{ background: '#2c3e50', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}>
                    <ArrowLeft size={22} />
                </button>
                <div style={{ flex: 1 }}>
                    <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.05rem' }}>
                        {usuario?.displayName || usuario?.email}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem' }}>Mi perfil de escalador</div>
                </div>
                <button onClick={() => onCrearCroquis()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' }}>
                    <Plus size={16} /> Nuevo croquis
                </button>
            </div>

            {/* Aviso solicitudes pendientes */}
            {solicitudesPendientes > 0 && (
                <div style={{ background: '#fef9e7', borderBottom: '1px solid #f39c12', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Bell size={16} style={{ color: '#f39c12', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.88rem', color: '#7d5a00' }}>
                        Tienes <strong>{solicitudesPendientes}</strong> solicitud{solicitudesPendientes > 1 ? 'es' : ''} de edición pendiente{solicitudesPendientes > 1 ? 's' : ''}.
                        Ábrelas desde cada croquis pulsando el botón <strong>Editores</strong>.
                    </span>
                </div>
            )}

            {/* Stats */}
            <div style={{ display: 'flex', gap: 10, padding: '14px 20px', background: 'white', borderBottom: '1px solid #ecf0f1' }}>
                <StatChip label="Croquis" value={croquis.length} color="#3498db" />
                <StatChip label="Públicos" value={publicos} color="#27ae60" />
                <StatChip label="Privados" value={privados} color="#e74c3c" />
                <StatChip label="Vías" value={totalVias} color="#9b59b6" />
            </div>

            {/* Grid */}
            <div style={{ padding: 20 }}>
                {cargando ? (
                    <div style={{ textAlign: 'center', color: '#7f8c8d', padding: 40 }}>Cargando tus croquis…</div>
                ) : croquis.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 60 }}>
                        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏔️</div>
                        <div style={{ fontWeight: 'bold', color: '#2c3e50', marginBottom: 6, fontSize: '1.1rem' }}>Aún no has creado ningún croquis</div>
                        <div style={{ color: '#7f8c8d', marginBottom: 20, fontSize: '0.9rem' }}>¡Empieza subiendo la foto de un sector y dibujando las vías!</div>
                        <button onClick={() => onCrearCroquis()}
                            style={{ padding: '10px 24px', background: '#3498db', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.95rem' }}>
                            Crear mi primer croquis
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                        {croquis.map(c => (
                            <TarjetaPerfil key={c.id} croquis={c}
                                onVer={() => onVerCroquis(c)}
                                onEditar={() => onEditarCroquis(c)}
                                onEliminar={() => eliminar(c.id)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function StatChip({ label, value, color }) {
    return (
        <div style={{ flex: 1, textAlign: 'center', padding: '10px 6px', background: '#f8f9fa', borderRadius: 10, border: `2px solid ${color}30` }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color }}>{value}</div>
            <div style={{ fontSize: '0.72rem', color: '#7f8c8d', fontWeight: 'bold', marginTop: 2 }}>{label}</div>
        </div>
    );
}

function TarjetaPerfil({ croquis, onVer, onEditar, onEliminar }) {
    const info = croquis.infoCroquis || {};
    const esPublico = !croquis.visibilidad || croquis.visibilidad === 'publico';
    const [copiado, setCopiado] = useState(false);
    const compartir = (e) => {
        e.stopPropagation();
        const url = `${window.location.origin}${window.location.pathname}#/croquis/${croquis.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        });
    };
    return (
        <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #ecf0f1' }}>
            <div style={{ position: 'relative', height: 150, background: '#ecf0f1', cursor: 'pointer' }} onClick={onVer}>
                {croquis.imagenUrl
                    ? <img src={croquis.imagenUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '2.5rem' }}>🏔️</div>}
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, background: esPublico ? 'rgba(39,174,96,0.9)' : 'rgba(231,76,60,0.9)', padding: '3px 8px', borderRadius: 8, color: 'white', fontSize: '0.72rem', fontWeight: 'bold' }}>
                    {esPublico ? <Globe size={11} /> : <Lock size={11} />}
                    {esPublico ? 'Público' : 'Privado'}
                </div>
                <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.55)', color: 'white', padding: '3px 8px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 'bold' }}>
                    🧗 {croquis.vias?.length || 0} vías
                </div>
                {esPublico && (
                    <button onClick={compartir} title="Copiar enlace"
                        style={{ position: 'absolute', bottom: 8, right: 8, background: copiado ? 'rgba(39,174,96,0.85)' : 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 6, padding: '3px 8px', color: 'white', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 'bold' }}>
                        {copiado ? '✓ Copiado' : '🔗'}
                    </button>
                )}
            </div>
            <div style={{ padding: '12px 14px' }}>
                <div style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '0.95rem', marginBottom: 2 }}>
                    {info.sector || info.escuela || 'Sin nombre'}
                </div>
                {info.escuela && info.sector && (
                    <div style={{ color: '#7f8c8d', fontSize: '0.8rem', marginBottom: 10 }}>⛰️ {info.escuela}</div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button onClick={onVer}
                        style={{ flex: 1, padding: '7px', background: '#3498db', color: 'white', border: 'none', borderRadius: 7, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.82rem' }}>
                        Ver
                    </button>
                    <button onClick={onEditar}
                        style={{ flex: 1, padding: '7px', background: '#f39c12', color: 'white', border: 'none', borderRadius: 7, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Edit size={13} /> Editar
                    </button>
                    <button onClick={onEliminar}
                        style={{ padding: '7px 11px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}
