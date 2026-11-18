import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Link as LinkIcon, Plus, Minus, Check, MoveHorizontal, MoveVertical } from 'lucide-react';
import { generarCurvaSuave } from './CroquisImagen';
import { usePinchZoom } from '../utils/pinchZoom';
import { formatearMB, MAX_MB } from '../utils/imagen';

const ordenarPuntos = (v) => {
    const dir = v.inicio && v.fin ? v.fin.y - v.inicio.y : -1;
    const inter = [...(v.intermedios || [])].sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
    return [v.inicio, ...inter, v.fin].filter(Boolean);
};

// Recalcula vías, combinaciones y anotaciones para la foto nueva.
// La foto nueva ocupa en el sistema de la anterior el rectángulo (ox, oy, ancho·k, alto·k).
export function reajustarFoto(foto, { ox, oy, k }) {
    const punto = (p) => p && { ...p, x: (p.x - ox) / k, y: (p.y - oy) / k,
        // El grado de una reunión se guarda desplazado respecto a ella: se escala igual
        ...(p.gdx != null ? { gdx: p.gdx / k, gdy: p.gdy / k } : {}) };
    // Solo se tocan los tamaños que existen: Firestore no admite valores undefined
    const tam = (o) => (o.fontSize ? { fontSize: Math.max(6, Math.round(o.fontSize / k)) } : {});
    const grosor = (g) => Math.min(14, Math.max(1, Math.round((g || 4) / k)));
    const linea = (v) => ({
        ...v,
        inicio: punto(v.inicio),
        fin: punto(v.fin),
        intermedios: (v.intermedios || []).map(punto),
        textos: (v.textos || []).map(t => ({ ...punto(t), ...tam(t) })),
        grosor: grosor(v.grosor),
    });
    return {
        ...foto,
        vias: (foto.vias || []).map(linea),
        combinaciones: (foto.combinaciones || []).map(linea),
        formas: (foto.formas || []).map(f => ({
            ...f, ...punto(f),
            ...(f.w != null ? { w: f.w / k, h: f.h / k } : {}),
            ...(f.grosor ? { grosor: Math.max(1, Math.round(f.grosor / k)) } : {}),
            ...tam(f),
        })),
    };
}

