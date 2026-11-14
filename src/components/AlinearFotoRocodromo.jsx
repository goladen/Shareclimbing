import React, { useState, useRef, useMemo } from 'react';
import { X, Check, Camera, Link as LinkIcon, Plus, Minus, Undo2 } from 'lucide-react';
import { formatearMB, MAX_MB } from '../utils/imagen';
import { useSinDesplazarAlArrastrar } from '../utils/arrastreTactil';

const COLORES_PRESA = { inicio: '#27ae60', intermedia: '#f1c40f', fin: '#e74c3c', pie: '#3498db' };

// Transformación de la foto antigua a la nueva a partir de pares de puntos (en px de cada foto).
// Con 2 pares: semejanza (mover, girar, escalar). Con 3 o más bien repartidos: afín por mínimos
// cuadrados, que además corrige algo de inclinación o perspectiva.
export function calcularTransformacion(pares) {
    const n = pares.length;
    if (n < 2) return null;
    const media = (k, c) => pares.reduce((s, p) => s + p[k][c], 0) / n;
    const pm = { x: media('a', 'x'), y: media('a', 'y') };
    const qm = { x: media('b', 'x'), y: media('b', 'y') };

    // Reparto de los puntos de la foto antigua: si están casi en línea, la afín no es fiable
    let sxx = 0, syy = 0, sxy = 0;
    pares.forEach(({ a }) => { const dx = a.x - pm.x, dy = a.y - pm.y; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
    const traza = sxx + syy;
    if (traza === 0) return null;
    const repartidos = n >= 3 && (sxx * syy - sxy * sxy) / ((traza / 2) ** 2) > 0.02;

    let aplicar, escala;
    if (repartidos) {
        // Mínimos cuadrados en coordenadas centradas: [x', y'] = M·[dx, dy] + qm
        let bx1 = 0, bx2 = 0, by1 = 0, by2 = 0;
        pares.forEach(({ a, b }) => {
            const dx = a.x - pm.x, dy = a.y - pm.y, ex = b.x - qm.x, ey = b.y - qm.y;
            bx1 += ex * dx; bx2 += ex * dy; by1 += ey * dx; by2 += ey * dy;
        });
        const det = sxx * syy - sxy * sxy;
        const m11 = (bx1 * syy - bx2 * sxy) / det, m12 = (bx2 * sxx - bx1 * sxy) / det;
        const m21 = (by1 * syy - by2 * sxy) / det, m22 = (by2 * sxx - by1 * sxy) / det;
        aplicar = (p) => ({ x: m11 * (p.x - pm.x) + m12 * (p.y - pm.y) + qm.x, y: m21 * (p.x - pm.x) + m22 * (p.y - pm.y) + qm.y });
        escala = Math.sqrt(Math.abs(m11 * m22 - m12 * m21));
    } else {
        // Semejanza por mínimos cuadrados con números complejos: z' = c·(z - pm) + qm
        let re = 0, im = 0;
        pares.forEach(({ a, b }) => {
            const dx = a.x - pm.x, dy = a.y - pm.y, ex = b.x - qm.x, ey = b.y - qm.y;
            re += ex * dx + ey * dy; im += ey * dx - ex * dy;
        });
        const cr = re / traza, ci = im / traza;
        aplicar = (p) => { const dx = p.x - pm.x, dy = p.y - pm.y; return { x: cr * dx - ci * dy + qm.x, y: ci * dx + cr * dy + qm.y }; };
        escala = Math.hypot(cr, ci);
    }
    const error = pares.reduce((s, { a, b }) => { const q = aplicar(a); return s + Math.hypot(q.x - b.x, q.y - b.y); }, 0) / n;
    return { aplicar, escala, error, tipo: repartidos ? 'afin' : 'semejanza' };
}

// Pasa una presa (fracciones de la foto antigua) a fracciones de la foto nueva
export const moverPresa = (presa, t, viejo, nuevo) => {
    const q = t.aplicar({ x: presa.x * viejo.w, y: presa.y * viejo.h });
    return { ...presa, x: q.x / nuevo.w, y: q.y / nuevo.h, r: presa.r * viejo.w * t.escala / nuevo.w };
};

// Una foto con zoom (desplazable) donde se marcan y arrastran puntos numerados
function PanelFoto({ titulo, src, natural, onCargada, puntos, onTocar, onMover, presas = [], activo, aviso }) {
    const [zoom, setZoom] = useState(1);
    const ref = useRef(null);
    const arrastre = useRef(null);
    useSinDesplazarAlArrastrar(ref);
    const pos = (e) => {
        const r = ref.current.getBoundingClientRect();
        return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    };
    const f = natural ? natural.w / ((ref.current?.getBoundingClientRect().width) || natural.w) : 1;

    return (
        <div className="alinear-panel" style={{ ...st.panel, outline: activo ? '3px solid #f1c40f' : 'none' }}>
            <div style={st.panelCabecera}>
                <strong style={{ fontSize: '0.85rem' }}>{titulo}</strong>
                <span style={{ flex: 1, fontSize: '0.75rem', color: activo ? '#f1c40f' : 'rgba(255,255,255,0.6)', textAlign: 'right' }}>{aviso}</span>
                <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} style={st.btnZoom} title={`Alejar ${titulo.toLowerCase()}`}><Minus size={14} /></button>
                <button onClick={() => setZoom(z => Math.min(5, z + 0.5))} style={st.btnZoom} title={`Acercar ${titulo.toLowerCase()}`}><Plus size={14} /></button>
            </div>
            <div style={st.panelScroll}>
                <div ref={ref} data-panel={titulo} onClick={e => onTocar(pos(e))} style={{ position: 'relative', width: `${zoom * 100}%`, lineHeight: 0, cursor: 'crosshair' }}>
                    <img src={src} alt={titulo} draggable={false} onLoad={e => onCargada?.({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                        style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }} />
                    {natural && (
                        <svg viewBox={`0 0 ${natural.w} ${natural.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                            {presas.map((p, i) => (
                                <circle key={`p${i}`} cx={p.x * natural.w} cy={p.y * natural.h} r={p.r * natural.w} fill="none"
                                    stroke={COLORES_PRESA[p.tipo]} strokeWidth={2.5} vectorEffect="non-scaling-stroke" opacity={0.85} pointerEvents="none" />
                            ))}
                            {puntos.map((p, i) => p && (
                                <g key={i} data-arrastrable="" style={{ cursor: 'move', touchAction: 'none' }}
                                    onClick={e => e.stopPropagation()}
                                    onPointerDown={e => {
                                        e.stopPropagation();
                                        e.currentTarget.setPointerCapture(e.pointerId);
                                        // Se conserva la distancia entre el dedo y el punto: el punto no queda bajo el dedo
                                        const d = pos(e);
                                        arrastre.current = { i, dx: p.x - d.x, dy: p.y - d.y };
                                    }}
                                    onPointerMove={e => {
                                        if (arrastre.current?.i !== i) return;
                                        const d = pos(e);
                                        onMover(i, { x: Math.min(1, Math.max(0, d.x + arrastre.current.dx)), y: Math.min(1, Math.max(0, d.y + arrastre.current.dy)) });
                                    }}
                                    onPointerUp={() => { arrastre.current = null; }}
                                    onPointerCancel={() => { arrastre.current = null; }}>
                                    <circle cx={p.x * natural.w} cy={p.y * natural.h} r={16 * f} fill="transparent" />
                                    <line x1={p.x * natural.w - 12 * f} y1={p.y * natural.h} x2={p.x * natural.w + 12 * f} y2={p.y * natural.h} stroke="white" strokeWidth={3 * f} />
                                    <line x1={p.x * natural.w} y1={p.y * natural.h - 12 * f} x2={p.x * natural.w} y2={p.y * natural.h + 12 * f} stroke="white" strokeWidth={3 * f} />
                                    <line x1={p.x * natural.w - 12 * f} y1={p.y * natural.h} x2={p.x * natural.w + 12 * f} y2={p.y * natural.h} stroke="#e67e22" strokeWidth={1.5 * f} />
                                    <line x1={p.x * natural.w} y1={p.y * natural.h - 12 * f} x2={p.x * natural.w} y2={p.y * natural.h + 12 * f} stroke="#e67e22" strokeWidth={1.5 * f} />
                                    <circle cx={p.x * natural.w + 14 * f} cy={p.y * natural.h - 14 * f} r={9 * f} fill="#e67e22" stroke="white" strokeWidth={1.5 * f} />
                                    <text x={p.x * natural.w + 14 * f} y={p.y * natural.h - 10 * f} textAnchor="middle" fill="white" fontSize={11 * f} fontWeight="bold">{i + 1}</text>
                                </g>
                            ))}
                        </svg>
                    )}
                </div>
            </div>
        </div>
    );
}

// Cambiar la foto de un rocódromo: se marcan los mismos puntos (presas, tornillos, esquinas)
// en la foto actual y en la nueva, y los círculos de todos los bloques se recolocan.
export default function AlinearFotoRocodromo({ foto, bloques, onAsignar, onClose }) {
    const [nueva, setNueva] = useState(null); // { src, file }
    const [tamViejo, setTamViejo] = useState(null);
    const [tamNuevo, setTamNuevo] = useState(null);
    const [pares, setPares] = useState([]); // [{ a: {x,y}, b: {x,y} | null }] en fracciones de cada foto
    const [error, setError] = useState('');
    const [guardando, setGuardando] = useState(false);

    const presasViejas = bloques.flatMap(b => b.presas || []);
    const completos = pares.filter(p => p.a && p.b);
    const pendiente = pares.length > 0 && !pares[pares.length - 1].b;

    const transformacion = useMemo(() => {
        if (!tamViejo || !tamNuevo) return null;
        return calcularTransformacion(completos.map(({ a, b }) => ({
            a: { x: a.x * tamViejo.w, y: a.y * tamViejo.h }, b: { x: b.x * tamNuevo.w, y: b.y * tamNuevo.h },
        })));
    }, [pares, tamViejo, tamNuevo]); // eslint-disable-line

    const presasNuevas = transformacion ? presasViejas.map(p => moverPresa(p, transformacion, tamViejo, tamNuevo)) : [];
    const fuera = presasNuevas.filter(p => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1).length;

    const elegirArchivo = (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size / (1024 * 1024) > MAX_MB) { setError(`La imagen pesa ${formatearMB(file.size)} y supera el límite de ${MAX_MB} MB.`); return; }
        const reader = new FileReader();
        reader.onload = ev => { setError(''); setNueva({ src: ev.target.result, file }); };
        reader.readAsDataURL(file);
    };
    const elegirUrl = () => {
        const url = prompt('Introduce la URL pública de la imagen:');
        if (url?.trim()) { setError(''); setNueva({ src: url.trim(), file: null }); }
    };

    const tocarVieja = (p) => setPares(ps => pendiente
        ? ps.map((x, i) => i === ps.length - 1 ? { ...x, a: p } : x)
        : [...ps, { a: p, b: null }]);
    const tocarNueva = (p) => {
        if (!pendiente) { setError('Marca primero el punto en la foto actual.'); return; }
        setError('');
        setPares(ps => ps.map((x, i) => i === ps.length - 1 ? { ...x, b: p } : x));
    };
    const mover = (lado) => (i, p) => setPares(ps => ps.map((x, idx) => idx === i ? { ...x, [lado]: p } : x));

    const asignar = async () => {
        setGuardando(true);
        try {
            await onAsignar({
                src: nueva.src, file: nueva.file,
                presasDe: (b) => (b.presas || []).map(p => moverPresa(p, transformacion, tamViejo, tamNuevo)),
            });
        } catch (e) {
            setError('No se pudo asignar: ' + e.message);
            setGuardando(false);
        }
    };

    const anchoNuevo = tamNuevo?.w || 1;
    const errorPct = transformacion && completos.length >= 3 ? (transformacion.error / anchoNuevo) * 100 : null;

    return (
        <div style={st.app}>
            <div style={st.topbar}>
                <button onClick={onClose} style={{ ...st.btn, background: 'rgba(255,255,255,0.12)' }}><X size={16} /> Cancelar</button>
                <span style={{ color: 'white', fontWeight: 'bold', flex: 1, textAlign: 'center', minWidth: 0 }}>Cambiar foto</span>
                <button onClick={asignar} disabled={!transformacion || guardando} style={{ ...st.btn, background: '#27ae60', opacity: transformacion && !guardando ? 1 : 0.5 }}>
                    <Check size={16} /> {guardando ? 'Guardando…' : 'Asignar foto'}
                </button>
            </div>
            {!nueva ? (
                <div style={st.elegir}>
                    <p style={{ color: '#34495e', textAlign: 'center', maxWidth: 440 }}>
                        Elige la foto nueva. Después marcarás los mismos puntos en las dos fotos para recolocar los círculos de {bloques.length} {bloques.length === 1 ? 'bloque' : 'bloques'}.
                    </p>
                    {error && <p style={st.error}>{error}</p>}
                    <label style={st.btnGrande}><Camera size={20} /> Hacer foto / Galería
                        <input type="file" accept="image/*" onChange={elegirArchivo} style={{ display: 'none' }} />
                    </label>
                    <button onClick={elegirUrl} style={{ ...st.btnGrande, background: '#f39c12' }}><LinkIcon size={20} /> Desde una URL</button>
                </div>
            ) : (
                <>
                    <div style={st.estado}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            {pendiente
                                ? <>Ahora toca <strong>el mismo punto {pares.length}</strong> en la foto nueva.</>
                                : <>Toca un punto fácil de reconocer en la <strong>foto actual</strong> (una presa, un tornillo, una esquina). {completos.length < 3 ? `Marca al menos ${completos.length < 2 ? 2 : 3} pares, mejor separados.` : ''}</>}
                            {transformacion && <span style={{ display: 'block', fontSize: '0.78rem', marginTop: 2 }}>
                                {completos.length} pares{errorPct !== null && ` · desajuste medio ${errorPct.toFixed(1)} % del ancho`}{fuera > 0 && ` · ${fuera} presas quedarían fuera de la foto`}
                            </span>}
                        </span>
                        {pares.length > 0 && <button onClick={() => setPares(ps => ps.slice(0, -1))} style={st.btnDeshacer}><Undo2 size={14} /> Deshacer</button>}
                    </div>
                    {error && <div style={{ ...st.error, margin: '6px 10px 0' }}>{error}</div>}
                    <div className="alinear-paneles" style={st.paneles}>
                        <PanelFoto titulo="Foto actual" src={foto.imagenUrl} natural={tamViejo} onCargada={setTamViejo}
                            puntos={pares.map(p => p.a)} onTocar={tocarVieja} onMover={mover('a')} presas={presasViejas}
                            activo={!pendiente} aviso={!pendiente ? 'Toca aquí' : ''} />
                        <PanelFoto titulo="Foto nueva" src={nueva.src} natural={tamNuevo} onCargada={setTamNuevo}
                            puntos={pares.map(p => p.b)} onTocar={tocarNueva} onMover={mover('b')} presas={presasNuevas}
                            activo={pendiente} aviso={pendiente ? 'Toca aquí' : transformacion ? 'Vista previa de los círculos' : ''} />
                    </div>
                </>
            )}
        </div>
    );
}

const st = {
    app: { position: 'fixed', inset: 0, zIndex: 2600, display: 'flex', flexDirection: 'column', background: '#1e272e', fontFamily: "'Segoe UI', Tahoma, sans-serif" },
    topbar: { background: '#2c3e50', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
    btn: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' },
    elegir: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, background: '#f4f6f8' },
    btnGrande: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 15, width: '100%', maxWidth: 360, background: '#3498db', color: 'white', borderRadius: 12, cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem', border: 'none' },
    error: { background: '#fdecea', color: '#c0392b', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem' },
    estado: { background: 'white', color: '#2c3e50', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', flexShrink: 0 },
    btnDeshacer: { display: 'flex', alignItems: 'center', gap: 4, padding: '7px 10px', background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 7, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 },
    paneles: { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 8 },
    panel: { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: '#111', borderRadius: 8, overflow: 'hidden' },
    panelCabecera: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', color: 'white', background: '#2c3e50', flexShrink: 0 },
    panelScroll: { flex: 1, overflow: 'auto', minHeight: 0 },
    btnZoom: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'rgba(255,255,255,0.12)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' },
};
