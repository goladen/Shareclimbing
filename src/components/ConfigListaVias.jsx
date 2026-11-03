import React, { useState } from 'react';
import { Settings, EyeOff, Minus, Plus } from 'lucide-react';

// Cómo se presenta la lista de vías: una sola columna o varias tablas de N vías,
// y si está oculta. Se recuerda en este navegador para cada lugar (visor, impresión).
const POR_DEFECTO = { modo: 'columna', porTabla: 10, oculta: false };

const leer = (clave) => {
    try { return { ...POR_DEFECTO, ...JSON.parse(localStorage.getItem(`listaVias:${clave}`) || '{}') }; }
    catch { return POR_DEFECTO; }
};

export function useConfigListaVias(clave) {
    const [config, setConfig] = useState(() => leer(clave));
    const cambiar = (cambios) => setConfig(c => {
        const nueva = { ...c, ...cambios };
        try { localStorage.setItem(`listaVias:${clave}`, JSON.stringify(nueva)); } catch { /* sin almacenamiento */ }
        return nueva;
    });
    return [config, cambiar];
}

// Parte la lista en grupos según la configuración, conservando su posición original
export function agruparVias(vias, config) {
    const conIndice = vias.map((via, indice) => ({ via, indice }));
    if (config.modo !== 'tablas') return [conIndice];
    const grupos = [];
    for (let i = 0; i < conIndice.length; i += config.porTabla) grupos.push(conIndice.slice(i, i + config.porTabla));
    return grupos;
}

// Rueda dentada con las opciones y botón Ocultar. oscuro: sobre fondo oscuro (visor)
export function ControlesListaVias({ config, onChange, oscuro = false }) {
    const [abierto, setAbierto] = useState(false);
    const c = oscuro ? st.oscuro : st.claro;
    return (
        <div onPointerDown={e => e.stopPropagation()} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => setAbierto(a => !a)} style={{ ...st.btn, ...c.btn }} title="Cómo mostrar la lista de vías" aria-expanded={abierto}>
                    <Settings size={14} />
                </button>
                <button onClick={() => onChange({ oculta: true })} style={{ ...st.btn, ...c.btn }}>
                    <EyeOff size={14} /> Ocultar
                </button>
            </div>
            {abierto && (
                <div style={{ ...st.panel, ...c.panel }}>
                    {[['columna', 'Una columna'], ['tablas', 'Varias tablas']].map(([modo, texto]) => (
                        <label key={modo} style={st.opcion}>
                            <input type="radio" name={`modo-lista-${oscuro ? 'o' : 'c'}`} checked={config.modo === modo} onChange={() => onChange({ modo })} />
                            {texto}
                        </label>
                    ))}
                    {config.modo === 'tablas' && (
                        <div style={{ ...st.opcion, gap: 6 }}>
                            Vías por tabla
                            <button onClick={() => onChange({ porTabla: Math.max(3, config.porTabla - 1) })} style={{ ...st.btnPaso, ...c.btn }} aria-label="Menos vías por tabla"><Minus size={12} /></button>
                            <strong style={{ minWidth: 20, textAlign: 'center' }}>{config.porTabla}</strong>
                            <button onClick={() => onChange({ porTabla: Math.min(30, config.porTabla + 1) })} style={{ ...st.btnPaso, ...c.btn }} aria-label="Más vías por tabla"><Plus size={12} /></button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const st = {
    btn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', fontFamily: 'sans-serif', lineHeight: 1 },
    btnPaso: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, cursor: 'pointer', padding: 0 },
    panel: { marginTop: 6, borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'sans-serif', fontSize: '0.8rem', textAlign: 'left', lineHeight: 1.3 },
    opcion: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
    oscuro: {
        btn: { background: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' },
        panel: { background: 'rgba(255,255,255,0.1)', color: 'white' },
    },
    claro: {
        btn: { background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7' },
        panel: { background: 'white', color: '#2c3e50', boxShadow: '0 4px 14px rgba(0,0,0,0.25)' },
    },
};
