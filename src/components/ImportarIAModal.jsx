import React, { useState, useMemo } from 'react';
import { X, Copy, Sparkles, CheckCircle } from 'lucide-react';

const COLORES = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e84393'];

export const PROMPT_IA = `Te paso la foto de un croquis de escalada con las vías dibujadas como líneas sobre la roca.
Devuélveme SOLO un bloque JSON, sin explicaciones, con este formato:

{
  "vias": [
    {
      "numero": "1",
      "nombre": "La Esquina",
      "grado": "7b",
      "color": "#e74c3c",
      "puntos": [{"x": 120, "y": 870}, {"x": 125, "y": 640}, {"x": 140, "y": 310}]
    }
  ]
}

Reglas:
- Coordenadas normalizadas de 0 a 1000 sobre la imagen COMPLETA: x=0 borde izquierdo, x=1000 borde derecho, y=0 borde superior, y=1000 borde inferior.
- "puntos": entre 6 y 20 puntos que sigan fielmente el trazado de la línea, ordenados desde el pie de vía (abajo) hasta la reunión (arriba). Incluye las curvas y desplomes.
- "numero", "nombre" y "grado": léelos de la leyenda o de las etiquetas junto a cada línea. Si no aparecen, pon "".
- "color": color de la línea en formato hex.
- Incluye TODAS las vías, aunque estén muy juntas o compartan tramos. No inventes vías que no estén dibujadas.`;

// Extrae el JSON aunque venga dentro de ```json ... ``` o con texto alrededor
const extraerJSON = (texto) => {
    const limpio = texto.replace(/```(?:json)?/gi, '').trim();
    const ini = limpio.search(/[[{]/);
    if (ini < 0) throw new Error('No se encuentra ningún JSON en el texto pegado.');
    const cierre = limpio[ini] === '{' ? '}' : ']';
    const fin = limpio.lastIndexOf(cierre);
    if (fin <= ini) throw new Error('El JSON está incompleto.');
    return JSON.parse(limpio.slice(ini, fin + 1));
};

const aPunto = (p) => {
    if (Array.isArray(p) && p.length >= 2) return { x: Number(p[0]), y: Number(p[1]) };
    if (p && typeof p === 'object') return { x: Number(p.x), y: Number(p.y) };
    return null;
};

// Convierte la respuesta de la IA en vías del editor (coordenadas en píxeles de la foto)
export const convertirRespuestaIA = (texto, srcW, srcH) => {
    const datos = extraerJSON(texto);
    const lista = Array.isArray(datos) ? datos : (datos.vias || datos.routes || datos.lineas || []);
    if (!Array.isArray(lista) || lista.length === 0) throw new Error('El JSON no contiene ninguna vía.');

    const todos = lista.flatMap(v => (v.puntos || v.points || []).map(aPunto)).filter(Boolean);
    const maximo = Math.max(...todos.flatMap(p => [p.x, p.y]).filter(Number.isFinite), 0);
    // Admite coordenadas 0-1 o 0-1000
    const base = maximo <= 1.5 ? 1 : 1000;
    const limitar = (v, m) => Math.min(m, Math.max(0, v));

    const vias = [];
    const sinTrazado = [];
    lista.forEach((v, i) => {
        const puntos = (v.puntos || v.points || []).map(aPunto)
            .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
            .map(p => ({ x: limitar(p.x / base * srcW, srcW), y: limitar(p.y / base * srcH, srcH) }));
        const nombre = String(v.nombre ?? v.name ?? '').trim();
        if (puntos.length < 2) { sinTrazado.push(nombre || `#${i + 1}`); return; }
        // El inicio es el extremo más bajo de la foto (pie de vía)
        if (puntos[0].y < puntos[puntos.length - 1].y) puntos.reverse();
        const color = /^#[0-9a-f]{6}$/i.test(v.color || '') ? v.color : COLORES[i % COLORES.length];
        vias.push({
            id: Date.now() + i,
            inicio: puntos[0],
            fin: puntos[puntos.length - 1],
            intermedios: puntos.slice(1, -1),
            textos: [],
            info: {
                nombre: nombre || `Vía ${i + 1}`,
                grado: String(v.grado ?? v.grade ?? '').trim(),
                equipador: '', info: '', anio: '',
                numero: String(v.numero ?? v.number ?? '').trim(),
            },
            color,
            grosor: 4,
        });
    });
    return { vias: vias.sort((a, b) => a.inicio.x - b.inicio.x), sinTrazado };
};

