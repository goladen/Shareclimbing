import React from 'react';
import { BookOpen, Link as LinkIcon, Plus, Trash2, ExternalLink } from 'lucide-react';

// Bibliografía y enlaces de interés de una escuela o un sector.
// Cada referencia: { tipo: 'bibliografia' | 'enlace', titulo, detalle, url }

export const normalizarUrl = (url) => {
    const u = (url || '').trim();
    if (!u) return '';
    return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

// Quita las filas vacías y deja las URL completas antes de guardar
export const limpiarReferencias = (refs = []) => refs
    .map(r => ({ tipo: r.tipo || 'enlace', titulo: (r.titulo || '').trim(), detalle: (r.detalle || '').trim(), url: normalizarUrl(r.url) }))
    .filter(r => r.titulo || r.url);

export function EditorReferencias({ referencias = [], onChange, inputStyle }) {
    const cambiar = (i, campo, valor) => onChange(referencias.map((r, idx) => idx === i ? { ...r, [campo]: valor } : r));
    const anadir = (tipo) => onChange([...referencias, { tipo, titulo: '', detalle: '', url: '' }]);
    const quitar = (i) => onChange(referencias.filter((_, idx) => idx !== i));

    return (
        <div>
            {referencias.map((r, i) => (
                <div key={i} style={st.fila}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={st.tipo}>{r.tipo === 'bibliografia' ? <><BookOpen size={13} /> Bibliografía</> : <><LinkIcon size={13} /> Enlace</>}</span>
                        <button type="button" onClick={() => quitar(i)} style={st.btnQuitar} title="Quitar"><Trash2 size={14} /></button>
                    </div>
                    <input value={r.titulo} onChange={e => cambiar(i, 'titulo', e.target.value)} style={inputStyle}
                        placeholder={r.tipo === 'bibliografia' ? 'Título (ej: Guía de escalada de Rodellar)' : 'Título (ej: Web del refugio)'} aria-label="Título de la referencia" />
                    {r.tipo === 'bibliografia' && (
                        <input value={r.detalle} onChange={e => cambiar(i, 'detalle', e.target.value)} style={{ ...inputStyle, marginTop: 6 }}
                            placeholder="Autor, editorial, año…" aria-label="Autor y edición" />
                    )}
                    <input value={r.url} onChange={e => cambiar(i, 'url', e.target.value)} style={{ ...inputStyle, marginTop: 6 }} inputMode="url"
                        placeholder={r.tipo === 'bibliografia' ? 'Enlace donde conseguirlo (opcional)' : 'https://…'} aria-label="Dirección web" />
                </div>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => anadir('bibliografia')} style={st.btnAnadir}><Plus size={14} /> Bibliografía</button>
                <button type="button" onClick={() => anadir('enlace')} style={st.btnAnadir}><Plus size={14} /> Enlace de interés</button>
            </div>
        </div>
    );
}

export function ListaReferencias({ referencias = [] }) {
    const libros = referencias.filter(r => r.tipo === 'bibliografia');
    const enlaces = referencias.filter(r => r.tipo !== 'bibliografia');
    if (!referencias.length) return null;
    const item = (r, i) => (
        <li key={i} style={{ marginBottom: 8, overflowWrap: 'anywhere' }}>
            {r.url
                ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={st.enlace}>{r.titulo || r.url} <ExternalLink size={12} style={{ verticalAlign: '-1px' }} /></a>
                : <strong>{r.titulo}</strong>}
            {r.detalle && <span style={{ color: '#7f8c8d' }}> · {r.detalle}</span>}
        </li>
    );
    return (
        <div style={{ color: '#2c3e50', lineHeight: 1.45 }}>
            {libros.length > 0 && (
                <>
                    <div style={st.subtitulo}><BookOpen size={15} /> Bibliografía</div>
                    <ul style={st.lista}>{libros.map(item)}</ul>
                </>
            )}
            {enlaces.length > 0 && (
                <>
                    <div style={st.subtitulo}><LinkIcon size={15} /> Enlaces de interés</div>
                    <ul style={st.lista}>{enlaces.map(item)}</ul>
                </>
            )}
        </div>
    );
}

const st = {
    fila: { border: '1px solid #ecf0f1', borderRadius: 10, padding: 10, marginBottom: 8, background: '#fbfcfc' },
    tipo: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 'bold', color: '#566573', flex: 1 },
    btnQuitar: { background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: 4, display: 'flex' },
    btnAnadir: { display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', background: 'white', color: '#2c3e50', border: '1px dashed #95a5a6', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.82rem' },
    subtitulo: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold', fontSize: '0.92em', margin: '6px 0 6px' },
    lista: { paddingLeft: 20, margin: '0 0 8px' },
    enlace: { color: '#2980b9', fontWeight: 'bold', textDecoration: 'none' },
};
