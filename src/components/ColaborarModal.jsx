import React, { useState, useEffect } from 'react';
import { X, Users, Copy, Check, Share2 } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Enlace a la página de propuestas de un croquis, o de una vía concreta
export const enlaceProponer = (croquisId, viaId = null) =>
    `${window.location.origin}${window.location.pathname}#/proponer/${croquisId}${viaId != null ? `/via/${viaId}` : ''}`;

// Colaborar en un croquis. Con el croquis abierto a propuestas, cualquiera, aunque no tenga
// cuenta, propone cambios y el autor los acepta o no. Los editores invitados por correo
// guardan directamente. via (opcional): se comparte el enlace de esa vía.
export default function ColaborarModal({ croquisId, via = null, onClose, onAbiertoCambiado }) {
    const [abierto, setAbierto] = useState(null); // null = cargando
    const [cambiando, setCambiando] = useState(false);
    const [error, setError] = useState('');
    const [copiado, setCopiado] = useState(false);

    useEffect(() => {
        if (!croquisId) { setError('Guarda el croquis antes de abrirlo a propuestas.'); return; }
        getDoc(doc(db, 'croquis_escalada', croquisId))
            .then(snap => {
                if (!snap.exists()) throw new Error('El croquis aún no está guardado.');
                setAbierto(Boolean(snap.data().abiertoPropuestas));
            })
            .catch(e => setError(e.message));
    }, [croquisId]);

    const enlace = croquisId ? enlaceProponer(croquisId, via?.id ?? null) : '';

    const cambiarAbierto = async () => {
        setCambiando(true);
        setError('');
        try {
            await updateDoc(doc(db, 'croquis_escalada', croquisId), { abiertoPropuestas: !abierto });
            setAbierto(!abierto);
            onAbiertoCambiado?.(!abierto);
        } catch (e) {
            setError('No se pudo cambiar: ' + e.message);
        }
        setCambiando(false);
    };

    const copiar = () => navigator.clipboard.writeText(enlace).then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
    });

    const compartir = () => navigator.share({
        title: via ? `Vía ${via.info?.nombre || ''}`.trim() : 'Croquis',
        text: 'Ayúdame a completar este croquis: puedes proponer cambios sin registrarte.',
        url: enlace,
    }).catch(() => {});

    return (
        <div style={st.overlay}>
            <div style={st.modal}>
                <div style={st.header}>
                    <h3 style={st.titulo}><Users size={18} /> {via ? `Colaborar en ${via.info?.nombre || 'la vía'}` : 'Colaborar en el croquis'}</h3>
                    <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                </div>
                <div style={{ padding: 20 }}>
                    {error && <p style={st.error}>{error}</p>}
                    {abierto === null && !error && <p style={st.texto}>Cargando…</p>}
                    {abierto !== null && (
                        <>
                            <div style={{ ...st.interruptor, borderColor: abierto ? '#f39c12' : '#dfe6e9', background: abierto ? '#fef5e7' : '#f8f9fa' }}>
                                <label style={st.etiquetaInterruptor}>
                                    <input type="checkbox" checked={abierto} disabled={cambiando} onChange={cambiarAbierto}
                                        style={{ width: 18, height: 18, accentColor: '#f39c12' }} />
                                    Abierto a propuestas
                                </label>
                                <p style={{ ...st.texto, margin: '6px 0 0' }}>
                                    {abierto
                                        ? 'Cualquiera que vea el croquis, aunque no tenga cuenta, puede proponer cambios en las vías o añadir vías nuevas. Te llegan a las notificaciones y tú decides si se aplican.'
                                        : 'Actívalo para que cualquiera pueda proponer cambios, sin registrarse. Nada se aplica sin que lo aceptes.'}
                                </p>
                            </div>

                            {abierto && (
                                <>
                                    <p style={st.texto}>{via ? 'Enlace para proponer cambios en esta vía:' : 'Enlace para proponer cambios:'}</p>
                                    <input readOnly value={enlace} onFocus={e => e.target.select()} style={st.enlace} />
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                        <button onClick={copiar} style={{ ...st.btn, background: copiado ? '#27ae60' : '#3498db' }}>
                                            {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar enlace'}
                                        </button>
                                        {navigator.share && <button onClick={compartir} style={{ ...st.btn, background: '#2c3e50' }}><Share2 size={16} /> Compartir</button>}
                                    </div>
                                </>
                            )}

                            <p style={{ ...st.texto, fontSize: '0.8rem', color: '#7f8c8d', margin: '14px 0 0' }}>
                                ¿Alguien de confianza? Invítalo por correo como editor desde el botón de editores del croquis: guardará sus cambios directamente, sin tu validación.
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 460, maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
    header: { background: '#f8f9fa', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1' },
    titulo: { margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#2c3e50', fontSize: '1.05rem', minWidth: 0, overflowWrap: 'anywhere' },
    btnClose: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' },
    interruptor: { borderWidth: 2, borderStyle: 'solid', borderRadius: 10, padding: 12, marginBottom: 14 },
    etiquetaInterruptor: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 'bold', color: '#2c3e50', fontSize: '0.95rem' },
    texto: { color: '#555', fontSize: '0.88rem', lineHeight: 1.45, marginBottom: 8 },
    error: { background: '#fdecea', color: '#c0392b', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem', marginBottom: 12 },
    enlace: { width: '100%', padding: '9px 10px', border: '1px solid #bdc3c7', borderRadius: 8, fontSize: '0.8rem', color: '#2c3e50', background: '#f8f9fa' },
    btn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
};
