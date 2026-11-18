// Rectángulo que ocupa lo dibujado en una foto (vías, combinaciones, textos y anotaciones),
// en píxeles de la imagen. Incluye siempre la propia foto: si algo se dibujó fuera de ella,
// el rectángulo crece para que se vea igual que en el editor.
export function limitesDibujo(foto, ancho, alto, xR = 1, yR = 1, margen = 30) {
    let x0 = 0, y0 = 0, x1 = ancho, y1 = alto;
    const incluir = (x, y, m = margen) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        // Solo crece por lo que de verdad queda fuera de la foto, y entonces con margen
        if (x < 0) x0 = Math.min(x0, x - m);
        if (y < 0) y0 = Math.min(y0, y - m);
        if (x > ancho) x1 = Math.max(x1, x + m);
        if (y > alto) y1 = Math.max(y1, y + m);
    };
    const punto = (p) => p && incluir(p.x * xR, p.y * yR);
    const linea = (v) => {
        punto(v.inicio);
        // El número de la vía va un poco por debajo del inicio
        if (v.inicio) incluir(v.inicio.x * xR, v.inicio.y * yR + 20);
        punto(v.fin);
        (v.intermedios || []).forEach(p => {
            punto(p);
            if (p.reunion && p.grado) {
                const gx = p.gdx != null ? (p.x + p.gdx) * xR : p.x * xR + 15;
                const gy = p.gdy != null ? (p.y + p.gdy) * yR : p.y * yR;
                incluir(gx + (p.gradoTam || 12) * 0.65 * p.grado.length, gy);
                incluir(gx, gy);
            }
        });
        (v.textos || []).forEach(t => incluir(t.x * xR, t.y * yR, margen + (t.fontSize || 18) * 2));
    };
    (foto.vias || []).forEach(linea);
    (foto.combinaciones || []).forEach(linea);
    (foto.formas || []).forEach(f => {
        if (f.tipo === 'SIMBOLO') {
            const t = (f.tam || 60) * xR / 2;
            incluir(f.x * xR - t, f.y * yR - t, 5);
            incluir(f.x * xR + t, f.y * yR + t, 5);
        } else if (f.tipo === 'TEXTO_LIBRE') {
            const fs = (f.fontSize || 20) * xR;
            incluir(f.x * xR, f.y * yR - fs);
            incluir(f.x * xR + fs * 0.6 * (f.text || '').length, f.y * yR);
        } else {
            incluir(f.x * xR, f.y * yR, 5);
            incluir((f.x + (f.w || 0)) * xR, (f.y + (f.h || 0)) * yR, 5);
        }
    });
    return { x0, y0, x1, y1, ancho: x1 - x0, alto: y1 - y0, fuera: x0 < 0 || y0 < 0 || x1 > ancho || y1 > alto };
}
