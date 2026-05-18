import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Printer, Move } from 'lucide-react';

// ─── Helpers de canvas ───────────────────────────────────────────────────────

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

// Devuelve el número a mostrar para una vía: el personalizado si existe, si no el automático
const numVia = (via, idx, numeroInicial) =>
    (via.info?.numero != null && via.info.numero !== '') ? via.info.numero : idx + numeroInicial;

function dibujarVias(ctx, viasOrdenadas, numeroInicial, xR, yR) {
    viasOrdenadas.forEach((via, idx) => {
        const num = numVia(via, idx, numeroInicial);
        const dir = via.inicio && via.fin ? via.fin.y - via.inicio.y : -1;
        const interOrd = [...(via.intermedios || [])].sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
        const pts = [via.inicio, ...interOrd, via.fin].filter(Boolean)
            .map(p => ({ x: p.x * xR, y: p.y * yR }));
        if (pts.length < 2) return;
        const grosor = via.grosor || 4;

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = grosor + 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        generarPath(pts, ctx);
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = via.color;
        ctx.lineWidth = grosor;
        generarPath(pts, ctx);
        ctx.stroke();

        if (via.inicio) {
            const ix = via.inicio.x * xR, iy = via.inicio.y * yR;
            ctx.beginPath();
            ctx.arc(ix, iy + 20, 15, 0, Math.PI * 2);
            ctx.fillStyle = via.color;
            ctx.fill();
            ctx.font = 'bold 16px sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(num, ix, iy + 20);
        }

        if (via.fin) {
            const fx = via.fin.x * xR, fy = via.fin.y * yR;
            ctx.beginPath();
            ctx.arc(fx, fy, 18, 0, Math.PI * 2);
            ctx.strokeStyle = via.color;
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.6;
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(fx, fy, 11, 0, Math.PI * 2);
            ctx.fillStyle = via.color;
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.font = 'bold 13px sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', fx, fy);
        }

        (via.textos || []).forEach(txt => {
            const tx = txt.x * xR, ty = txt.y * yR;
            if (txt.type === 'grado') {
                const fs = txt.fontSize || 14;
                const hw = fs + 6, hh = Math.ceil(fs * 0.9);
                ctx.fillStyle = 'white';
                ctx.strokeStyle = via.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(tx - hw, ty - hh, hw * 2, hh * 2, 4);
                ctx.fill();
                ctx.stroke();
                ctx.font = `bold ${fs}px sans-serif`;
                ctx.fillStyle = via.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(txt.text, tx, ty);
            } else {
                const fs = txt.fontSize || 18;
                ctx.font = `bold ${fs}px sans-serif`;
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 3;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.strokeText(txt.text, tx, ty);
                ctx.fillStyle = 'white';
                ctx.fillText(txt.text, tx, ty);
            }
        });
    });
}

function dibujarCombinaciones(ctx, combinaciones, xR, yR) {
    (combinaciones || []).forEach((combi, idx) => {
        const letra = String.fromCharCode(65 + idx);
        const dir = combi.inicio && combi.fin ? combi.fin.y - combi.inicio.y : -1;
        const interOrd = [...(combi.intermedios || [])].sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
        const pts = [combi.inicio, ...interOrd, combi.fin].filter(Boolean)
            .map(p => ({ x: p.x * xR, y: p.y * yR }));
        if (pts.length < 2) return;
        const grosor = combi.grosor || 4;

        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = grosor + 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        generarPath(pts, ctx);
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = combi.color;
        ctx.lineWidth = grosor;
        generarPath(pts, ctx);
        ctx.stroke();
        ctx.setLineDash([]);

        if (combi.inicio) {
            const ix = combi.inicio.x * xR, iy = combi.inicio.y * yR;
            ctx.beginPath();
            ctx.roundRect(ix - 14, iy + 6, 28, 22, 5);
            ctx.fillStyle = combi.color;
            ctx.fill();
            ctx.font = 'bold 15px sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(letra, ix, iy + 17);
        }

        if (combi.fin) {
            const fx = combi.fin.x * xR, fy = combi.fin.y * yR;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.arc(fx, fy, 18, 0, Math.PI * 2);
            ctx.strokeStyle = combi.color;
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.6;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(fx, fy, 11, 0, Math.PI * 2);
            ctx.fillStyle = combi.color;
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.font = 'bold 13px sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', fx, fy);
        }
    });
}

