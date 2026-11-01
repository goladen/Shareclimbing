import React, { useState, useEffect } from 'react';
import { X, Mountain, Search, Unlink } from 'lucide-react';
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { normalizarNombre, nombreCroquis, notificarAsociacion } from '../utils/escuelas';

// Permite a quien edita un croquis elegir la escuela a la que pertenece
export function AsociarEscuelaModal({ croquis, onClose, onAsociado }) {
    const { usuario } = useAuth();
    const [escuelas, setEscuelas] = useState(null);
    const [busqueda, setBusqueda] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const info = croquis.infoCroquis || {};
    const actual = normalizarNombre(info.escuela);

    useEffect(() => {
        getDocs(collection(db, 'escuelas'))
            .then(snap => setEscuelas(
                snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
            ))
            .catch(e => { setEscuelas([]); setError('No se pudieron cargar las escuelas: ' + e.message); });
    }, []);

    const cambiarEscuela = async (escuela) => {
        setGuardando(true);
        setError('');
        try {
            const nombre = escuela?.nombre || '';
            await updateDoc(doc(db, 'croquis_escalada', croquis.id), { 'infoCroquis.escuela': nombre });
            if (escuela) await notificarAsociacion({ escuela, croquisId: croquis.id, infoCroquis: info, usuario });
            onAsociado(nombre);
            onClose();
        } catch (e) {
            setError('Error al guardar: ' + e.message);
            setGuardando(false);
        }
    };

    const filtradas = (escuelas || []).filter(e => normalizarNombre(e.nombre).includes(normalizarNombre(busqueda)));

    return (
        <div style={st.overlay} onClick={e => e.stopPropagation()}>
            <div style={st.modal}>
                <div style={st.header}>
                    <h3 style={st.titulo}><Mountain size={20} /> Asociar a una escuela</h3>
                    <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                </div>
                <div style={st.cuerpo}>
                    {error && <p style={st.error}>{error}</p>}
                    <p style={st.ayuda}>Quien creó la escuela recibirá un aviso y podrá desvincular el croquis si no corresponde.</p>
                    <div style={{ position: 'relative', marginBottom: 10 }}>
                        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#95a5a6' }} />
                        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar escuela…" style={st.buscador} />
                    </div>
                    <div style={st.lista}>
                        {escuelas === null && <p style={st.vacio}>Cargando…</p>}
                        {escuelas !== null && filtradas.length === 0 && <p style={st.vacio}>No hay escuelas con ese nombre.</p>}
                        {filtradas.map(e => {
                            const esActual = normalizarNombre(e.nombre) === actual;
                            return (
                                <button key={e.id} disabled={guardando || esActual} onClick={() => cambiarEscuela(e)}
                                    style={{ ...st.fila, background: esActual ? '#eafaf1' : 'white', cursor: esActual ? 'default' : 'pointer' }}>
                                    ⛰️ <span style={{ flex: 1, textAlign: 'left' }}>{e.nombre}</span>
                                    {esActual && <span style={{ color: '#27ae60', fontSize: '0.78rem', fontWeight: 'bold' }}>Actual</span>}
                                </button>
                            );
                        })}
                    </div>
                    {actual && (
                        <button disabled={guardando} onClick={() => cambiarEscuela(null)} style={st.btnQuitar}>
                            Quitar de {info.escuela}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// Permite a quien creó la escuela retirar un croquis explicando el motivo a su autor
export function DesvincularCroquisModal({ croquisId, croquisNombre, escuela, onClose, onDesvinculado }) {
    const { usuario } = useAuth();
    const [motivo, setMotivo] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    const desvincular = async () => {
        const texto = motivo.trim();
        if (!texto) { setError('Explica el motivo: el autor del croquis lo recibirá.'); return; }
        setGuardando(true);
        setError('');
        try {
            const ref = doc(db, 'croquis_escalada', croquisId);
            const snap = await getDoc(ref);
            // Puede haberse borrado o movido a otra escuela desde que llegó el aviso
            if (!snap.exists() || normalizarNombre(snap.data().infoCroquis?.escuela) !== normalizarNombre(escuela.nombre)) {
                onDesvinculado?.(croquisId);
                onClose();
                return;
            }
            const croquis = snap.data();
            // desvinculadoDe permite a las reglas de Firestore comprobar que esta persona creó la escuela
            await updateDoc(ref, { 'infoCroquis.escuela': '', desvinculadoDe: escuela.id });
            if (croquis.creadoPor && croquis.creadoPor !== usuario.uid) {
                await addDoc(collection(db, 'notificaciones', croquis.creadoPor, 'items'), {
                    tipo: 'croquis_desvinculado',
                    croquisId,
                    croquisNombre: nombreCroquis(croquis.infoCroquis),
                    escuelaId: escuela.id,
                    escuelaNombre: escuela.nombre,
                    autorNombre: usuario.displayName || usuario.email.split('@')[0],
                    textoPreview: texto,
                    leido: false,
                    createdAt: serverTimestamp(),
                });
            }
            onDesvinculado?.(croquisId);
            onClose();
        } catch (e) {
            setError('No se pudo desvincular: ' + e.message);
            setGuardando(false);
        }
    };

    return (
        <div style={st.overlay} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
            <div style={st.modal}>
                <div style={st.header}>
                    <h3 style={st.titulo}><Unlink size={20} /> Desvincular croquis</h3>
                    <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                </div>
                <div style={st.cuerpo}>
                    {error && <p style={st.error}>{error}</p>}
                    <p style={st.ayuda}>
                        <strong>{croquisNombre}</strong> dejará de aparecer en <strong>{escuela.nombre}</strong>. El croquis no se borra.
                    </p>
                    <label style={{ display: 'block', fontWeight: 'bold', color: '#34495e', marginBottom: 6, fontSize: '0.87rem' }}>
                        ¿Por qué no debe estar aquí? *
                    </label>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={4} autoFocus
                        placeholder="Ej: Este sector pertenece a otra escuela…"
                        style={{ width: '100%', padding: 10, border: '2px solid #bdc3c7', borderRadius: 8, fontSize: '0.95rem', fontFamily: 'inherit', resize: 'vertical', color: '#2c3e50' }} />
                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button onClick={onClose} style={{ flex: 1, padding: 10, background: '#f0f0f0', color: '#2c3e50', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Cancelar</button>
                        <button onClick={desvincular} disabled={guardando} style={{ flex: 1, padding: 10, background: '#e74c3c', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', opacity: guardando ? 0.6 : 1 }}>
                            {guardando ? 'Enviando…' : 'Desvincular y avisar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 20, cursor: 'default' },
    modal: { background: 'white', width: '100%', maxWidth: 460, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
    header: { background: '#f8f9fa', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1' },
    titulo: { margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#2c3e50', fontSize: '1.05rem' },
    btnClose: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' },
    cuerpo: { padding: 20 },
    ayuda: { color: '#555', fontSize: '0.88rem', marginBottom: 12, lineHeight: 1.45 },
    error: { background: '#fdecea', color: '#c0392b', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: '0.88rem' },
    buscador: { width: '100%', padding: '9px 12px 9px 32px', border: '2px solid #bdc3c7', borderRadius: 8, fontSize: '0.92rem', color: '#2c3e50', outline: 'none' },
    lista: { maxHeight: '40vh', overflowY: 'auto', border: '1px solid #ecf0f1', borderRadius: 8 },
    fila: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 12px', border: 'none', borderBottom: '1px solid #f0f0f0', color: '#2c3e50', fontSize: '0.92rem' },
    vacio: { padding: 16, color: '#95a5a6', textAlign: 'center', fontSize: '0.88rem' },
    btnQuitar: { width: '100%', marginTop: 12, padding: 9, background: 'white', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' },
};
