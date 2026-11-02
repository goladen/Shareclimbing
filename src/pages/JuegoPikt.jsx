import React, { useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useAccesoDirecto } from '../utils/accesoDirecto';
import BotonAccesoDirecto from '../components/BotonAccesoDirecto';

// Juegos y herramientas de escalada de pikt.es. Se muestran incrustados desde allí: cada uno
// sigue funcionando con la base de datos y las cuentas de pikt.es.
export const URL_PIKT = 'https://www.pikt.es/escalada';

export const JUEGOS_PIKT = [
    { path: 'trivial', emoji: '🧗', titulo: 'Trivial de escalada', desc: 'Preguntas por categorías sobre escalada, hasta 6 jugadores.', color: '#16a085' },
    { path: 'whoknows', emoji: '🧠', titulo: 'Who Knows?', desc: 'Test cronometrado por categorías con ranking global.', color: '#22c55e' },
    { path: 'send', emoji: '✉️', titulo: 'Send your question', desc: 'Envía tus preguntas al banco de escalada.', color: '#3498db' },
    { path: 'simulador', emoji: '🪂', titulo: 'Simulador de caída', desc: 'Fuerzas de una caída según cuerda, factor y anclaje.', color: '#e67e22' },
    { path: 'lluvia', emoji: '🌧️', titulo: 'Lluvia acumulada', desc: 'Lluvia de las últimas 24 h, semana, mes y año en cada zona.', color: '#2980b9' },
];

export function TarjetasJuegos({ onAbrir }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
            {JUEGOS_PIKT.map(j => (
                <button key={j.path} onClick={() => onAbrir(j.path)} style={{ ...st.tarjeta, borderTop: `4px solid ${j.color}` }}>
                    <div style={{ fontSize: '2rem', marginBottom: 6 }}>{j.emoji}</div>
                    <div style={{ fontWeight: 'bold', color: '#2c3e50', marginBottom: 4 }}>{j.titulo}</div>
                    <div style={{ fontSize: '0.84rem', color: '#7f8c8d', lineHeight: 1.4 }}>{j.desc}</div>
                </button>
            ))}
            <a href={URL_PIKT} target="_blank" rel="noreferrer" style={{ ...st.tarjeta, borderTop: '4px solid #2c3e50', textDecoration: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontWeight: 'bold', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: 6 }}>Ver todo en pikt.es <ExternalLink size={15} /></div>
                <div style={{ fontSize: '0.84rem', color: '#7f8c8d', marginTop: 4 }}>Se abre en una pestaña nueva.</div>
            </a>
        </div>
    );
}

export default function JuegoPikt({ path, onVolver }) {
    const juego = JUEGOS_PIKT.find(j => j.path === path);
    const url = `${URL_PIKT}/${path}`;
    const [cargado, setCargado] = useState(false);
    useAccesoDirecto(juego?.titulo || 'Juegos');

    return (
        <div style={st.app}>
            <div style={st.topbar}>
                <button onClick={onVolver} style={st.btnIcono} title="Volver"><ArrowLeft size={20} /></button>
                <div style={{ color: 'white', fontWeight: 'bold', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {juego ? `${juego.emoji} ${juego.titulo}` : 'Juego'}
                </div>
                <BotonAccesoDirecto nombre={juego?.titulo || 'Juegos'} estilo={st.btnIcono} />
                <a href={url} target="_blank" rel="noreferrer" style={{ ...st.btnIcono, textDecoration: 'none' }} title="Abrir en pikt.es">
                    <ExternalLink size={18} />
                </a>
            </div>
            <div style={{ flex: 1, position: 'relative', background: '#0f172a' }}>
                {!cargado && <div style={st.cargando}>Cargando desde pikt.es…</div>}
                <iframe src={url} title={juego?.titulo || 'Juego de pikt.es'} onLoad={() => setCargado(true)}
                    allow="fullscreen; clipboard-write; autoplay; geolocation"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
            </div>
        </div>
    );
}

const st = {
    app: { display: 'flex', flexDirection: 'column', height: '100dvh', fontFamily: "'Segoe UI', Tahoma, sans-serif" },
    topbar: { background: '#2c3e50', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
    btnIcono: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' },
    cargando: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' },
    tarjeta: { background: 'white', border: 'none', borderRadius: 12, padding: 16, textAlign: 'left', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontFamily: 'inherit' },
};
