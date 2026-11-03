import { useRef } from 'react';

// Zoom con dos dedos para un contenedor con pan/scale propios (transform translate + scale).
// Cada manejador devuelve true si el gesto es un pellizco y el llamador debe ignorar el evento.
export function usePinchZoom({ contenedorRef, scale, setScale, pan, setPan, min = 0.1, max = 5 }) {
    const punteros = useRef(new Map());
    const pinza = useRef(null);
    const actual = useRef({ scale, pan });
    actual.current = { scale, pan };

    const centro = () => {
        const [a, b] = [...punteros.current.values()];
        const rect = contenedorRef.current.getBoundingClientRect();
        return {
            distancia: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            x: (a.x + b.x) / 2 - rect.left,
            y: (a.y + b.y) / 2 - rect.top,
        };
    };

    const onDown = (e) => {
        if (e.pointerType !== 'touch') return false;
        punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (punteros.current.size === 2) {
            const c = centro();
            pinza.current = { ...c, scale: actual.current.scale, pan: actual.current.pan };
        }
        return Boolean(pinza.current);
    };

    const onMove = (e) => {
        if (!punteros.current.has(e.pointerId)) return false;
        punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!pinza.current || punteros.current.size < 2) return Boolean(pinza.current);
        const c = centro();
        const inicio = pinza.current;
        const s = Math.min(max, Math.max(min, inicio.scale * c.distancia / inicio.distancia));
        // El punto de la imagen que estaba bajo los dedos sigue bajo los dedos
        const k = s / inicio.scale;
        setScale(s);
        setPan({ x: c.x - (inicio.x - inicio.pan.x) * k, y: c.y - (inicio.y - inicio.pan.y) * k });
        return true;
    };

    const onUp = (e) => {
        const eraPellizco = Boolean(pinza.current);
        punteros.current.delete(e?.pointerId);
        if (punteros.current.size < 2) pinza.current = null;
        // Mientras quede un dedo del pellizco, se sigue ignorando hasta soltarlo
        return eraPellizco || punteros.current.size > 0 && eraPellizco;
    };

    const enPellizco = () => Boolean(pinza.current) || punteros.current.size > 1;

    return { onDown, onMove, onUp, enPellizco };
}
