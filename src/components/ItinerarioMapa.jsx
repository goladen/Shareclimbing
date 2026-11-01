import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Layers, Undo2, Trash2, Navigation } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { CAPAS } from './LocationPicker';

const COLOR_RUTA = '#e74c3c';

export function distanciaRuta(puntos = []) {
    let metros = 0;
    for (let i = 1; i < puntos.length; i++) {
        metros += L.latLng(puntos[i - 1]).distanceTo(L.latLng(puntos[i]));
    }
    return metros;
}

export function formatearDistancia(metros) {
    return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(2)} km`;
}

// Enlace a navegación en Google Maps hasta el primer punto de la ruta (normalmente el aparcamiento)
export function enlaceComoLlegar({ lat, lng }) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

const iconoPunto = (color, texto) => new L.DivIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};color:white;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;">${texto}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
});

function SelectorCapa({ capa, setCapa }) {
    return (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1000, display: 'flex', borderRadius: 6, overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
            {Object.entries(CAPAS).map(([key, c]) => (
                <button key={key} type="button" onClick={() => setCapa(key)}
                    style={{ padding: '4px 8px', fontSize: '0.72rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', background: capa === key ? '#2c3e50' : 'rgba(255,255,255,0.92)', color: capa === key ? 'white' : '#333', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Layers size={11} /> {c.label}
                </button>
            ))}
        </div>
    );
}

// Mantiene Leaflet al día cuando el contenedor cambia de tamaño (modales, bloques redimensionables)
function AjustarTamano() {
    const map = useMap();
    useEffect(() => {
        const obs = new ResizeObserver(() => map.invalidateSize());
        obs.observe(map.getContainer());
        return () => obs.disconnect();
    }, [map]);
    return null;
}

function EncuadrarPuntos({ puntos, zoomUnico = 14 }) {
    const map = useMap();
    const clave = puntos.map(p => `${p.lat},${p.lng}`).join('|');
    useEffect(() => {
        if (puntos.length === 1) map.setView([puntos[0].lat, puntos[0].lng], zoomUnico);
        else if (puntos.length > 1) map.fitBounds(puntos.map(p => [p.lat, p.lng]), { padding: [30, 30] });
    }, [clave]); // eslint-disable-line
    return null;
}

function ClickEnMapa({ onClicar }) {
    useMapEvents({ click: (e) => onClicar(e.latlng) });
    return null;
}

// Editor: cada clic añade un punto; los puntos se arrastran y se eliminan pulsándolos
export function ItinerarioEditor({ puntos = [], onChange, lat, lng }) {
    const [capa, setCapa] = useState('callejero');
    const tieneCentro = lat !== '' && lat != null && lng !== '' && lng != null;
    const encuadreInicial = useRef(puntos);
    const centro = tieneCentro ? [{ lat: parseFloat(lat), lng: parseFloat(lng) }] : [];
    const metros = distanciaRuta(puntos);

    const anadir = ({ lat: la, lng: ln }) => onChange([...puntos, { lat: +la.toFixed(6), lng: +ln.toFixed(6) }]);
    const mover = (i, { lat: la, lng: ln }) => onChange(puntos.map((p, idx) => idx === i ? { lat: +la.toFixed(6), lng: +ln.toFixed(6) } : p));
    const quitar = (i) => onChange(puntos.filter((_, idx) => idx !== i));

    return (
        <div>
            <p style={{ fontSize: '0.78rem', color: '#7f8c8d', margin: '0 0 6px' }}>
                Pulsa en el mapa desde el aparcamiento hasta la pared. Arrastra un punto para moverlo o púlsalo para quitarlo.
            </p>
            <div style={{ height: 280, borderRadius: 10, overflow: 'hidden', border: '2px solid #bdc3c7', position: 'relative' }}>
                <SelectorCapa capa={capa} setCapa={setCapa} />
                <MapContainer center={[40.416, -3.703]} zoom={6} style={{ width: '100%', height: '100%' }}>
                    <TileLayer key={capa} attribution={CAPAS[capa].attribution} url={CAPAS[capa].url} maxZoom={CAPAS[capa].maxZoom || 19} />
                    <AjustarTamano />
                    {/* Encuadra la ruta guardada al abrir; sin ruta, sigue la ubicación fijada */}
                    <EncuadrarPuntos puntos={encuadreInicial.current.length > 0 ? encuadreInicial.current : centro} />
                    <ClickEnMapa onClicar={anadir} />
                    {puntos.length > 1 && <Polyline positions={puntos.map(p => [p.lat, p.lng])} pathOptions={{ color: COLOR_RUTA, weight: 4 }} />}
                    {puntos.map((p, i) => (
                        <Marker key={i} position={[p.lat, p.lng]} draggable
                            icon={iconoPunto(i === 0 ? '#27ae60' : i === puntos.length - 1 ? COLOR_RUTA : '#f39c12', i + 1)}
                            eventHandlers={{
                                click: () => quitar(i),
                                dragend: (e) => mover(i, e.target.getLatLng()),
                            }} />
                    ))}
                </MapContainer>
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: puntos.length ? '#27ae60' : '#95a5a6', fontWeight: 'bold' }}>
                    {puntos.length ? `${puntos.length} puntos · ${formatearDistancia(metros)}` : 'Sin itinerario'}
                </span>
                {puntos.length > 0 && (
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => quitar(puntos.length - 1)} style={st.btn}><Undo2 size={13} /> Deshacer</button>
                        <button type="button" onClick={() => { if (window.confirm('¿Borrar todo el itinerario?')) onChange([]); }}
                            style={{ ...st.btn, color: '#e74c3c', borderColor: '#e74c3c' }}><Trash2 size={13} /> Borrar</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Vista de solo lectura. rutas: [{ nombre, puntos, color }], marcadores: [{ nombre, lat, lng }]
export function ItinerarioVista({ rutas = [], marcadores = [], alto = 280 }) {
    const [capa, setCapa] = useState('callejero');
    const rutasValidas = rutas.filter(r => r.puntos?.length > 0);
    const todos = [...rutasValidas.flatMap(r => r.puntos), ...marcadores];

    if (todos.length === 0) {
        return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa', borderRadius: 10, color: '#95a5a6', fontStyle: 'italic', fontSize: '0.9rem' }}>Aún no hay ubicación ni itinerario.</div>;
    }

    return (
        <div>
            <div style={{ height: alto, borderRadius: 10, overflow: 'hidden', border: '1px solid #dfe6e9', position: 'relative' }}>
                <SelectorCapa capa={capa} setCapa={setCapa} />
                <MapContainer center={[todos[0].lat, todos[0].lng]} zoom={13} style={{ width: '100%', height: '100%' }} scrollWheelZoom={false}>
                    <TileLayer key={capa} attribution={CAPAS[capa].attribution} url={CAPAS[capa].url} maxZoom={CAPAS[capa].maxZoom || 19} />
                    <AjustarTamano />
                    <EncuadrarPuntos puntos={todos} />
                    {marcadores.map((m, i) => (
                        <Marker key={`m-${i}`} position={[m.lat, m.lng]} icon={iconoPunto('#2c3e50', '⛰')}>
                            {m.nombre && <Tooltip>{m.nombre}</Tooltip>}
                        </Marker>
                    ))}
                    {rutasValidas.map((r, i) => (
                        <React.Fragment key={`r-${i}`}>
                            {r.puntos.length > 1 && (
                                <Polyline positions={r.puntos.map(p => [p.lat, p.lng])} pathOptions={{ color: r.color || COLOR_RUTA, weight: 4 }}>
                                    {r.nombre && <Tooltip sticky>{r.nombre}</Tooltip>}
                                </Polyline>
                            )}
                            <Marker position={[r.puntos[0].lat, r.puntos[0].lng]} icon={iconoPunto(r.color || COLOR_RUTA, 'P')}>
                                {r.nombre && <Tooltip>Inicio: {r.nombre}</Tooltip>}
                            </Marker>
                        </React.Fragment>
                    ))}
                </MapContainer>
            </div>
            {rutasValidas.map((r, i) => (
                <div key={i} style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: '0.85em' }}>
                    <span style={{ color: '#2c3e50' }}>
                        <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: r.color || COLOR_RUTA, marginRight: 6, verticalAlign: 'middle' }} />
                        <strong>{r.nombre || 'Itinerario'}</strong> · {formatearDistancia(distanciaRuta(r.puntos))}
                    </span>
                    <a href={enlaceComoLlegar(r.puntos[0])} target="_blank" rel="noreferrer"
                        style={{ color: '#3498db', fontWeight: 'bold', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Navigation size={13} /> Cómo llegar al inicio
                    </a>
                </div>
            ))}
        </div>
    );
}

const st = {
    btn: { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 'bold' },
};
