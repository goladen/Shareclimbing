import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Printer } from 'lucide-react';

const generarPath = (puntos, ctx) => {
    if (puntos.length < 2) return;
    ctx.moveTo(puntos[0].x, puntos[0].y);
    for (let i = 0; i < puntos.length - 1; i++) {
        const p0 = puntos[Math.max(0, i - 1)];
        const p1 = puntos[i];
        const p2 = puntos[i + 1];
        const p3 = puntos[Math.min(puntos.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
};

function dibujarVias(ctx, vias, imgH) {
    vias.forEach((via, idx) => {
        const dir = via.inicio && via.fin ? via.fin.y - via.inicio.y : -1;
        const interOrd = [...(via.intermedios || [])].sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
        const pts = [via.inicio, ...interOrd, via.fin].filter(Boolean);
        if (pts.length < 2) return;

        const grosor = via.grosor || 4;

        // Sombra
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = grosor + 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        generarPath(pts, ctx);
        ctx.stroke();

        // Línea principal
        ctx.beginPath();
        ctx.strokeStyle = via.color;
        ctx.lineWidth = grosor;
        generarPath(pts, ctx);
        ctx.stroke();

        // Círculo inicio con número
        if (via.inicio) {
            ctx.beginPath();
            ctx.arc(via.inicio.x, via.inicio.y + 20, 15, 0, Math.PI * 2);
            ctx.fillStyle = via.color;
            ctx.fill();
            ctx.font = 'bold 16px sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(idx + 1, via.inicio.x, via.inicio.y + 20);
        }

        // Marcador fin
        if (via.fin) {
            ctx.beginPath();
            ctx.arc(via.fin.x, via.fin.y, 18, 0, Math.PI * 2);
            ctx.strokeStyle = via.color;
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.6;
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(via.fin.x, via.fin.y, 11, 0, Math.PI * 2);
            ctx.fillStyle = via.color;
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.font = 'bold 13px sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', via.fin.x, via.fin.y);
        }

        // Textos
        (via.textos || []).forEach(txt => {
            if (txt.type === 'grado') {
                ctx.fillStyle = 'white';
                ctx.strokeStyle = via.color;
                ctx.lineWidth = 2;
                const rw = 40, rh = 24;
                ctx.beginPath();
                ctx.roundRect(txt.x - rw / 2, txt.y - rh / 2, rw, rh, 4);
                ctx.fill();
                ctx.stroke();
                ctx.font = 'bold 14px sans-serif';
                ctx.fillStyle = via.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(txt.text, txt.x, txt.y);
            } else {
                ctx.font = 'bold 18px sans-serif';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 3;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.strokeText(txt.text, txt.x, txt.y);
                ctx.fillStyle = 'white';
                ctx.fillText(txt.text, txt.x, txt.y);
            }
        });
    });
}

function dibujarFormas(ctx, formas) {
    (formas || []).forEach(f => {
        ctx.strokeStyle = f.color || '#e74c3c';
        ctx.lineWidth = f.grosor || 2;
        ctx.fillStyle = 'transparent';
        if (f.tipo === 'RECT') {
            ctx.beginPath();
            ctx.rect(f.x, f.y, f.w, f.h);
            ctx.stroke();
        } else if (f.tipo === 'ELIPSE') {
            ctx.beginPath();
            ctx.ellipse(f.x + f.w / 2, f.y + f.h / 2, f.w / 2, f.h / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (f.tipo === 'TEXTO_LIBRE') {
            ctx.font = `bold ${f.fontSize || 20}px sans-serif`;
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.strokeText(f.text || '', f.x, f.y);
            ctx.fillStyle = f.color || '#e74c3c';
            ctx.fillText(f.text || '', f.x, f.y);
        }
    });
}

const MARGEN = 40;
const ALTO_FILA = 28;
const ALTO_HEADER_LISTA = 36;

function dibujarLista(ctx, vias, yOffset, canvasW) {
    const usableW = canvasW - MARGEN * 2;
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Listado de Vías', MARGEN, yOffset + 10);

    const cols = [40, 200, 100, 80]; // anchuras columnas
    const headers = ['Nº', 'Nombre', 'Grado', 'Equipador'];
    let y = yOffset + ALTO_HEADER_LISTA;

    // Cabecera tabla
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(MARGEN, y, usableW, ALTO_FILA);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#2c3e50';
    let x = MARGEN + 8;
    headers.forEach((h, i) => { ctx.fillText(h, x, y + 7); x += cols[i]; });
    y += ALTO_FILA;

    // Filas
    vias.forEach((v, i) => {
        ctx.fillStyle = i % 2 === 0 ? 'white' : '#f8f9fa';
        ctx.fillRect(MARGEN, y, usableW, ALTO_FILA);

        // Punto de color
        ctx.beginPath();
        ctx.arc(MARGEN + 14, y + ALTO_FILA / 2, 8, 0, Math.PI * 2);
        ctx.fillStyle = v.color;
        ctx.fill();
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(i + 1, MARGEN + 14, y + ALTO_FILA / 2 + 4);

        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#2c3e50';
        ctx.textAlign = 'left';
        const cols2 = [cols[0], cols[1], cols[2], cols[3]];
        const vals = ['', v.info?.nombre || '', v.info?.grado || '–', v.info?.equipador || ''];
        let xv = MARGEN + 8;
        vals.forEach((val, ci) => {
            if (ci === 0) { xv += cols2[ci]; return; }
            ctx.fillText(val, xv, y + 7);
            xv += cols2[ci];
        });
        y += ALTO_FILA;
    });
}

export default function ModalImpresion({ croquis, onClose }) {
    const canvasRef = useRef();
    const [listo, setListo] = useState(false);
    const [error, setError] = useState('');

    const vias = croquis.vias || [];
    const formas = croquis.formas || [];
    const info = croquis.infoCroquis || {};

    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const imgW = img.naturalWidth;
            const imgH = img.naturalHeight;
            const altoPie = ALTO_HEADER_LISTA + ALTO_FILA + vias.length * ALTO_FILA + MARGEN * 2;
            const totalH = imgH + altoPie;

            const canvas = canvasRef.current;
            canvas.width = imgW;
            canvas.height = totalH;
            const ctx = canvas.getContext('2d');

            // Fondo blanco
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, imgW, totalH);

            // Imagen
            ctx.drawImage(img, 0, 0, imgW, imgH);

            // Vías y formas
            dibujarVias(ctx, vias, imgH);
            dibujarFormas(ctx, formas);

            // Lista de vías
            dibujarLista(ctx, vias, imgH + MARGEN, imgW);

            setListo(true);
        };
        img.onerror = () => setError('No se pudo cargar la imagen (posible restricción CORS). Intenta descargar el croquis directamente.');
        img.src = croquis.imagenUrl;
    }, []);

    const descargarPNG = () => {
        const canvas = canvasRef.current;
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${info.sector || info.escuela || 'croquis'}.png`;
        a.click();
    };

    const imprimir = () => {
        const canvas = canvasRef.current;
        const dataUrl = canvas.toDataURL('image/png');
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>${info.sector || 'Croquis'}</title>
            <style>body{margin:0;} img{max-width:100%;display:block;} @media print{body{margin:0;}}</style>
            </head><body>
            <img src="${dataUrl}" onload="window.print();window.close();" />
            </body></html>`);
        win.document.close();
    };

    return (
        <div style={st.overlay}>
            <div style={st.modal}>
                <div style={st.header}>
                    <span style={{ color: 'white', fontWeight: 'bold' }}>Vista previa de impresión</span>
                    <div style={{ display: 'flex', gap: 10 }}>
                        {listo && (
                            <>
                                <button onClick={descargarPNG} style={st.btnAccion}>
                                    <Download size={16} /> PNG
                                </button>
                                <button onClick={imprimir} style={{ ...st.btnAccion, background: '#3498db' }}>
                                    <Printer size={16} /> Imprimir / PDF
                                </button>
                            </>
                        )}
                        <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                    </div>
                </div>

                <div style={st.body}>
                    {error && <p style={{ color: '#c0392b', textAlign: 'center', padding: 20 }}>{error}</p>}
                    {!listo && !error && <p style={{ textAlign: 'center', color: '#7f8c8d', padding: 30 }}>Generando vista previa…</p>}
                    <canvas
                        ref={canvasRef}
                        style={{ maxWidth: '100%', display: listo ? 'block' : 'none', margin: '0 auto', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderRadius: 4 }}
                    />
                </div>
            </div>
        </div>
    );
}

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 900, borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '95vh' },
    header: { background: '#2c3e50', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
    body: { flex: 1, overflowY: 'auto', padding: 20, background: '#f4f6f8' },
    btnClose: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer' },
    btnAccion: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
};
