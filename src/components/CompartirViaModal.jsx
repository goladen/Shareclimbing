import React, { useState, useEffect } from 'react';
import { X, Share2, Copy, Check, Trash2 } from 'lucide-react';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const generarToken = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
};

export const enlaceTarjeta = (token) => `${window.location.origin}${window.location.pathname}#/via/${token}`;

// Prepara el enlace de la tarjeta de una vía. El token vive en su propio documento y nunca
// en el croquis: los croquis públicos los lee cualquiera y el token da permiso para editar.
export default function CompartirViaModal({ croquisId, via, onClose }) {
    const { usuario, setModalAuth } = useAuth();
    const [token, setToken] = useState(null);
    const [estado, setEstado] = useState('cargando'); // cargando | listo | sinGuardar | error
    const [error, setError] = useState('');
    const [copiado, setCopiado] = useState(false);

    useEffect(() => {
        if (!usuario) { setModalAuth(true); onClose(); return; }
        (async () => {
            try {
                // Solo se puede compartir lo que ya está guardado en el croquis
                const snap = croquisId ? await getDoc(doc(db, 'croquis_escalada', croquisId)) : null;
                const datos = snap?.exists() ? snap.data() : null;
                const fotos = datos?.fotos?.length > 0 ? datos.fotos : [{ vias: datos?.vias || [] }];
                if (!fotos.some(f => (f.vias || []).some(v => v.id === via.id))) { setEstado('sinGuardar'); return; }

                const existentes = await getDocs(query(
                    collection(db, 'tarjetas_via'),
                    where('creadoPor', '==', usuario.uid),
                    where('croquisId', '==', croquisId),
                    where('viaId', '==', via.id)
                ));
                let t = existentes.docs[0]?.id;
                if (!t) {
                    t = generarToken();
                    await setDoc(doc(db, 'tarjetas_via', t), {
                        croquisId,
                        viaId: via.id,
                        creadoPor: usuario.uid,
                        createdAt: serverTimestamp(),
                    });
                }
                setToken(t);
                setEstado('listo');
            } catch (e) {
                setError('No se pudo preparar el enlace: ' + e.message);
                setEstado('error');
            }
        })();
    }, []); // eslint-disable-line

    const copiar = () => {
        navigator.clipboard.writeText(enlaceTarjeta(token)).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        });
    };

    const compartir = () => {
        navigator.share({ title: `Vía ${via.info?.nombre || ''}`.trim(), url: enlaceTarjeta(token) }).catch(() => {});
    };

    const revocar = async () => {
        if (!window.confirm('El enlace dejará de funcionar para todas las personas que lo tengan. ¿Continuar?')) return;
        try {
            await deleteDoc(doc(db, 'tarjetas_via', token));
            onClose();
        } catch (e) {
            setError('No se pudo desactivar: ' + e.message);
        }
    };

    return (
        <div style={st.overlay}>
            <div style={st.modal}>
                <div style={st.header}>
                    <h3 style={st.titulo}><Share2 size={18} /> Tarjeta de {via.info?.nombre || 'la vía'}</h3>
                    <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                </div>
                <div style={{ padding: 20 }}>
                    {estado === 'cargando' && <p style={st.texto}>Preparando el enlace…</p>}
                    {estado === 'sinGuardar' && <p style={st.texto}>Guarda el croquis antes de compartir esta vía.</p>}
                    {error && <p style={st.error}>{error}</p>}
                    {estado === 'listo' && (
                        <>
                            <p style={st.texto}>
                                Quien abra este enlace e inicie sesión podrá cambiar el nombre, el grado y el trazado de la vía. Los cambios se aplican directamente en el croquis, sin revisión.
                            </p>
                            <input readOnly value={enlaceTarjeta(token)} onFocus={e => e.target.select()} style={st.enlace} />
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <button onClick={copiar} style={{ ...st.btn, background: copiado ? '#27ae60' : '#3498db' }}>
                                    {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar enlace'}
                                </button>
                                {navigator.share && <button onClick={compartir} style={{ ...st.btn, background: '#2c3e50' }}><Share2 size={16} /> Compartir</button>}
                            </div>
                            <button onClick={revocar} style={st.btnRevocar}><Trash2 size={14} /> Desactivar enlace</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 460, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
    header: { background: '#f8f9fa', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1' },
    titulo: { margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#2c3e50', fontSize: '1.05rem', minWidth: 0, overflowWrap: 'anywhere' },
    btnClose: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' },
    texto: { color: '#555', fontSize: '0.88rem', lineHeight: 1.45, marginBottom: 12 },
    error: { background: '#fdecea', color: '#c0392b', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem', marginBottom: 12 },
    enlace: { width: '100%', padding: '9px 10px', border: '1px solid #bdc3c7', borderRadius: 8, fontSize: '0.8rem', color: '#2c3e50', background: '#f8f9fa' },
    btn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
    btnRevocar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', marginTop: 12, padding: 8, background: 'white', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.82rem' },
};
