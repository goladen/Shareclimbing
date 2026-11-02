import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { doc, getDoc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import CroquisImagen from './CroquisImagen';
import { fotosDeCroquis, resolverEquipadores } from '../utils/equipadores';

const CAMPOS = [
    ['nombre', 'Nombre'], ['grado', 'Grado'], ['numero', 'Número'],
    ['equipador', 'Equipador'], ['anio', 'Año'], ['info', 'Información'],
];

const aplicarAVia = (via, cambios, autorNombre) => {
    const colaboradores = via.info?.colaboradores || [];
    const info = {
        ...via.info,
        ...cambios.info,
        colaboradores: colaboradores.includes(autorNombre) ? colaboradores : [...colaboradores, autorNombre],
    };
    return {
        ...via,
        ...(cambios.trazado || {}),
        info,
        textos: (via.textos || []).map(t => t.type === 'grado' ? { ...t, text: info.grado } : t),
    };
};

// Quien compartió la tarjeta revisa la propuesta. Al aceptarla se aplica con sus
// permisos, como si hubiera hecho el cambio, y quien la envió queda como colaborador.
export default function RevisarPropuestaModal({ propuesta, onClose, onAplicada }) {
    const { usuario } = useAuth();
    const [contexto, setContexto] = useState(null); // { croquis, foto, via } | { error }
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        getDoc(doc(db, 'croquis_escalada', propuesta.croquisId)).then(snap => {
            const croquis = snap.exists() ? { id: snap.id, ...snap.data() } : null;
            const foto = croquis && fotosDeCroquis(croquis).find(f => (f.vias || []).some(v => v.id === propuesta.viaId));
            const via = foto?.vias.find(v => v.id === propuesta.viaId);
            setContexto(via ? { croquis, foto, via } : { error: 'La vía ya no existe en el croquis.' });
        }).catch(e => setContexto({ error: e.message }));
    }, [propuesta]);

    const responder = async (aceptar) => {
        setProcesando(true);
        setError('');
        try {
            if (aceptar) {
                const [cambiosInfo] = await resolverEquipadores([{ info: propuesta.cambios.info }], usuario.uid);
                const cambios = { ...propuesta.cambios, info: cambiosInfo.info };
                const ref = doc(db, 'croquis_escalada', propuesta.croquisId);
                // Se relee el croquis para no pisar cambios hechos mientras tanto en otras vías
                await runTransaction(db, async (tx) => {
                    const snap = await tx.get(ref);
                    if (!snap.exists()) throw new Error('El croquis ya no existe.');
                    let encontrada = false;
                    const fotos = fotosDeCroquis(snap.data()).map(f => ({
                        ...f,
                        vias: (f.vias || []).map(v => {
                            if (v.id !== propuesta.viaId) return v;
                            encontrada = true;
                            return aplicarAVia(v, cambios, propuesta.autorNombre);
                        }),
                    }));
                    if (!encontrada) throw new Error('La vía ya no existe en el croquis.');
                    tx.update(ref, { fotos, vias: fotos[0]?.vias || [], updatedAt: serverTimestamp() });
                });
            }
            await updateDoc(doc(db, 'propuestas_via', propuesta.id), { estado: aceptar ? 'aceptada' : 'rechazada' });
            onAplicada?.(aceptar);
            onClose();
        } catch (e) {
            setError('No se pudo completar: ' + e.message);
            setProcesando(false);
        }
    };

    const actual = contexto?.via?.info || {};
    const propuesto = propuesta.cambios.info || {};

    return (
        <div style={st.overlay} onMouseDown={e => e.stopPropagation()}>
            <div style={st.modal}>
                <div style={st.header}>
                    <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '1.05rem' }}>Propuesta de {propuesta.autorNombre}</h3>
                    <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                </div>
                <div style={st.cuerpo}>
                    {!contexto && <p style={{ color: '#7f8c8d' }}>Cargando…</p>}
                    {contexto?.error && <p style={st.error}>{contexto.error}</p>}
                    {error && <p style={st.error}>{error}</p>}
                    {contexto?.via && (
                        <>
                            <p style={{ color: '#555', fontSize: '0.88rem', marginBottom: 10 }}>
                                {[contexto.croquis.infoCroquis?.escuela, contexto.croquis.infoCroquis?.sector].filter(Boolean).join(' · ')}
                            </p>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', color: '#7f8c8d' }}>
                                        <th style={st.celda}></th><th style={st.celda}>Ahora</th><th style={st.celda}>Propuesto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {CAMPOS.map(([clave, etiqueta]) => {
                                        const cambia = (actual[clave] || '') !== (propuesto[clave] || '');
                                        return (
                                            <tr key={clave} style={{ background: cambia ? '#fff8e1' : 'white', borderTop: '1px solid #ecf0f1' }}>
                                                <td style={{ ...st.celda, fontWeight: 'bold', color: '#34495e' }}>{etiqueta}</td>
                                                <td style={{ ...st.celda, color: '#7f8c8d', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{actual[clave] || '–'}</td>
                                                <td style={{ ...st.celda, fontWeight: cambia ? 'bold' : 'normal', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{propuesto[clave] || '–'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {propuesta.cambios.trazado && contexto.foto.imagenUrl && (
                                <div className="propuesta-trazados">
                                    {[['Trazado actual', contexto.via], ['Trazado propuesto', aplicarAVia(contexto.via, propuesta.cambios, propuesta.autorNombre)]].map(([titulo, v]) => (
                                        <div key={titulo}>
                                            <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#34495e', marginBottom: 4 }}>{titulo}</div>
                                            <CroquisImagen foto={{ ...contexto.foto, vias: [v], combinaciones: [], formas: [] }} />
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p style={{ color: '#7f8c8d', fontSize: '0.8rem', margin: '12px 0 0' }}>
                                Si la aceptas, {propuesta.autorNombre} quedará como colaborador de la vía.
                            </p>
                        </>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button onClick={() => responder(false)} disabled={procesando} style={{ ...st.btn, background: '#f0f0f0', color: '#c0392b' }}>Rechazar</button>
                        {contexto?.via && (
                            <button onClick={() => responder(true)} disabled={procesando} style={{ ...st.btn, background: '#27ae60', color: 'white' }}>
                                <Check size={16} /> {procesando ? 'Aplicando…' : 'Aceptar todo'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16, cursor: 'default' },
    modal: { background: 'white', width: '100%', maxWidth: 720, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' },
    header: { background: '#f8f9fa', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1', flexShrink: 0 },
    btnClose: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' },
    cuerpo: { padding: 18, overflowY: 'auto' },
    celda: { padding: '7px 6px', verticalAlign: 'top' },
    error: { background: '#fdecea', color: '#c0392b', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem' },
    btn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
};
