import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Search, MapPin, Crosshair, X, Layers } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const CAPAS = {
    callejero: {
        label: 'Mapa',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    satelite: {
        label: 'Satélite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    },
};

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Fuerza invalidateSize al abrir (el modal puede tener tamaño 0 al montar)
function MapResizer() {
    const map = useMap();
    useEffect(() => {
        setTimeout(() => map.invalidateSize(), 80);
    }, [map]);
    return null;
}

// Vuela a unas coordenadas cuando cambian por búsqueda externa
function MapFlyTo({ lat, lng }) {
    const map = useMap();
    const prev = useRef(null);
    useEffect(() => {
        if (lat && lng) {
            const key = `${lat},${lng}`;
            if (key !== prev.current) {
                prev.current = key;
                map.flyTo([parseFloat(lat), parseFloat(lng)], 14, { duration: 1 });
            }
        }
    }, [lat, lng, map]);
    return null;
}

function MapClickHandler({ onClicar }) {
    useMapEvents({ click: (e) => onClicar(e.latlng.lat, e.latlng.lng) });
    return null;
}

export default function LocationPicker({ lat, lng, onChange }) {
    const [busqueda, setBusqueda] = useState('');
    const [buscando, setBuscando] = useState(false);
    const [resultados, setResultados] = useState([]);
    const [gpsError, setGpsError] = useState('');
    const [capa, setCapa] = useState('callejero');
    const inputRef = useRef(null);

    const tienePos = lat !== '' && lat !== undefined && lng !== '' && lng !== undefined;
    const center = tienePos ? [parseFloat(lat), parseFloat(lng)] : [40.416, -3.703];

    const buscar = async () => {
        const q = busqueda.trim();
        if (!q) return;
        setBuscando(true);
        setResultados([]);
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&accept-language=es`,
                { headers: { 'Accept-Language': 'es' } }
            );
            const data = await res.json();
            setResultados(data);
        } catch (_) {}
        setBuscando(false);
    };

    const seleccionar = (r) => {
        onChange(parseFloat(r.lat), parseFloat(r.lon));
        setResultados([]);
        setBusqueda('');
    };

    const usarGPS = () => {
        setGpsError('');
        if (!navigator.geolocation) { setGpsError('GPS no disponible en este dispositivo.'); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => onChange(pos.coords.latitude, pos.coords.longitude),
            () => setGpsError('No se pudo obtener tu ubicación.')
        );
    };

    const quitar = () => onChange('', '');

    return (
        <div>
            {/* Buscador */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#95a5a6' }} />
                    <input
                        ref={inputRef}
                        value={busqueda}
                        onChange={e => { setBusqueda(e.target.value); if (!e.target.value) setResultados([]); }}
                        onKeyDown={e => e.key === 'Enter' && buscar()}
                        placeholder="Buscar lugar… o clic directo en el mapa"
                        style={{ width: '100%', padding: '9px 12px 9px 32px', border: '2px solid #bdc3c7', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box', outline: 'none' }}
                    />
                </div>
                <button onClick={buscar} disabled={buscando}
                    style={{ padding: '9px 14px', background: '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                    {buscando ? '…' : 'Buscar'}
                </button>
                <button onClick={usarGPS} title="Usar mi ubicación GPS"
                    style={{ padding: '9px 12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    <Crosshair size={16} />
                </button>
            </div>

            {/* Resultados */}
            {resultados.length > 0 && (
                <div style={{ border: '1px solid #ddd', borderRadius: 8, marginBottom: 8, maxHeight: 160, overflowY: 'auto', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {resultados.map((r, i) => (
                        <div key={i} onClick={() => seleccionar(r)}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.82rem', color: '#2c3e50', borderBottom: i < resultados.length - 1 ? '1px solid #f0f0f0' : 'none' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#eaf4ff'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            <MapPin size={12} style={{ marginRight: 6, color: '#e74c3c', flexShrink: 0 }} />
                            {r.display_name}
                        </div>
                    ))}
                </div>
            )}

            {gpsError && <p style={{ color: '#e74c3c', fontSize: '0.82rem', marginBottom: 6 }}>{gpsError}</p>}

            {/* Instrucción + toggle capa */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p style={{ fontSize: '0.78rem', color: '#7f8c8d', margin: 0 }}>
                    Clic en el mapa para fijar la ubicación. El marcador se puede arrastrar.
                </p>
                <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #bdc3c7', flexShrink: 0 }}>
                    {Object.entries(CAPAS).map(([key, c]) => (
                        <button key={key} onClick={() => setCapa(key)}
                            style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', background: capa === key ? '#2c3e50' : 'white', color: capa === key ? 'white' : '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Layers size={12} /> {c.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Mapa */}
            <div style={{ height: 240, borderRadius: 10, overflow: 'hidden', border: '2px solid #bdc3c7' }}>
                <MapContainer
                    center={center}
                    zoom={tienePos ? 13 : 6}
                    style={{ width: '100%', height: '100%' }}
                    scrollWheelZoom={true}
                >
                    <TileLayer
                        key={capa}
                        attribution={CAPAS[capa].attribution}
                        url={CAPAS[capa].url}
                    />
                    <MapResizer />
                    {tienePos && <MapFlyTo lat={lat} lng={lng} />}
                    <MapClickHandler onClicar={(la, ln) => onChange(la, ln)} />
                    {tienePos && (
                        <Marker
                            position={[parseFloat(lat), parseFloat(lng)]}
                            draggable
                            eventHandlers={{
                                dragend: (e) => {
                                    const pos = e.target.getLatLng();
                                    onChange(pos.lat, pos.lng);
                                }
                            }}
                        />
                    )}
                </MapContainer>
            </div>

            {/* Coordenadas + quitar */}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {tienePos ? (
                    <span style={{ fontSize: '0.8rem', color: '#27ae60', fontWeight: 'bold' }}>
                        <MapPin size={12} style={{ marginRight: 4 }} />
                        {parseFloat(lat).toFixed(5)}, {parseFloat(lng).toFixed(5)}
                    </span>
                ) : (
                    <span style={{ fontSize: '0.8rem', color: '#95a5a6' }}>Sin ubicación fijada</span>
                )}
                {tienePos && (
                    <button onClick={quitar}
                        style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <X size={14} /> Quitar
                    </button>
                )}
            </div>
        </div>
    );
}
