import React from 'react';
import { ArrowLeft } from 'lucide-react';

// Piezas visuales comunes de las páginas de entrenamiento
export function Opciones({ etiqueta, valor, onChange, opciones }) {
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={st.etiqueta}>{etiqueta}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {opciones.map(([v, txt]) => (
                    <button key={v} onClick={() => onChange(v)}
                        style={{ ...st.chip, background: valor === v ? '#2c3e50' : 'white', color: valor === v ? 'white' : '#2c3e50', borderColor: valor === v ? '#2c3e50' : '#dfe4ea' }}>
                        {txt}
                    </button>
                ))}
            </div>
        </div>
    );
}

export const Campo = ({ etiqueta, children }) => <label style={{ display: 'block' }}><span style={st.etiqueta}>{etiqueta}</span>{children}</label>;

export const Test = ({ titulo, ayuda, children }) => (
    <div style={{ padding: '10px 0', borderTop: '1px solid #f0f2f5' }}>
        <strong style={{ fontSize: '0.9rem', color: '#2c3e50' }}>{titulo}</strong>
        <p style={{ ...st.texto, fontSize: '0.8rem', margin: '2px 0 6px' }}>{ayuda}</p>
        <div style={{ maxWidth: 260 }}>{children}</div>
    </div>
);

export const Tarjeta = ({ children, estilo }) => (
    <div style={{ background: 'white', borderRadius: 12, padding: 14, border: '1px solid #dfe4ea', ...estilo }}>{children}</div>
);

export function Marco({ titulo, subtitulo, accion, onVolver, children }) {
    return (
        <div style={{ minHeight: '100vh', background: '#f4f6f8', fontFamily: "'Segoe UI', sans-serif" }}>
            <div style={{ background: '#2c3e50', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={onVolver} style={st.btnHeader}><ArrowLeft size={22} /></button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</div>
                    {subtitulo && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.76rem' }}>{subtitulo}</div>}
                </div>
                {accion}
            </div>
            <div style={{ padding: 16 }}>{children}</div>
        </div>
    );
}

export const Centro = ({ children }) => (
    <div style={{ textAlign: 'center', padding: 40, color: '#7f8c8d', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>{children}</div>
);

export const st = {
    columna: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720, margin: '0 auto' },
    rejilla: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
    h3: { margin: '0 0 8px', fontSize: '1rem', color: '#2c3e50' },
    texto: { margin: '0 0 10px', fontSize: '0.85rem', color: '#555' },
    etiqueta: { display: 'block', fontSize: '0.78rem', color: '#7f8c8d', marginBottom: 4, fontWeight: 600 },
    input: { width: '100%', padding: '8px 10px', border: '1px solid #ced6e0', borderRadius: 8, fontSize: '0.9rem', fontFamily: 'inherit', background: 'white' },
    chip: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', border: '1px solid #dfe4ea', borderRadius: 16, fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 },
    carga: { background: '#eaf2f8', color: '#2471a3', padding: '3px 10px', borderRadius: 12, fontWeight: 'bold', fontSize: '0.88rem' },
    aviso: { display: 'flex', gap: 8, background: '#fef5e7', border: '1px solid #f5cba7', color: '#935116', borderRadius: 10, padding: '10px 12px', fontSize: '0.84rem' },
    th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #dfe4ea', color: '#7f8c8d', fontWeight: 600, whiteSpace: 'nowrap' },
    td: { padding: '6px 8px', borderBottom: '1px solid #f0f2f5', whiteSpace: 'nowrap' },
    btnPrincipal: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
    btnSecundario: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' },
    btnHeader: { background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4, display: 'flex' },
};
