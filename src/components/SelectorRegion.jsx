import React, { useState } from 'react';
import { PAISES, REGIONES } from '../utils/regiones';

const OTRO = '__otro__';

// País y comunidad/región. onChange({ pais, comunidad })
export default function SelectorRegion({ pais = '', comunidad = '', onChange, inputStyle, labelStyle, obligatorio = false }) {
    // Un país guardado que no está en la lista se edita como texto libre
    const [otroPais, setOtroPais] = useState(Boolean(pais) && !PAISES.includes(pais));
    const regiones = REGIONES[pais] || [];
    const marca = obligatorio ? ' *' : '';

    const elegirPais = (valor) => {
        if (valor === OTRO) { setOtroPais(true); onChange({ pais: '', comunidad: '' }); return; }
        setOtroPais(false);
        onChange({ pais: valor, comunidad: '' });
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div>
                <label style={labelStyle}>País{marca}</label>
                <select value={otroPais ? OTRO : pais} onChange={e => elegirPais(e.target.value)} style={inputStyle} aria-label="País">
                    <option value="">Elige un país…</option>
                    {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
                    <option value={OTRO}>Otro país…</option>
                </select>
                {otroPais && (
                    <input value={pais} onChange={e => onChange({ pais: e.target.value, comunidad })} placeholder="Nombre del país"
                        style={{ ...inputStyle, marginTop: 6 }} autoFocus />
                )}
            </div>
            <div>
                <label style={labelStyle}>Comunidad / región{marca}</label>
                {regiones.length > 0 ? (
                    <select value={comunidad} onChange={e => onChange({ pais, comunidad: e.target.value })} style={inputStyle} aria-label="Comunidad">
                        <option value="">Elige…</option>
                        {regiones.map(r => <option key={r} value={r}>{r}</option>)}
                        {comunidad && !regiones.includes(comunidad) && <option value={comunidad}>{comunidad}</option>}
                    </select>
                ) : (
                    <input value={comunidad} onChange={e => onChange({ pais, comunidad: e.target.value })} disabled={!pais}
                        placeholder={pais ? 'Región, estado o provincia' : 'Elige antes el país'} style={inputStyle} aria-label="Comunidad" />
                )}
            </div>
        </div>
    );
}
