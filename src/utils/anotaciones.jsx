import React from 'react';

// Símbolos de topo. Se dibujan en una caja de 24×24 centrada en (0, 0) y se escalan a su
// tamaño `tam`, guardado en píxeles de la foto: así mantienen la proporción con la pared
// en el editor, el visor, la página de la escuela y la impresión.
export const SIMBOLOS = {
    arbol: {
        nombre: 'Árbol',
        trazos: [
            { d: 'M0 12 V1 M0 6 L-4 2 M0 4 L4 0' },
            { d: 'M0 3 C-9 4 -12 -3 -7 -7 C-7 -12 0 -13 2 -10 C7 -12 12 -6 8 -2 C11 2 6 5 0 3 Z', relleno: 0.35 },
        ],
    },
    agujero: {
        nombre: 'Agujero',
        trazos: [
            { d: 'M-10 0 A10 7 0 1 0 10 0 A10 7 0 1 0 -10 0 Z', relleno: 0.15 },
            { d: 'M-6 1 A6 4 0 1 0 6 1 A6 4 0 1 0 -6 1 Z', relleno: 0.85 },
        ],
    },
    diedro: {
        nombre: 'Diedro',
        trazos: [
            { d: 'M-9 12 L0 -12 L9 12' },
            { d: 'M-1 -7 L4 -5 M-2 -2 L5 0 M-3 3 L6 5 M-5 8 L7 10', fino: true },
        ],
    },
    chorrera: {
        nombre: 'Chorrera',
        trazos: [
            { d: 'M-7 -12 C-3 -7 -11 -2 -7 3 C-5 6 -8 9 -7 12 M0 -12 C4 -7 -4 -2 0 3 C2 6 -1 9 0 12 M7 -12 C11 -7 3 -2 7 3 C9 6 6 9 7 12' },
        ],
    },
    cuerda: {
        nombre: 'Cuerda fija',
        trazos: [
            { d: 'M-8 -10 C0 -6 -10 -2 -2 2 C6 6 -4 8 8 10' },
            { d: 'M-11 -10 A3 3 0 1 0 -5 -10 A3 3 0 1 0 -11 -10 Z M5 10 A3 3 0 1 0 11 10 A3 3 0 1 0 5 10 Z', relleno: 1 },
        ],
    },
};

export const TAM_SIMBOLO = 60;   // en píxeles de la foto, para fotos de ~1600 px
export const TAM_TEXTO = 20;

// Tamaño inicial proporcional a la foto
export const tamInicial = (base, anchoFoto) => Math.round(base * Math.max(0.5, (anchoFoto || 1600) / 1600));

// Una anotación (rect, elipse, texto libre o símbolo) en SVG. f: escala de los trazos en pantalla.
export function FormaSvg({ forma: s, xRatio = 1, yRatio = 1, f = 1 }) {
    if (s.tipo === 'RECT') return <rect x={s.x * xRatio} y={s.y * yRatio} width={s.w * xRatio} height={s.h * yRatio} fill="none" stroke={s.color} strokeWidth={(s.grosor || 2) * f} />;
    if (s.tipo === 'ELIPSE') return <ellipse cx={(s.x + s.w / 2) * xRatio} cy={(s.y + s.h / 2) * yRatio} rx={s.w / 2 * xRatio} ry={s.h / 2 * yRatio} fill="none" stroke={s.color} strokeWidth={(s.grosor || 2) * f} />;
    if (s.tipo === 'TEXTO_LIBRE') {
        const fs = (s.fontSize || TAM_TEXTO) * xRatio;
        return <text x={s.x * xRatio} y={s.y * yRatio} fill={s.color} stroke="black" strokeWidth={Math.max(1, fs / 10)} paintOrder="stroke" fontSize={fs} fontWeight="bold">{s.text}</text>;
    }
    if (s.tipo === 'SIMBOLO') {
        const def = SIMBOLOS[s.simbolo];
        if (!def) return null;
        const k = (s.tam || TAM_SIMBOLO) * xRatio / 24;
        return (
            <g transform={`translate(${s.x * xRatio} ${s.y * yRatio}) rotate(${s.rot || 0}) scale(${k})`}>
                {def.trazos.map((t, i) => <path key={'h' + i} d={t.d} fill="none" stroke="white" strokeWidth={(t.fino ? 1.2 : 2) + 2} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />)}
                {def.trazos.map((t, i) => <path key={i} d={t.d} fill={t.relleno ? s.color : 'none'} fillOpacity={t.relleno || 0}
                    stroke={s.color} strokeWidth={t.fino ? 1.2 : 2} strokeLinecap="round" strokeLinejoin="round" />)}
            </g>
        );
    }
    return null;
}

// Lo mismo en un lienzo (impresión y descarga)
export function dibujarFormaCanvas(ctx, s, xR = 1, yR = 1) {
    ctx.save();
    ctx.strokeStyle = s.color || '#e74c3c';
    ctx.lineWidth = s.grosor || 2;
    if (s.tipo === 'RECT') {
        ctx.beginPath(); ctx.rect(s.x * xR, s.y * yR, s.w * xR, s.h * yR); ctx.stroke();
    } else if (s.tipo === 'ELIPSE') {
        const w = s.w * xR, h = s.h * yR;
        ctx.beginPath(); ctx.ellipse(s.x * xR + w / 2, s.y * yR + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2); ctx.stroke();
    } else if (s.tipo === 'TEXTO_LIBRE') {
        const fs = (s.fontSize || TAM_TEXTO) * xR;
        ctx.font = `bold ${fs}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = Math.max(1, fs / 10) * 2;
        ctx.strokeStyle = 'black';
        ctx.lineJoin = 'round';
        ctx.strokeText(s.text || '', s.x * xR, s.y * yR);
        ctx.fillStyle = s.color || '#e74c3c';
        ctx.fillText(s.text || '', s.x * xR, s.y * yR);
    } else if (s.tipo === 'SIMBOLO' && SIMBOLOS[s.simbolo]) {
        const k = (s.tam || TAM_SIMBOLO) * xR / 24;
        ctx.translate(s.x * xR, s.y * yR);
        ctx.rotate((s.rot || 0) * Math.PI / 180);
        ctx.scale(k, k);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const t of SIMBOLOS[s.simbolo].trazos) {
            const p = new Path2D(t.d);
            ctx.globalAlpha = 0.85; ctx.strokeStyle = 'white'; ctx.lineWidth = (t.fino ? 1.2 : 2) + 2; ctx.stroke(p);
            ctx.globalAlpha = 1;
        }
        for (const t of SIMBOLOS[s.simbolo].trazos) {
            const p = new Path2D(t.d);
            if (t.relleno) { ctx.globalAlpha = t.relleno; ctx.fillStyle = s.color; ctx.fill(p); ctx.globalAlpha = 1; }
            ctx.strokeStyle = s.color; ctx.lineWidth = t.fino ? 1.2 : 2; ctx.stroke(p);
        }
    }
    ctx.restore();
}

// Icono pequeño para los botones del editor
export function IconoSimbolo({ simbolo, color = 'currentColor', size = 18 }) {
    const def = SIMBOLOS[simbolo];
    return (
        <svg width={size} height={size} viewBox="-13 -13 26 26" aria-hidden="true">
            {def.trazos.map((t, i) => <path key={i} d={t.d} fill={t.relleno ? color : 'none'} fillOpacity={t.relleno || 0}
                stroke={color} strokeWidth={t.fino ? 1.2 : 2} strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>
    );
}