export default function ImportarIAModal({ srcW, srcH, viasExistentes, onImportar, onClose }) {
    const [texto, setTexto] = useState('');
    const [copiado, setCopiado] = useState(false);

    const resultado = useMemo(() => {
        if (!texto.trim()) return null;
        try { return { ok: true, ...convertirRespuestaIA(texto, srcW, srcH) }; }
        catch (e) { return { ok: false, error: e.message }; }
    }, [texto, srcW, srcH]);

    const copiarPrompt = async () => {
        try { await navigator.clipboard.writeText(PROMPT_IA); }
        catch (_) {
            const ta = document.createElement('textarea');
            ta.value = PROMPT_IA; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove();
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
    };

    const importar = (reemplazar) => {
        if (!resultado?.ok || resultado.vias.length === 0) return;
        onImportar(resultado.vias, reemplazar);
    };

    const btn = { border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ background: 'white', width: '100%', maxWidth: 560, maxHeight: '92dvh', borderRadius: 15, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
                <div style={{ background: '#f8f9fa', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#2c3e50' }}>
                        <Sparkles size={20} color="#8e44ad" /> Importar vías con IA
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' }}><X size={22} /></button>
                </div>

                <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontSize: '0.9rem', color: '#34495e', lineHeight: 1.5 }}>
                        <b>1.</b> Copia el prompt y pégalo en Gemini (o ChatGPT) junto con <b>esta misma foto</b>, sin recortarla.
                    </div>
                    <button onClick={copiarPrompt} style={{ ...btn, background: copiado ? '#27ae60' : '#8e44ad', color: 'white' }}>
                        {copiado ? <><CheckCircle size={18} /> Prompt copiado</> : <><Copy size={18} /> Copiar prompt</>}
                    </button>

                    <div style={{ fontSize: '0.9rem', color: '#34495e' }}>
                        <b>2.</b> Pega aquí la respuesta completa:
                    </div>
                    <textarea
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        placeholder={'{ "vias": [ ... ] }'}
                        style={{ width: '100%', minHeight: 160, padding: 10, borderRadius: 8, border: '2px solid #bdc3c7', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                    />

                    {resultado && !resultado.ok && (
                        <div style={{ background: '#fdecea', color: '#c0392b', padding: 10, borderRadius: 8, fontSize: '0.85rem' }}>
                            {resultado.error}
                        </div>
                    )}
                    {resultado?.ok && (
                        <div style={{ background: '#eafaf1', color: '#1e8449', padding: 10, borderRadius: 8, fontSize: '0.85rem' }}>
                            Se crearán <b>{resultado.vias.length}</b> vías.
                            {resultado.sinTrazado.length > 0 && (
                                <div style={{ color: '#b9770e', marginTop: 4 }}>
                                    Sin trazado (se omiten): {resultado.sinTrazado.join(', ')}
                                </div>
                            )}
                            <div style={{ color: '#555', marginTop: 4 }}>
                                Después revisa cada vía con ✏️ y arrastra los puntos que no encajen.
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button disabled={!resultado?.ok} onClick={() => importar(false)}
                            style={{ ...btn, flex: 1, background: '#2ecc71', color: 'white', opacity: resultado?.ok ? 1 : 0.5 }}>
                            {viasExistentes > 0 ? 'Añadir a las vías actuales' : 'Crear vías'}
                        </button>
                        {viasExistentes > 0 && (
                            <button disabled={!resultado?.ok} onClick={() => importar(true)}
                                style={{ ...btn, flex: 1, background: 'white', border: '2px solid #e74c3c', color: '#e74c3c', opacity: resultado?.ok ? 1 : 0.5 }}>
                                Reemplazar las {viasExistentes}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
