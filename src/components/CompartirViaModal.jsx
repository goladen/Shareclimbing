import React, { useState, useEffect } from 'react';
import { X, Share2, Copy, Check, Trash2 } from 'lucide-react';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const generarToken = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
};

export const enlaceTarjeta = (token, ruta = "via") => `${window.location.origin}${window.location.pathname}#/${ruta}/${token}`;

// Prepara el enlace de la tarjeta de una vía o, sin via, el de todo el croquis. El token vive en
// su propio documento y nunca en el croquis: los croquis públicos los lee cualquiera y el token
// permite enviar propuestas.
export default function CompartirViaModal({ croquisId, via = null, onClose, onAbiertoCambiado }) {
    const coleccion = via ? "tarjetas_via" : "tarjetas_croquis";
    const ruta = via ? "via" : "sugerir";
    const enlace = (t) => enlaceTarjeta(t, ruta);
    const { usuario, setModalAuth } = useAuth();
    const [token, setToken] = useState(null);
    const [estado, setEstado] = useState('cargando'); // cargando | listo | sinGuardar | error
    const [error, setError] = useState('');
    const [copiado, setCopiado] = useState(false);
    const [abierto, setAbierto] = useState(false); // croquis abierto a propuestas desde el visor
    const [cambiandoAbierto, setCambiandoAbierto] = useState(false);

    useEffect(() => {
        if (!usuario) { setModalAuth(true); onClose(); return; }
        (async () => {
            try {
                // Solo se puede compartir lo que ya está guardado en el croquis
                const snap = croquisId ? await getDoc(doc(db, 'croquis_escalada', croquisId)) : null;
                const datos = snap?.exists() ? snap.data() : null;
                const fotos = datos?.fotos?.length > 0 ? datos.fotos : [{ vias: datos?.vias || [] }];
                setAbierto(Boolean(datos?.abiertoPropuestas));
                if (!datos || (via && !fotos.some(f => (f.vias || []).some(v => v.id === via.id)))) { setEstado('sinGuardar'); return; }

                const existentes = await getDocs(query(
                    collection(db, coleccion),
                    where('creadoPor', '==', usuario.uid),
                    where('croquisId', '==', croquisId),
                    ...(via ? [where('viaId', '==', via.id)] : [])
                ));
                let t = existentes.docs[0]?.id;
                if (!t) {
                    t = generarToken();
                    await setDoc(doc(db, coleccion, t), {
                        croquisId,
                        ...(via ? { viaId: via.id } : {}),
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
        navigator.clipboard.writeText(enlace(token)).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        });
    };

    const compartir = () => {
        navigator.share({ title: via ? `Vía ${via.info?.nombre || ''}`.trim() : 'Croquis', url: enlace(token) }).catch(() => {});
    };

    // Abierto: cualquiera, con o sin cuenta, propone cambios desde el visor sin necesitar el enlace
    const cambiarAbierto = async () => {
        setCambiandoAbierto(true);
        setError('');
        try {
            await updateDoc(doc(db, 'croquis_escalada', croquisId), { abiertoPropuestas: !abierto });
            setAbierto(!abierto);
            onAbiertoCambiado?.(!abierto);
        } catch (e) {
            setError('No se pudo cambiar: ' + e.message);
        }
        setCambiandoAbierto(false);
    };

    const revocar = async () => {
        if (!window.confirm('El enlace dejará de funcionar para todas las personas que lo tengan. ¿Continuar?')) return;
        try {
            await deleteDoc(doc(db, coleccion, token));
            onClose();
        } catch (e) {
            setError('No se pudo desactivar: ' + e.message);
        }
    };

    return (
        <div style={st.overlay}>
            <div style={st.modal}>
                <div style={st.header}>
                    <h3 style={st.titulo}><Share2 size={18} /> {via ? <>Tarjeta de {via.info?.nombre || 'la vía'}</> : 'Pedir sugerencias del croquis'}</h3>
                    <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                </div>
                <div style={{ padding: 20 }}>
                    {estado === 'cargando' && <p style={st.texto}>Preparando el enlace…</p>}
                    {estado === 'sinGuardar' && <p style={st.texto}>Guarda el croquis antes de compartir{via ? ' esta vía' : 'lo'}.</p>}
                    {error && <p style={st.error}>{error}</p>}
                    {estado === 'listo' && !via && (
                        <div style={{ ...st.interruptor, borderColor: abierto ? '#f39c12' : '#dfe6e9', background: abierto ? '#fef5e7' : '#f8f9fa' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 'bold', color: '#2c3e50', fontSize: '0.92rem' }}>
                                <input type="checkbox" checked={abierto} disabled={cambiandoAbierto} onChange={cambiarAbierto} style={{ width: 18, height: 18, accentColor: '#f39c12' }} />
                                Croquis abierto a propuestas
                            </label>
                            <p style={{ ...st.texto, margin: '6px 0 0' }}>
                                {abierto
                                    ? 'Cualquiera que vea el croquis, aunque no tenga cuenta, puede proponer cambios en los trazados, nombres y demás datos de las vías, o añadir vías. Te llegan para que las revises.'
                                    : 'Solo pueden proponer cambios quienes tengan el enlace de abajo.'}
                                {' Las personas que invitas por correo como editoras guardan sus cambios directamente, sin tu validación.'}
                            </p>
                        </div>
                    )}
                    {estado === 'listo' && (
                        <>
                            <p style={st.texto}>
                                {via
                                    ? 'Quien abra este enlace podrá proponer cambios en los datos y el trazado de esta vía, sin necesidad de registrarse.'
                                    : 'Quien abra este enlace podrá proponer cambios en cualquier vía del croquis y añadir vías nuevas, sin necesidad de registrarse.'}
                                {' Te llegará como propuesta en las notificaciones y solo se aplica si la aceptas.'}
                            </p>
                            <input readOnly value={enlace(token)} onFocus={e => e.target.select()} style={st.enlace} />
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
    interruptor: { border: '2px solid', borderRadius: 10, padding: 12, marginBottom: 14 },
    btnRevocar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', marginTop: 12, padding: 8, background: 'white', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.82rem' },
};
