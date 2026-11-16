import React, { useState } from 'react';
import { cargarViasSugeridas, claveVia } from '../utils/viasEquipador';
import { normalizarNombre } from '../utils/escuelas';

// Campo de nombre de vía que sugiere las vías subidas por equipadores que aún no
// están en ningún croquis. Primero las del mismo sector y escuela del croquis.
// excluir: Set de claves escuela|nombre ya presentes en este croquis.
export default function ViaNombreInput({ label, value, onChange, onElegir, escuela, sector, excluir, inputStyle, labelStyle, ph }) {
    const [sugeridas, setSugeridas] = useState([]);
    const [abierto, setAbierto] = useState(false);

    const abrir = () => {
        setAbierto(true);
        cargarViasSugeridas().then(setSugeridas);
    };

    const esc = normalizarNombre(escuela);
    const sec = normalizarNombre(sector);
    const texto = normalizarNombre(value);
    const rango = (v) => (normalizarNombre(v.escuela) === esc ? 0 : 2) + (normalizarNombre(v.sector) === sec ? 0 : 1);

    const lista = sugeridas
        .filter(v => !excluir?.has(claveVia(escuela, v.nombre)))
        .filter(v => texto
            ? normalizarNombre(v.nombre).includes(texto) && normalizarNombre(v.nombre) !== texto
            : esc && normalizarNombre(v.escuela) === esc)
        .sort((a, b) => rango(a) - rango(b) || a.nombre.localeCompare(b.nombre))
        .slice(0, 10);

    return (
        <div style={{ marginBottom: 15, position: 'relative' }}>
            <label style={labelStyle}>{label}</label>
            <input value={value} onChange={e => onChange(e.target.value)} placeholder={ph} style={inputStyle}
                onFocus={abrir} onBlur={() => setTimeout(() => setAbierto(false), 150)} />
            {abierto && lista.length > 0 && (
                <div style={st.lista}>
                    <div style={st.cabecera}>Vías de equipadores sin croquis</div>
                    {lista.map((v, i) => (
                        <div key={`${v.equipadorId}-${i}-${v.nombre}`} style={st.opcion}
                            onMouseDown={() => { onElegir(v); setAbierto(false); }}>
                            <span style={st.grado}>{v.grado || '?'}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <strong>{v.nombre}</strong>
                                <span style={st.detalle}>
                                    {[v.sector, v.escuela, v.anio].filter(Boolean).join(' · ')}{v.equipadorNombre ? ` · 🔩 ${v.equipadorNombre}` : ''}
                                </span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const st = {
    lista: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '2px solid #27ae60', borderRadius: '0 0 8px 8px', boxShadow: '0 6px 16px rgba(0,0,0,0.15)', maxHeight: 240, overflowY: 'auto' },
    cabecera: { padding: '6px 12px', fontSize: '0.72rem', fontWeight: 'bold', color: '#1e8449', background: '#eafaf1', textTransform: 'uppercase' },
    opcion: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', fontSize: '0.92rem', borderBottom: '1px solid #f0f0f0', color: '#2c3e50' },
    grado: { background: '#2c3e50', color: 'white', borderRadius: 6, padding: '3px 6px', fontWeight: 'bold', fontSize: '0.78rem', minWidth: 30, textAlign: 'center', flexShrink: 0 },
    detalle: { display: 'block', fontSize: '0.75rem', color: '#7f8c8d' },
};
