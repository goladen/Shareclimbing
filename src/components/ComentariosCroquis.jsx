import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
    collection, addDoc, deleteDoc, doc,
    onSnapshot, query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, Send, MessageCircle } from 'lucide-react';

const ADMIN_EMAIL = 'goladen@gmail.com';

export default function ComentariosCroquis({ croquis }) {
    const { usuario, pedirAuth } = useAuth();
    const [comentarios, setComentarios] = useState([]);
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        if (!croquis?.id) return;
        const q = query(
            collection(db, 'croquis_escalada', croquis.id, 'comentarios'),
            orderBy('createdAt', 'asc')
        );
        return onSnapshot(q, snap =>
            setComentarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
    }, [croquis?.id]);

    const enviar = async () => {
        if (!texto.trim()) return;
        if (!usuario) { pedirAuth(enviar); return; }
        setEnviando(true);
        try {
            const autorNombre = usuario.displayName || usuario.email.split('@')[0];
            await addDoc(collection(db, 'croquis_escalada', croquis.id, 'comentarios'), {
                texto: texto.trim(),
                autorUid: usuario.uid,
                autorNombre,
                autorEmail: usuario.email,
                createdAt: serverTimestamp(),
            });

            // Notificación al propietario si no es él mismo
            if (croquis.creadoPor && croquis.creadoPor !== usuario.uid) {
                await addDoc(
                    collection(db, 'notificaciones', croquis.creadoPor, 'items'),
                    {
                        tipo: 'comentario',
                        croquisId: croquis.id,
                        croquisNombre: croquis.infoCroquis?.sector || croquis.infoCroquis?.escuela || 'Croquis',
                        autorNombre,
                        textoPreview: texto.trim().slice(0, 80),
                        leido: false,
                        createdAt: serverTimestamp(),
                    }
                );
            }
            setTexto('');
        } finally {
            setEnviando(false);
        }
    };

    const borrar = async (comentarioId) => {
        await deleteDoc(doc(db, 'croquis_escalada', croquis.id, 'comentarios', comentarioId));
    };

    const puedeEliminar = (c) =>
        usuario && (
            usuario.uid === croquis.creadoPor ||
            usuario.uid === c.autorUid ||
            usuario.email === ADMIN_EMAIL
        );

    const formatFecha = (ts) => {
        if (!ts?.toDate) return '';
        return ts.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div style={st.wrap}>
            <div style={st.titulo}>
                <MessageCircle size={18} style={{ marginRight: 8 }} />
                Comentarios {comentarios.length > 0 && `(${comentarios.length})`}
            </div>

            <div style={st.lista}>
                {comentarios.length === 0 && (
                    <p style={st.vacio}>Sé el primero en comentar este croquis.</p>
                )}
                {comentarios.map(c => (
                    <div key={c.id} style={st.item}>
                        <div style={st.cabecera}>
                            <div style={st.avatarMini}>{c.autorNombre?.[0]?.toUpperCase() || '?'}</div>
                            <span style={st.autor}>{c.autorNombre}</span>
                            <span style={st.fecha}>{formatFecha(c.createdAt)}</span>
                            {usuario?.email === ADMIN_EMAIL && (
                                <span style={st.emailAdmin} title="Solo visible para el administrador">
                                    {c.autorEmail}
                                </span>
                            )}
                            {puedeEliminar(c) && (
                                <button onClick={() => borrar(c.id)} style={st.btnBorrar} title="Eliminar comentario">
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                        <p style={st.texto}>{c.texto}</p>
                    </div>
                ))}
            </div>

            <div style={st.inputWrap}>
                <textarea
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    placeholder={usuario ? 'Escribe un comentario…' : 'Inicia sesión para comentar'}
                    rows={2}
                    style={st.textarea}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
                    }}
                />
                <button
                    onClick={enviar}
                    disabled={enviando || !texto.trim()}
                    style={{ ...st.btnEnviar, opacity: (!texto.trim() || enviando) ? 0.4 : 1 }}
                    title="Enviar"
                >
                    <Send size={18} />
                </button>
            </div>
        </div>
    );
}

const st = {
    wrap: { padding: '20px 24px', borderTop: '1px solid #ecf0f1', background: '#fafafa' },
    titulo: { display: 'flex', alignItems: 'center', fontWeight: 'bold', color: '#2c3e50', fontSize: '1rem', marginBottom: 16 },
    lista: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 },
    vacio: { color: '#95a5a6', fontSize: '0.9rem', fontStyle: 'italic', margin: 0 },
    item: { background: 'white', borderRadius: 10, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #ecf0f1' },
    cabecera: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
    avatarMini: { width: 26, height: 26, borderRadius: '50%', background: '#2c3e50', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', flexShrink: 0 },
    autor: { fontWeight: 'bold', color: '#2c3e50', fontSize: '0.88rem' },
    fecha: { color: '#95a5a6', fontSize: '0.78rem', marginLeft: 'auto' },
    emailAdmin: { background: '#fdecea', color: '#c0392b', fontSize: '0.72rem', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' },
    btnBorrar: { background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', marginLeft: 4 },
    texto: { margin: 0, color: '#34495e', fontSize: '0.92rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
    inputWrap: { display: 'flex', gap: 10, alignItems: 'flex-end' },
    textarea: { flex: 1, padding: '10px 14px', border: '2px solid #ddd', borderRadius: 10, fontSize: '0.9rem', resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.4 },
    btnEnviar: { background: '#27ae60', border: 'none', borderRadius: 10, color: 'white', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
};
