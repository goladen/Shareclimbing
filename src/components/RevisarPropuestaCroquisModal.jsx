import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import CroquisImagen from './CroquisImagen';
import { aplicarAVia, aplicarCambiosCroquis, fotosDeCroquis, resolverEquipadores, viaDeCambioNuevo } from '../utils/equipadores';

const CAMPOS = [
    ['nombre', 'Nombre'], ['grado', 'Grado'], ['numero', 'Número'],
    ['equipador', 'Equipador'], ['anio', 'Año'], ['info', 'Información'],
];

// Revisión de una propuesta enviada desde el enlace de todo el croquis. Cada cambio
// (vía modificada o nueva) se puede marcar o desmarcar; se aplican los marcados.
export default function RevisarPropuestaCroquisModal({ propuesta, onClose, onAplicada }) {
    const { usuario } = useAuth();
    const [croquis, setCroquis] = useState(null); // { datos } | { error }
    const [marcados, setMarcados] = useState(() => propuesta.cambios.map(() => true));
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        getDoc(doc(db, 'croquis_escalada', propuesta.croquisId)).then(snap => {
            setCroquis(snap.exists() ? { datos: { id: snap.id, ...snap.data() } } : { error: 'El croquis ya no existe.' });
        }).catch(e => setCroquis({ error: e.message }));
    }, [propuesta]);

    const fotos = croquis?.datos ? fotosDeCroquis(croquis.datos) : [];
    const colaborador = propuesta.autorNombre;

    // Situación actual de cada cambio en el croquis
    const detalles = propuesta.cambios.map(c => {
        const fotoIdx = fotos.findIndex(f => f.id === c.fotoId);
        const foto = fotos[fotoIdx];
        const via = c.tipo === 'editar' ? foto?.vias?.find(v => v.id === c.viaId) : null;
        const disponible = Boolean(foto && (c.tipo === 'nueva' || via));
        return { c, foto, fotoIdx, via, disponible };
    });
    const seleccion = detalles.filter((d, i) => marcados[i] && d.disponible);

    const responder = async (aceptar) => {
        setProcesando(true);
        setError('');
        try {
            if (aceptar && seleccion.length > 0) {
                const infos = await resolverEquipadores(seleccion.map(d => ({ info: d.c.info })), usuario.uid);
                const cambios = seleccion.map((d, i) => ({ ...d.c, info: infos[i].info }));
                const perdidos = await aplicarCambiosCroquis(propuesta.croquisId, cambios, colaborador);
                if (perdidos > 0) alert(`${perdidos} cambio(s) no se aplicaron porque la vía o la foto ya no existen.`);
            }
            const estado = !aceptar || seleccion.length === 0 ? 'rechazada'
                : seleccion.length < propuesta.cambios.length ? 'aceptada_parcial' : 'aceptada';
            await updateDoc(doc(db, 'propuestas_croquis', propuesta.id), { estado });
            onAplicada?.(aceptar && seleccion.length > 0);
            onClose();
        } catch (e) {
            setError('No se pudo completar: ' + e.message);
            setProcesando(false);
        }
    };

    const titulo = croquis?.datos && [croquis.datos.infoCroquis?.escuela, croquis.datos.infoCroquis?.sector].filter(Boolean).join(' · ');

    return (
        <div style={st.overlay} onMouseDown={e => e.stopPropagation()}>
            <div style={st.modal}>
                <div style={st.header}>
                    <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '1.05rem' }}>Propuesta de {propuesta.autorNombre}</h3>
                    <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                </div>
                <div style={st.cuerpo}>
                    {!croquis && <p style={{ color: '#7f8c8d' }}>Cargando…</p>}
                    {croquis?.error && <p style={st.error}>{croquis.error}</p>}
                    {error && <p style={st.error}>{error}</p>}
                    {croquis?.datos && (
                        <>
                            {titulo && <p style={{ color: '#555', fontSize: '0.88rem', margin: '0 0 6px' }}>{titulo}</p>}
                            <p style={{ color: '#7f8c8d', fontSize: '0.8rem', margin: '0 0 10px' }}>
                                {propuesta.cambios.length} cambio(s). Desmarca los que no quieras aplicar. {propuesta.autorNombre} quedará como colaborador de las vías aceptadas.
                            </p>
                            {detalles.map((d, i) => (
                                <Cambio key={i} detalle={d} varias={fotos.length > 1} colaborador={colaborador}
                                    marcado={marcados[i] && d.disponible}
                                    onMarcar={v => setMarcados(m => m.map((x, j) => j === i ? v : x))} />
                            ))}
                        </>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button onClick={() => responder(false)} disabled={procesando} style={{ ...st.btn, background: '#f0f0f0', color: '#c0392b' }}>Rechazar todo</button>
                        {croquis?.datos && (
                            <button onClick={() => responder(true)} disabled={procesando || seleccion.length === 0} style={{ ...st.btn, background: '#27ae60', color: 'white', opacity: seleccion.length === 0 ? 0.5 : 1 }}>
                                <Check size={16} /> {procesando ? 'Aplicando…' : seleccion.length === propuesta.cambios.length ? 'Aceptar todo' : `Aceptar ${seleccion.length}`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Cambio({ detalle, varias, colaborador, marcado, onMarcar }) {
    const { c, foto, fotoIdx, via, disponible } = detalle;
    const actual = via?.info || {};
    const propuesto = c.info || {};
    const esNueva = c.tipo === 'nueva';
    const viaPropuesta = !disponible ? null : esNueva ? viaDeCambioNuevo(c, 'nueva', colaborador) : aplicarAVia(via, c, colaborador);
    const campos = esNueva ? CAMPOS.filter(([k]) => propuesto[k]) : CAMPOS.filter(([k]) => (actual[k] || '') !== (propuesto[k] || ''));
    const cambiaTrazado = c.trazado && foto?.imagenUrl && (esNueva || JSON.stringify([via.inicio, via.fin, via.intermedios || []]) !== JSON.stringify([c.trazado.inicio, c.trazado.fin, c.trazado.intermedios || []]));

    return (
        <div style={{ ...st.cambio, opacity: disponible ? 1 : 0.55 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disponible ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={marcado} disabled={!disponible} onChange={e => onMarcar(e.target.checked)} />
                <strong style={{ color: esNueva ? '#27ae60' : '#d68910', fontSize: '0.78rem' }}>{esNueva ? 'NUEVA' : 'CAMBIO'}</strong>
                <span style={{ fontWeight: 'bold', color: '#2c3e50', overflowWrap: 'anywhere' }}>{propuesto.nombre || actual.nombre || 'Vía'}</span>
                {varias && foto && <span style={{ color: '#95a5a6', fontSize: '0.78rem' }}>· {foto.nombre || `Foto ${fotoIdx + 1}`}</span>}
            </label>
            {!disponible && <p style={{ ...st.error, marginTop: 6 }}>{foto ? 'La vía ya no existe en el croquis.' : 'La foto ya no existe en el croquis.'}</p>}
            {disponible && campos.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: 6 }}>
                    {!esNueva && (
                        <thead>
                            <tr style={{ textAlign: 'left', color: '#7f8c8d' }}>
                                <th style={st.celda}></th><th style={st.celda}>Ahora</th><th style={st.celda}>Propuesto</th>
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {campos.map(([clave, etiqueta]) => (
                            <tr key={clave} style={{ borderTop: '1px solid #ecf0f1' }}>
                                <td style={{ ...st.celda, fontWeight: 'bold', color: '#34495e' }}>{etiqueta}</td>
                                {!esNueva && <td style={{ ...st.celda, color: '#7f8c8d', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{actual[clave] || '–'}</td>}
                                <td style={{ ...st.celda, fontWeight: 'bold', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{propuesto[clave] || '–'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {disponible && !esNueva && campos.length === 0 && !cambiaTrazado && <p style={{ color: '#7f8c8d', fontSize: '0.8rem', margin: '6px 0 0' }}>Sin diferencias con la vía actual.</p>}
            {disponible && cambiaTrazado && (
                <div className={esNueva ? undefined : 'propuesta-trazados'} style={esNueva ? { marginTop: 10 } : undefined}>
                    {(esNueva ? [['Trazado', viaPropuesta]] : [['Trazado actual', via], ['Trazado propuesto', viaPropuesta]]).map(([t, v]) => (
                        <div key={t}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#34495e', marginBottom: 4 }}>{t}</div>
                            <CroquisImagen foto={{ ...foto, vias: [v], combinaciones: [], formas: [] }} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16, cursor: 'default' },
    modal: { background: 'white', width: '100%', maxWidth: 720, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' },
    header: { background: '#f8f9fa', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1', flexShrink: 0 },
    btnClose: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' },
    cuerpo: { padding: 18, overflowY: 'auto' },
    cambio: { border: '1px solid #ecf0f1', borderRadius: 10, padding: 12, marginBottom: 10 },
    celda: { padding: '6px', verticalAlign: 'top' },
    error: { background: '#fdecea', color: '#c0392b', padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem' },
    btn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
};
