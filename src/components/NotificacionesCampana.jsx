import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import {
    collection, onSnapshot, query,
    orderBy, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Bell, X } from 'lucide-react';

export default function NotificacionesCampana({ onVerCroquis }) {
    const { usuario } = useAuth();
    const [notifs, setNotifs] = useState([]);
    const [abierto, setAbierto] = useState(false);
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

    useEffect(() => {
        const handler = (e) => {
            if (!panelRef.current?.contains(e.target)) setAbierto(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (!usuario) return null;

    const noLeidas = notifs.filter(n => !n.leido).length;

    const marcarLeida = async (n) => {
        await updateDoc(doc(db, 'notificaciones', usuario.uid, 'items', n.id), { leido: true });
        setAbierto(false);
        onVerCroquis?.(n.croquisId);
    };

    const eliminar = async (id, e) => {
        e.stopPropagation();
        await deleteDoc(doc(db, 'notificaciones', usuario.uid, 'items', id));
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
                <div style={st.panel}>
                    <div style={st.panelHeader}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Notificaciones</span>
                        {notifs.length > 0 && (
                            <span style={{ fontSize: '0.78rem', color: '#7f8c8d' }}>{noLeidas} sin leer</span>
                        )}
                    </div>

                    {notifs.length === 0 ? (
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
                                        <strong>{n.autorNombre}</strong> comentó en <em>{n.croquisNombre}</em>
                                    </div>
                                    <div style={st.itemPreview}>{n.textoPreview}</div>
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
        </div>
    );
}

const st = {
    btn: { position: 'relative', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' },
    badge: { position: 'absolute', top: 2, right: 2, background: '#e74c3c', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: '0.68rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    panel: { position: 'absolute', top: '110%', right: 0, width: 320, background: 'white', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.15)', zIndex: 3000, overflow: 'hidden', border: '1px solid #ecf0f1' },
    panelHeader: { padding: '12px 16px', borderBottom: '1px solid #ecf0f1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8f9fa' },
    vacio: { padding: '20px 16px', color: '#95a5a6', fontSize: '0.88rem', textAlign: 'center', margin: 0 },
    item: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s' },
    punto: { width: 8, height: 8, borderRadius: '50%', background: '#3498db', flexShrink: 0, marginTop: 6 },
    itemCuerpo: { flex: 1, minWidth: 0 },
    itemTitulo: { fontSize: '0.85rem', color: '#2c3e50', marginBottom: 3 },
    itemPreview: { fontSize: '0.8rem', color: '#7f8c8d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    itemFecha: { fontSize: '0.75rem', color: '#bdc3c7', marginTop: 4 },
    btnX: { background: 'none', border: 'none', color: '#bdc3c7', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex', alignItems: 'center' },
};
