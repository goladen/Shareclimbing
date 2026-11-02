import React, { useState, useRef, useEffect } from 'react';

export const generarCurvaSuave = (puntos) => {
    if (puntos.length === 0) return "";
    if (puntos.length === 1) return `M ${puntos[0].x},${puntos[0].y}`;
    if (puntos.length === 2) return `M ${puntos[0].x},${puntos[0].y} L ${puntos[1].x},${puntos[1].y}`;
    let path = `M ${puntos[0].x},${puntos[0].y}`;
    for (let i = 0; i < puntos.length - 1; i++) {
        const p0 = puntos[Math.max(0, i - 1)];
        const p1 = puntos[i];
        const p2 = puntos[i + 1];
        const p3 = puntos[Math.min(puntos.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
};

// Foto con sus vías, adaptada al ancho disponible. Líneas y números mantienen
// un tamaño legible en pantalla aunque la foto se muestre muy reducida.
export default function CroquisImagen({ foto, onClickVia }) {
    const [natural, setNatural] = useState(null);
    const [anchoVisible, setAnchoVisible] = useState(0);
    const contRef = useRef(null);

    useEffect(() => {
        const obs = new ResizeObserver(([e]) => setAnchoVisible(e.contentRect.width));
        obs.observe(contRef.current);
        return () => obs.disconnect();
    }, []);

    const xRatio = natural && foto.srcW ? natural.w / foto.srcW : 1;
    const yRatio = natural && foto.srcH ? natural.h / foto.srcH : 1;
    // fPantalla: píxeles de la foto por píxel de pantalla. Líneas y números se reducen algo
    // en fotos pequeñas (móvil) para no tapar la pared.
    const fPantalla = natural && anchoVisible ? natural.w / anchoVisible : 1;
    const f = fPantalla * (anchoVisible ? Math.min(1, Math.max(0.6, anchoVisible / 600)) : 1);

    const dibujarLinea = (via, marca, discontinua, onClick) => {
        const dir = via.inicio && via.fin ? via.fin.y - via.inicio.y : -1;
        const interOrd = [...(via.intermedios || [])].sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
        const pts = [via.inicio, ...interOrd, via.fin].filter(Boolean).map(p => ({ x: p.x * xRatio, y: p.y * yRatio }));
        const d = generarCurvaSuave(pts);
        const grosor = (via.grosor || 4) * 0.75 * f;
        const guiones = discontinua ? `${8 * f},${5 * f}` : undefined;
        const ix = via.inicio ? via.inicio.x * xRatio : 0;
        const iy = via.inicio ? via.inicio.y * yRatio : 0;
        return (
            <g key={via.id} onClick={onClick} style={{ cursor: 'pointer' }}>
                <path d={d} fill="none" stroke="black" strokeWidth={grosor + 2 * f} opacity="0.4" strokeDasharray={guiones} />
                <path d={d} fill="none" stroke={via.color} strokeWidth={grosor} strokeLinecap="round" strokeDasharray={guiones} />
                {(via.textos || []).map((txt, i) => (
                    <TextoSvg key={i} txt={{ ...txt, x: txt.x * xRatio, y: txt.y * yRatio }} color={via.color} fPantalla={fPantalla} escala={xRatio} />
                ))}
                {via.inicio && (
                    <>
                        <circle cx={ix} cy={iy + 14 * f} r={11 * f} fill={via.color} stroke="white" strokeWidth={f} />
                        <text x={ix} y={iy + 18.5 * f} fill="white" fontSize={13 * f} fontWeight="bold" textAnchor="middle">{marca}</text>
                    </>
                )}
            </g>
        );
    };

    return (
        <div ref={contRef} style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
            <img src={foto.imagenUrl} alt="Pared"
                onLoad={e => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 8 }} />
            {natural && (
                <svg viewBox={`0 0 ${natural.w} ${natural.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    {(foto.formas || []).map(s => (
                        <g key={s.id}>
                            {s.tipo === 'RECT' && <rect x={s.x * xRatio} y={s.y * yRatio} width={s.w * xRatio} height={s.h * yRatio} fill="none" stroke={s.color} strokeWidth={s.grosor * f} />}
                            {s.tipo === 'ELIPSE' && <ellipse cx={(s.x + s.w / 2) * xRatio} cy={(s.y + s.h / 2) * yRatio} rx={s.w / 2 * xRatio} ry={s.h / 2 * yRatio} fill="none" stroke={s.color} strokeWidth={s.grosor * f} />}
                            {s.tipo === 'TEXTO_LIBRE' && <text x={s.x * xRatio} y={s.y * yRatio} fill={s.color} stroke="white" strokeWidth={2 * f} paintOrder="stroke" fontSize={Math.max((s.fontSize || 20) * xRatio, 8 * fPantalla)} fontWeight="bold">{s.text}</text>}
                        </g>
                    ))}
                    {(foto.vias || []).map((v, i) => dibujarLinea(v, i + 1, false, () => onClickVia?.({ ...v, num: i + 1 })))}
                    {(foto.combinaciones || []).map((c, i) => {
                        const letra = String.fromCharCode(65 + i);
                        return dibujarLinea(c, letra, true, () => onClickVia?.({ ...c, num: letra }));
                    })}
                </svg>
            )}
        </div>
    );
}

// Los textos guardan su tamaño respecto a la foto, como en el editor; solo se agrandan
// lo justo para que no bajen de 8 px en pantalla.
const TextoSvg = ({ txt, color, fPantalla, escala }) => {
    const isGrado = txt.type === 'grado';
    const fs = Math.max((txt.fontSize || (isGrado ? 14 : 18)) * escala, 8 * fPantalla);
    const f = fs / 14;
    const hw = fs * 1.1, hh = fs * 0.85;
    return (
        <g transform={`translate(${txt.x}, ${txt.y}) rotate(${txt.rotation || 0})`}>
            {isGrado
                ? <><rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} rx={4 * f} fill="white" stroke={color} strokeWidth={1.5 * f} />
                    <text x="0" y={fs * 0.35} fill={color} fontSize={fs} fontWeight="bold" textAnchor="middle">{txt.text}</text></>
                : <text x="0" y="0" fill="white" stroke="black" strokeWidth={3 * f} fontSize={fs} fontWeight="bold" paintOrder="stroke">{txt.text}</text>
            }
        </g>
    );
};