// Cambiar la foto de un croquis conservando sus líneas: se coloca la foto nueva bajo el
// dibujo actual (moverla, ampliarla) y al asignarla las líneas pasan a la foto nueva.
// base: tamaño del sistema de coordenadas de las líneas actuales.
export default function CambiarFotoModal({ foto, base, onAsignar, onClose }) {
    const [nueva, setNueva] = useState(null); // { src, file, esArchivo, w, h }
    const [area, setArea] = useState({ w: 0, h: 0 });
    const [scale, setScale] = useState(1); // px de pantalla por px de la foto nueva
    const [pan, setPan] = useState({ x: 0, y: 0 }); // posición de la foto nueva dentro del marco, en px de pantalla
    const [opacidad, setOpacidad] = useState(0.8);
    const [verAnterior, setVerAnterior] = useState(true);
    const [error, setError] = useState('');
    const areaRef = useRef(null);
    const marcoRef = useRef(null);
    const arrastre = useRef(null);

    useEffect(() => {
        const obs = new ResizeObserver(([e]) => setArea({ w: e.contentRect.width, h: e.contentRect.height }));
        if (areaRef.current) obs.observe(areaRef.current);
        return () => obs.disconnect();
    }, [nueva]);

    // Marco con las proporciones de la foto actual, centrado y con margen para mover la nueva
    const margen = 24;
    const d = area.w ? Math.min((area.w - 2 * margen) / base.w, (area.h - 2 * margen) / base.h) : 0;
    const marco = { w: base.w * d, h: base.h * d };

    const encajar = (modo, img = nueva) => {
        if (!img || !d) return;
        const s = modo === 'alto' ? marco.h / img.h : marco.w / img.w;
        setScale(s);
        setPan({ x: (marco.w - img.w * s) / 2, y: (marco.h - img.h * s) / 2 });
    };

    // Primer encaje en cuanto se conoce el tamaño del marco
    const encajado = useRef(false);
    useEffect(() => {
        if (nueva && d && !encajado.current) { encajado.current = true; encajar('ancho'); }
    }, [nueva, d]); // eslint-disable-line

    const cargar = (src, file) => {
        const img = new Image();
        img.onload = () => {
            encajado.current = false;
            setNueva({ src, file, esArchivo: Boolean(file), w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => setError('No se pudo cargar esa imagen.');
        img.src = src;
    };

    const elegirArchivo = (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size / (1024 * 1024) > MAX_MB) { setError(`La imagen pesa ${formatearMB(file.size)} y supera el límite de ${MAX_MB} MB.`); return; }
        setError('');
        const reader = new FileReader();
        reader.onload = (ev) => cargar(ev.target.result, file);
        reader.readAsDataURL(file);
    };

    const elegirUrl = () => {
        const url = prompt('Introduce la URL pública de la imagen:');
        if (url?.trim()) { setError(''); cargar(url.trim(), null); }
    };

    const pellizco = usePinchZoom({ contenedorRef: marcoRef, scale, setScale, pan, setPan, min: 0.02, max: 20 });

    const zoom = (factor) => {
        // Amplía respecto al centro del marco
        const cx = marco.w / 2, cy = marco.h / 2;
        setScale(s => s * factor);
        setPan(p => ({ x: cx - (cx - p.x) * factor, y: cy - (cy - p.y) * factor }));
    };

    const asignar = () => onAsignar({
        src: nueva.src, file: nueva.file, esArchivo: nueva.esArchivo, w: nueva.w, h: nueva.h,
        transformacion: { ox: pan.x / d, oy: pan.y / d, k: scale / d },
    });

    const lineas = [...(foto.vias || []), ...(foto.combinaciones || [])];

    return (
        <div style={st.app}>
            <div style={st.topbar}>
                <button onClick={onClose} style={{ ...st.btn, background: 'rgba(255,255,255,0.12)' }}><X size={16} /> Cancelar</button>
                <span style={{ color: 'white', fontWeight: 'bold', flex: 1, minWidth: 0, textAlign: 'center' }}>Cambiar foto</span>
                <button onClick={asignar} disabled={!nueva} style={{ ...st.btn, background: '#27ae60', opacity: nueva ? 1 : 0.5 }}>
                    <Check size={16} /> Asignar esta foto
                </button>
            </div>

            {!nueva ? (
                <div style={st.elegir}>
                    <p style={{ color: '#34495e', marginBottom: 16, textAlign: 'center', maxWidth: 420 }}>
                        Elige la foto nueva. Después podrás moverla y ampliarla para que encaje bajo las líneas actuales.
                    </p>
                    {error && <p style={st.error}>{error}</p>}
                    <label style={st.btnGrande}>
                        <Camera size={20} /> Hacer foto / Galería
                        <input type="file" accept="image/*" onChange={elegirArchivo} style={{ display: 'none' }} />
                    </label>
                    <button onClick={elegirUrl} style={{ ...st.btnGrande, background: '#f39c12' }}><LinkIcon size={20} /> Desde una URL</button>
                </div>
            ) : (
                <>
                    <div style={st.herramientas}>
                        <div style={st.fila}>
                            <button onClick={() => zoom(1 / 1.08)} style={st.btnCuadrado} title="Reducir foto"><Minus size={15} /></button>
                            <button onClick={() => zoom(1.08)} style={st.btnCuadrado} title="Ampliar foto"><Plus size={15} /></button>
                            <button onClick={() => encajar('ancho')} style={st.btnTexto}><MoveHorizontal size={14} /> Al ancho</button>
                            <button onClick={() => encajar('alto')} style={st.btnTexto}><MoveVertical size={14} /> Al alto</button>
                        </div>
                        <div style={st.fila}>
                            <label style={st.etiqueta}>
                                Transparencia
                                <input type="range" min="0.2" max="1" step="0.05" value={opacidad} onChange={e => setOpacidad(+e.target.value)} style={{ width: 100 }} />
                            </label>
                            <label style={st.etiqueta}>
                                <input type="checkbox" checked={verAnterior} onChange={e => setVerAnterior(e.target.checked)} /> Foto anterior
                            </label>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#7f8c8d' }}>
                            Arrastra la foto o usa dos dedos para ampliarla hasta que coincida con las líneas.
                        </div>
                    </div>
                    <div ref={areaRef} style={st.area}
                        onPointerDown={(e) => {
                            if (pellizco.onDown(e)) { arrastre.current = null; return; }
                            e.currentTarget.setPointerCapture(e.pointerId);
                            arrastre.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
                        }}
                        onPointerMove={(e) => {
                            if (pellizco.onMove(e)) return;
                            if (arrastre.current) setPan({ x: e.clientX - arrastre.current.x, y: e.clientY - arrastre.current.y });
                        }}
                        onPointerUp={(e) => { pellizco.onUp(e); arrastre.current = null; }}
                        onPointerCancel={(e) => { pellizco.onUp(e); arrastre.current = null; }}
                        onWheel={(e) => zoom(e.deltaY > 0 ? 1 / 1.08 : 1.08)}>
                        {d > 0 && (
                            <div ref={marcoRef} data-marco="" style={{ position: 'absolute', left: (area.w - marco.w) / 2, top: (area.h - marco.h) / 2, width: marco.w, height: marco.h, outline: '2px dashed #f1c40f' }}>
                                {verAnterior && foto.imagenUrl && (
                                    <img src={foto.imagenUrl} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.45, pointerEvents: 'none' }} />
                                )}
                                <img src={nueva.src} alt="Foto nueva" draggable={false}
                                    style={{ position: 'absolute', left: pan.x, top: pan.y, width: nueva.w * scale, height: nueva.h * scale, maxWidth: 'none', opacity: opacidad, pointerEvents: 'none' }} />
                                <svg viewBox={`0 0 ${base.w} ${base.h}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
                                    {lineas.map((v, i) => (
                                        <g key={v.id ?? i}>
                                            <path d={generarCurvaSuave(ordenarPuntos(v))} fill="none" stroke="white" strokeWidth={5} vectorEffect="non-scaling-stroke" opacity={0.8} />
                                            <path d={generarCurvaSuave(ordenarPuntos(v))} fill="none" stroke={v.color || '#e74c3c'} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                                        </g>
                                    ))}
                                </svg>
                            </div>
                        )}
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
    herramientas: { background: 'white', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 },
    fila: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    btnCuadrado: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 34, background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 7, cursor: 'pointer' },
    btnTexto: { display: 'inline-flex', alignItems: 'center', gap: 4, height: 34, padding: '0 10px', background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 7, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' },
    etiqueta: { display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 'bold', color: '#34495e' },
    area: { flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: 'move' },
};
