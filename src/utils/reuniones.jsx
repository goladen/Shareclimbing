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

// Tamaño del grado de una reunión (elegible) y su posición: la guardada (gdx, gdy: desplazamiento respecto a la reunión, en
// coordenadas de la foto) o, por defecto, a la derecha de la marca.
export const TAM_GRADO_REUNION = 12;
export const posGradoReunion = (r, xRatio = 1, yRatio = 1, f = 1) => r.gdx != null && r.gdy != null
    ? { x: (r.x + r.gdx) * xRatio, y: (r.y + r.gdy) * yRatio }
    : { x: r.x * xRatio + 15 * f, y: r.y * yRatio };

// Marcas de las reuniones en el SVG: dos chapas unidas, con el número de reunión.
// sinGrados: el editor dibuja él mismo los grados para poder arrastrarlos.
export function MarcasReunion({ via, xRatio = 1, yRatio = 1, f = 1, sinGrados = false }) {
    return reunionesOrdenadas(via).map((r, i) => {
        const x = r.x * xRatio, y = r.y * yRatio;
        return (
            <g key={`r${r.idx}`} style={{ pointerEvents: 'none' }}>
                <rect x={x - 11 * f} y={y - 8 * f} width={22 * f} height={16 * f} rx={4 * f} fill="white" stroke={via.color} strokeWidth={2.5 * f} />
                <text x={x} y={y + 4.5 * f} fill={via.color} fontSize={11 * f} fontWeight="bold" textAnchor="middle">R{i + 1}</text>
                {r.grado && !sinGrados && (() => {
                    const g = posGradoReunion(r, xRatio, yRatio, f);
                    const tam = (r.gradoTam || TAM_GRADO_REUNION) * f;
                    return <text x={g.x} y={g.y + tam * 0.35} fill="white" stroke="black" strokeWidth={Math.max(2, tam / 4)} paintOrder="stroke" fontSize={tam} fontWeight="bold">{r.grado}</text>;
                })()}
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
            const g = posGradoReunion(r, xR, yR);
            const tam = r.gradoTam || TAM_GRADO_REUNION;
            ctx.font = `bold ${tam}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.lineWidth = Math.max(2, tam / 4);
            ctx.strokeStyle = 'black';
            ctx.strokeText(r.grado, g.x, g.y);
            ctx.fillStyle = 'white';
            ctx.fillText(r.grado, g.x, g.y);
        }
    });
}
