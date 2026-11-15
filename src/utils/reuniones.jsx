import React from 'react';

// Las reuniones intermedias de una vía son puntos intermedios marcados con `reunion: true`
// y, si se conoce, el grado del largo que termina en ellas. El último largo (hasta el final
// de la vía) lleva el grado de la vía.

// Puntos intermedios ordenados desde el pie de vía hasta arriba, con su índice original
export const intermediosOrdenados = (via) => {
    const dir = via.inicio && via.fin ? via.fin.y - via.inicio.y : -1;
    return (via.intermedios || [])
        .map((p, idx) => ({ ...p, idx }))
        .sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
};

export const reunionesOrdenadas = (via) => intermediosOrdenados(via).filter(p => p.reunion);

// Largos de la vía: [{ n, grado, final }] o [] si no tiene reuniones intermedias
export const largosVia = (via) => {
    const reuniones = reunionesOrdenadas(via);
    if (!reuniones.length) return [];
    return [
        ...reuniones.map((r, i) => ({ n: i + 1, grado: r.grado || '', final: false })),
        { n: reuniones.length + 1, grado: via.info?.grado || '', final: true },
    ];
};

// Texto de observación: «L1 6a · L2 6b · L3 6c (grado de la vía)»
export const textoLargos = (via) => largosVia(via)
    .filter(l => !l.final)
    .map(l => `L${l.n}${l.grado ? ` ${l.grado}` : ''}`)
    .join(' · ');

// Bloque para las fichas de vía: lista de largos con su grado
export function LargosVia({ via, estilo }) {
    const largos = largosVia(via);
    if (!largos.length) return null;
    return (
        <div style={{ background: '#f8f9fa', border: '1px solid #ecf0f1', borderRadius: 10, padding: '10px 14px', margin: '10px 0', ...estilo }}>
            <strong style={{ color: '#7f8c8d' }}>Largos ({largos.length}):</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {largos.map(l => (
                    <span key={l.n} style={{ background: 'white', border: '1px solid #dfe6e9', borderRadius: 6, padding: '2px 8px', fontSize: '0.85rem' }}>
                        L{l.n}: <b style={{ color: '#e74c3c' }}>{l.grado || '–'}</b>{l.final ? ' (grado de la vía)' : ''}
                    </span>
                ))}
            </div>
        </div>
    );
}

// Marcas de las reuniones en el SVG: dos chapas unidas, con el número de reunión
export function MarcasReunion({ via, xRatio = 1, yRatio = 1, f = 1 }) {
    return reunionesOrdenadas(via).map((r, i) => {
        const x = r.x * xRatio, y = r.y * yRatio;
        return (
            <g key={`r${r.idx}`} style={{ pointerEvents: 'none' }}>
                <rect x={x - 11 * f} y={y - 8 * f} width={22 * f} height={16 * f} rx={4 * f} fill="white" stroke={via.color} strokeWidth={2.5 * f} />
                <text x={x} y={y + 4.5 * f} fill={via.color} fontSize={11 * f} fontWeight="bold" textAnchor="middle">R{i + 1}</text>
                {r.grado && (
                    <text x={x + 15 * f} y={y + 4.5 * f} fill="white" stroke="black" strokeWidth={3 * f} paintOrder="stroke" fontSize={12 * f} fontWeight="bold">{r.grado}</text>
                )}
            </g>
        );
    });
}

// Lo mismo para el lienzo de impresión
export function dibujarReunionesCanvas(ctx, via, xR, yR) {
    reunionesOrdenadas(via).forEach((r, i) => {
        const x = r.x * xR, y = r.y * yR;
        ctx.beginPath();
        ctx.roundRect(x - 11, y - 8, 22, 16, 4);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = via.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = via.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`R${i + 1}`, x, y);
        if (r.grado) {
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'left';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'black';
            ctx.strokeText(r.grado, x + 15, y);
            ctx.fillStyle = 'white';
            ctx.fillText(r.grado, x + 15, y);
        }
    });
}