function dibujarFormas(ctx, formas, xR, yR) {
    (formas || []).forEach(f => {
        ctx.strokeStyle = f.color || '#e74c3c';
        ctx.lineWidth = f.grosor || 2;
        const fx = f.x * xR, fy = f.y * yR, fw = f.w * xR, fh = f.h * yR;
        if (f.tipo === 'RECT') {
            ctx.beginPath();
            ctx.rect(fx, fy, fw, fh);
            ctx.stroke();
        } else if (f.tipo === 'ELIPSE') {
            ctx.beginPath();
            ctx.ellipse(fx + fw / 2, fy + fh / 2, fw / 2, fh / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (f.tipo === 'TEXTO_LIBRE') {
            ctx.font = `bold ${f.fontSize || 20}px sans-serif`;
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.strokeText(f.text || '', fx, fy);
            ctx.fillStyle = f.color || '#e74c3c';
            ctx.fillText(f.text || '', fx, fy);
        }
    });
}

// Dibuja la tabla directamente en el canvas (para descarga PNG)
function dibujarTablaEnCanvas(ctx, viasOrdenadas, numeroInicial, posX, posY, maxW) {
    const rowH = 30, headerH = 34, pad = 10;
    const col1W = 48, col3W = 70;
    const col2W = Math.max(100, Math.min(200, maxW - col1W - col3W - 20));
    const tableW = col1W + col2W + col3W;

    // Sombra del contenedor
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'white';
    ctx.fillRect(posX, posY, tableW, headerH + rowH * viasOrdenadas.length);
    ctx.shadowBlur = 0;

    // Cabecera
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(posX, posY, tableW, headerH);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const cy = posY + headerH / 2;
    ctx.fillText('Nº', posX + pad, cy);
    ctx.fillText('Nombre', posX + col1W + pad, cy);
    ctx.fillText('Grado', posX + col1W + col2W + pad, cy);

    // Filas
    viasOrdenadas.forEach((v, i) => {
        const rowY = posY + headerH + i * rowH;
        ctx.fillStyle = i % 2 === 0 ? 'white' : '#f8f9fa';
        ctx.fillRect(posX, rowY, tableW, rowH);

        // Círculo numerado
        ctx.beginPath();
        ctx.arc(posX + 24, rowY + rowH / 2, 12, 0, Math.PI * 2);
        ctx.fillStyle = v.color;
        ctx.fill();
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numVia(v, i, numeroInicial), posX + 24, rowY + rowH / 2);

        // Nombre
        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#2c3e50';
        ctx.textAlign = 'left';
        ctx.fillText(v.info?.nombre || '–', posX + col1W + pad, rowY + rowH / 2);

        // Grado
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#e74c3c';
        ctx.fillText(v.info?.grado || '–', posX + col1W + col2W + pad, rowY + rowH / 2);
    });
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function ModalImpresion({ croquis, onClose }) {
    const canvasRef = useRef();
    const imgRef = useRef();
    const previewRef = useRef();

    const [listo, setListo] = useState(false);
    const [error, setError] = useState('');
    const [numeroInicial, setNumeroInicial] = useState(1);
    // Posición de la tabla overlay en porcentaje del contenedor de preview
    const [tablaPos, setTablaPos] = useState({ x: 2, y: 65 });
    const [dragging, setDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const vias = croquis.vias || [];
    const formas = croquis.formas || [];
    const combinaciones = croquis.combinaciones || [];
    const info = croquis.infoCroquis || {};

    // Vías ordenadas de izquierda a derecha por la posición de inicio
    const viasOrdenadas = [...vias].sort((a, b) => (a.inicio?.x ?? Infinity) - (b.inicio?.x ?? Infinity));

    // Dibuja imagen + vías + formas + combinaciones en el canvas (sin tabla)
    const renderCanvas = (img) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const imgW = img.naturalWidth, imgH = img.naturalHeight;
        const xR = croquis.srcW ? imgW / croquis.srcW : 1;
        const yR = croquis.srcH ? imgH / croquis.srcH : 1;
        canvas.width = imgW;
        canvas.height = imgH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, imgW, imgH);
        ctx.drawImage(img, 0, 0, imgW, imgH);
        dibujarFormas(ctx, formas, xR, yR);
        dibujarVias(ctx, viasOrdenadas, numeroInicial, xR, yR);
        dibujarCombinaciones(ctx, combinaciones, xR, yR);
    };

    // Carga imagen inicial
    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imgRef.current = img;
            renderCanvas(img);
            setListo(true);
        };
        img.onerror = () => setError('No se pudo cargar la imagen (posible restricción CORS).');
        img.src = croquis.imagenUrl;
    }, []); // eslint-disable-line

    // Re-dibuja cuando cambia el número inicial
    useEffect(() => {
        if (imgRef.current) renderCanvas(imgRef.current);
    }, [numeroInicial]); // eslint-disable-line

    // ── Drag de la tabla ──
    const handleTablePointerDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tableRect = e.currentTarget.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - tableRect.left,
            y: e.clientY - tableRect.top,
        };
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handleTablePointerMove = (e) => {
        if (!dragging) return;
        const rect = previewRef.current.getBoundingClientRect();
        const newX = ((e.clientX - rect.left - dragOffset.current.x) / rect.width) * 100;
        const newY = ((e.clientY - rect.top - dragOffset.current.y) / rect.height) * 100;
        setTablaPos({
            x: Math.max(0, Math.min(85, newX)),
            y: Math.max(0, Math.min(92, newY)),
        });
    };

    const handleTablePointerUp = () => setDragging(false);

    // ── Descargar PNG (con tabla horneada) ──
    const descargarPNG = () => {
        const src = canvasRef.current;
        const tmp = document.createElement('canvas');
        tmp.width = src.width;
        tmp.height = src.height;
        const ctx = tmp.getContext('2d');
        ctx.drawImage(src, 0, 0);
        const posX = (tablaPos.x / 100) * src.width;
        const posY = (tablaPos.y / 100) * src.height;
        dibujarTablaEnCanvas(ctx, viasOrdenadas, numeroInicial, posX, posY, src.width - posX - 20);
        const a = document.createElement('a');
        a.href = tmp.toDataURL('image/png');
        a.download = `${info.sector || info.escuela || 'croquis'}.png`;
        a.click();
    };

    // ── Imprimir (ventana emergente con tabla HTML) ──
    const imprimir = () => {
        const canvas = canvasRef.current;
        const dataUrl = canvas.toDataURL('image/png');
        const titulo = [info.escuela, info.sector].filter(Boolean).join(' · ') || 'Croquis';

        const filasHtml = viasOrdenadas.map((v, i) => `
            <tr style="background:${i % 2 === 0 ? 'white' : '#f8f9fa'}">
                <td style="padding:5px 12px">
                    <span style="background:${v.color};color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;flex-shrink:0">${numVia(v, i, numeroInicial)}</span>
                </td>
                <td style="padding:5px 12px;color:#2c3e50">${v.info?.nombre || '–'}</td>
                <td style="padding:5px 12px;color:#e74c3c;font-weight:bold">${v.info?.grado || '–'}</td>
            </tr>`).join('');

        const filasCombinaciones = combinaciones.map((c, i) => {
            const letra = String.fromCharCode(65 + i);
            return `<tr style="background:${i % 2 === 0 ? 'white' : '#f5eef8'}">
                <td style="padding:5px 12px">
                    <span style="background:${c.color};color:white;border-radius:4px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;flex-shrink:0">${letra}</span>
                </td>
                <td style="padding:5px 12px;color:#2c3e50">${c.info?.nombre || '–'}</td>
                <td style="padding:5px 12px;color:#8e44ad;font-weight:bold">${c.info?.grado || '–'}</td>
            </tr>`;
        }).join('');

        const tablaCombinacionesHtml = combinaciones.length > 0 ? `
            <table style="margin-top:8px">
              <thead><tr><th style="background:#6c3483">Letra</th><th style="background:#6c3483">Nombre</th><th style="background:#6c3483">Grado</th></tr></thead>
              <tbody>${filasCombinaciones}</tbody>
            </table>` : '';

        const win = window.open('', '_blank');
        win.document.write(`<!DOCTYPE html>
<html><head><title>${titulo}</title>
<style>
  body{margin:0}
  .wrap{position:relative;display:inline-block;width:100%}
  img{display:block;width:100%}
  .tabla{position:absolute;left:${tablaPos.x}%;top:${tablaPos.y}%;white-space:nowrap}
  table{border-collapse:collapse;font-family:sans-serif;font-size:13px;background:white;box-shadow:0 4px 14px rgba(0,0,0,0.4)}
  th{background:#2c3e50;color:white;padding:7px 12px;text-align:left}
  td{padding:5px 12px}
  @media print{body{margin:0}}
</style>
</head><body>
<div class="wrap">
  <img src="${dataUrl}" />
  <div class="tabla">
    <table>
      <thead><tr><th>Nº</th><th>Nombre</th><th>Grado</th></tr></thead>
      <tbody>${filasHtml}</tbody>
    </table>
    ${tablaCombinacionesHtml}
  </div>
</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`);
        win.document.close();
    };

    return (
        <div style={st.overlay}>
            <div style={st.modal}>
                {/* Header */}
                <div style={st.header}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>Vista previa de impresión</span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {/* Número inicial */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '5px 12px' }}>
                            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>Nº inicial</span>
                            <input
                                type="number"
                                min={1}
                                max={999}
                                value={numeroInicial}
                                onChange={e => setNumeroInicial(Math.max(1, parseInt(e.target.value) || 1))}
                                style={{ width: 52, padding: '3px 6px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: '0.92rem' }}
                            />
                        </div>
                        {listo && (
                            <>
                                <button onClick={descargarPNG} style={st.btnAccion}>
                                    <Download size={15} /> PNG
                                </button>
                                <button onClick={imprimir} style={{ ...st.btnAccion, background: '#3498db' }}>
                                    <Printer size={15} /> Imprimir / PDF
                                </button>
                            </>
                        )}
                        <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                    </div>
                </div>

                {/* Instrucción */}
                {listo && (
                    <div style={{ background: '#eaf4fb', borderBottom: '1px solid #d0e8f5', padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#2471a3' }}>
                        <Move size={14} /> Arrastra la tabla de vías para posicionarla antes de imprimir o descargar.
                    </div>
                )}

                {/* Preview: canvas + tabla draggable */}
                <div style={st.body}>
                    {error && <p style={{ color: '#c0392b', textAlign: 'center', padding: 20 }}>{error}</p>}
                    {!listo && !error && <p style={{ textAlign: 'center', color: '#7f8c8d', padding: 30 }}>Generando vista previa…</p>}

                    <div
                        ref={previewRef}
                        style={{ position: 'relative', display: 'inline-block', width: '100%', lineHeight: 0 }}
                    >
                        <canvas
                            ref={canvasRef}
                            style={{ maxWidth: '100%', display: listo ? 'block' : 'none', margin: '0 auto', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderRadius: 4 }}
                        />

                        {/* Tabla HTML arrastrable */}
                        {listo && (viasOrdenadas.length > 0 || combinaciones.length > 0) && (
                            <div
                                style={{
                                    position: 'absolute',
                                    left: `${tablaPos.x}%`,
                                    top: `${tablaPos.y}%`,
                                    cursor: dragging ? 'grabbing' : 'grab',
                                    userSelect: 'none',
                                    zIndex: 20,
                                    touchAction: 'none',
                                }}
                                onPointerDown={handleTablePointerDown}
                                onPointerMove={handleTablePointerMove}
                                onPointerUp={handleTablePointerUp}
                                onPointerLeave={handleTablePointerUp}
                            >
                                {viasOrdenadas.length > 0 && (
                                    <table style={{ borderCollapse: 'collapse', fontFamily: 'sans-serif', fontSize: '12px', background: 'white', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', whiteSpace: 'nowrap', borderRadius: 4, overflow: 'hidden' }}>
                                        <thead>
                                            <tr style={{ background: '#2c3e50', color: 'white' }}>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Nº</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Nombre</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Grado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {viasOrdenadas.map((v, i) => (
                                                <tr key={v.id || i} style={{ background: i % 2 === 0 ? 'white' : '#f4f6f8' }}>
                                                    <td style={{ padding: '4px 10px' }}>
                                                        <span style={{ background: v.color, color: 'white', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '10px' }}>
                                                            {numVia(v, i, numeroInicial)}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '4px 10px', color: '#2c3e50' }}>{v.info?.nombre || '–'}</td>
                                                    <td style={{ padding: '4px 10px', color: '#e74c3c', fontWeight: 'bold' }}>{v.info?.grado || '–'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                {combinaciones.length > 0 && (
                                    <table style={{ borderCollapse: 'collapse', fontFamily: 'sans-serif', fontSize: '12px', background: 'white', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', whiteSpace: 'nowrap', borderRadius: 4, overflow: 'hidden', marginTop: viasOrdenadas.length > 0 ? 6 : 0 }}>
                                        <thead>
                                            <tr style={{ background: '#6c3483', color: 'white' }}>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Letra</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Nombre</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Grado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {combinaciones.map((c, i) => {
                                                const letra = String.fromCharCode(65 + i);
                                                return (
                                                    <tr key={c.id || i} style={{ background: i % 2 === 0 ? 'white' : '#f5eef8' }}>
                                                        <td style={{ padding: '4px 10px' }}>
                                                            <span style={{ background: c.color, color: 'white', borderRadius: 4, width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '10px' }}>
                                                                {letra}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '4px 10px', color: '#2c3e50' }}>{c.info?.nombre || '–'}</td>
                                                        <td style={{ padding: '4px 10px', color: '#8e44ad', fontWeight: 'bold' }}>{c.info?.grado || '–'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 3000, display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 960, borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '95vh' },
    header: { background: '#2c3e50', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 10 },
    body: { flex: 1, overflowY: 'auto', padding: 20, background: '#f4f6f8', textAlign: 'center' },
    btnClose: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer' },
    btnAccion: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' },
};
