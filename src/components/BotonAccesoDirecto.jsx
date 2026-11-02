import React, { useState } from 'react';
import { Smartphone, X, Copy, Check, Share2 } from 'lucide-react';
import { instalar, puedeInstalar } from '../utils/accesoDirecto';

const esIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const esAndroid = /Android/i.test(navigator.userAgent);

// Botón para guardar la página actual en la pantalla de inicio o compartir su enlace
export default function BotonAccesoDirecto({ nombre, estilo, conTexto = false }) {
    const [abierto, setAbierto] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const url = window.location.href;

    const abrir = async () => {
        // Donde el navegador lo permite, se instala directamente
        if (puedeInstalar() && await instalar()) return;
        setAbierto(true);
    };

    const copiar = () => navigator.clipboard.writeText(url).then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
    });

    return (
        <>
            <button onClick={abrir} style={estilo} title="Acceso directo en el móvil">
                <Smartphone size={18} />{conTexto && <span style={{ marginLeft: 6 }}>Acceso directo</span>}
            </button>
            {abierto && (
                <div style={st.overlay} onClick={() => setAbierto(false)}>
                    <div style={st.modal} onClick={e => e.stopPropagation()}>
                        <div style={st.header}>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Smartphone size={18} /> Acceso directo a {nombre}
                            </h3>
                            <button onClick={() => setAbierto(false)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={{ padding: 20, color: '#34495e', fontSize: '0.92rem', lineHeight: 1.5 }}>
                            <p style={{ marginBottom: 10 }}>El icono abrirá directamente esta página.</p>
                            {esIOS ? (
                                <ol style={st.pasos}>
                                    <li>Abre esta página en <strong>Safari</strong>.</li>
                                    <li>Pulsa <strong>Compartir</strong> <Share2 size={14} style={{ verticalAlign: '-2px' }} />.</li>
                                    <li>Elige <strong>Añadir a pantalla de inicio</strong>.</li>
                                </ol>
                            ) : esAndroid ? (
                                <ol style={st.pasos}>
                                    <li>Pulsa el menú <strong>⋮</strong> del navegador.</li>
                                    <li>Elige <strong>Añadir a pantalla de inicio</strong> o <strong>Instalar aplicación</strong>.</li>
                                </ol>
                            ) : (
                                <p style={{ marginBottom: 10 }}>Abre este enlace en el móvil y añádelo a la pantalla de inicio desde el menú del navegador.</p>
                            )}
                            <input readOnly value={url} onFocus={e => e.target.select()} style={st.enlace} />
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <button onClick={copiar} style={{ ...st.btn, background: copiado ? '#27ae60' : '#3498db' }}>
                                    {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar enlace'}
                                </button>
                                {navigator.share && (
                                    <button onClick={() => navigator.share({ title: nombre, url }).catch(() => {})} style={{ ...st.btn, background: '#2c3e50' }}>
                                        <Share2 size={16} /> Compartir
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 420, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
    header: { background: '#f8f9fa', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1' },
    btnClose: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' },
    pasos: { paddingLeft: 20, marginBottom: 12 },
    enlace: { width: '100%', padding: '9px 10px', border: '1px solid #bdc3c7', borderRadius: 8, fontSize: '0.8rem', color: '#2c3e50', background: '#f8f9fa' },
    btn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
};
