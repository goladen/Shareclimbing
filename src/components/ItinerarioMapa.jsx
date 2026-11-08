import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Layers, Undo2, Trash2, Navigation, Radio, Pause, MapPin, Download } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
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

const iconoPunto = (color, texto, conNota = false) => new L.DivIcon({
    className: '',
    html: `<div style="position:relative;width:22px;height:22px;border-radius:50%;background:${color};color:white;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;">${texto}${conNota ? '<span style="position:absolute;top:-5px;right:-5px;width:10px;height:10px;border-radius:50%;background:#3498db;border:1.5px solid white;"></span>' : ''}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
});

// Marcador de observación en la vista: círculo blanco con el número de la nota
const iconoNota = (color, n) => new L.DivIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:white;color:#2c3e50;border:2px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;">${n}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
});

// Puntos de la ruta que llevan observación, numerados por orden de aparición
const notasRuta = (puntos = []) => puntos.filter(p => p.nota).map((p, i) => ({ p, n: i + 1 }));

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

// Mientras se graba, el mapa sigue al último punto sin cambiar el zoom
function SeguirUltimo({ punto }) {
    const map = useMap();
    const clave = punto ? `${punto.lat},${punto.lng}` : '';
    useEffect(() => {
        if (punto) map.panTo([punto.lat, punto.lng]);
    }, [clave]); // eslint-disable-line
    return null;
}

const iconoPosicion = new L.DivIcon({
    className: '',
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#3498db;border:3px solid white;box-shadow:0 0 0 4px rgba(52,152,219,0.35);"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});

// Editor: cada clic añade un punto; los puntos se arrastran y al pulsarlos se edita su observación.
// grabar = muestra el grabador GPS (página de itinerarios grabados); si no, ofrece importar uno grabado.
export function ItinerarioEditor({ puntos = [], onChange, lat, lng, grabar = false, alto = 280 }) {
    const [capa, setCapa] = useState('callejero');
    const [gps, setGps] = useState({ grabando: false, fix: null });
    const tieneCentro = lat !== '' && lat != null && lng !== '' && lng != null;
    const encuadreInicial = useRef(puntos);
    const centro = tieneCentro ? [{ lat: parseFloat(lat), lng: parseFloat(lng) }] : [];
    const metros = distanciaRuta(puntos);

    const anadir = ({ lat: la, lng: ln }) => onChange([...puntos, { lat: +la.toFixed(6), lng: +ln.toFixed(6) }]);
    const mover = (i, { lat: la, lng: ln }) => onChange(puntos.map((p, idx) => idx === i ? { ...p, lat: +la.toFixed(6), lng: +ln.toFixed(6) } : p));
    const quitar = (i) => onChange(puntos.filter((_, idx) => idx !== i));
    const ponerNota = (i, nota) => onChange(puntos.map((p, idx) => {
        if (idx !== i) return p;
        const { nota: _anterior, ...resto } = p;
        return nota.trim() ? { ...resto, nota: nota.trim() } : resto; // sin claves undefined (Firestore no las acepta)
    }));

    return (
        <div>
            <p style={{ fontSize: '0.78rem', color: '#7f8c8d', margin: '0 0 6px' }}>
                {grabar
                    ? 'Graba el recorrido con el GPS mientras caminas o pulsa en el mapa para añadir puntos a mano. Arrastra un punto para moverlo; púlsalo para añadirle una observación o quitarlo.'
                    : 'Pulsa en el mapa desde el aparcamiento hasta la pared, o importa un itinerario que hayas grabado con el GPS. Arrastra un punto para moverlo; púlsalo para añadirle una observación o quitarlo.'}
            </p>
            {grabar
                ? <GrabadorGPS puntos={puntos} onChange={onChange} onEstado={setGps} />
                : <ImportarGrabado tienePuntos={puntos.length > 0} onImportar={onChange} />}
            <div style={{ height: alto, borderRadius: 10, overflow: 'hidden', border: '2px solid #bdc3c7', position: 'relative' }}>
                <SelectorCapa capa={capa} setCapa={setCapa} />
                <MapContainer center={[40.416, -3.703]} zoom={6} style={{ width: '100%', height: '100%' }}>
                    <TileLayer key={capa} attribution={CAPAS[capa].attribution} url={CAPAS[capa].url} maxZoom={CAPAS[capa].maxZoom || 19} />
                    <AjustarTamano />
                    {/* Encuadra la ruta guardada al abrir; sin ruta, sigue la ubicación fijada */}
                    <EncuadrarPuntos puntos={encuadreInicial.current.length > 0 ? encuadreInicial.current : centro} />
                    {gps.grabando && <SeguirUltimo punto={gps.fix || puntos[puntos.length - 1]} />}
                    <ClickEnMapa onClicar={anadir} />
                    {puntos.length > 1 && <Polyline positions={puntos.map(p => [p.lat, p.lng])} pathOptions={{ color: COLOR_RUTA, weight: 4 }} />}
                    {puntos.map((p, i) => (
                        <Marker key={i} position={[p.lat, p.lng]} draggable
                            icon={iconoPunto(i === 0 ? '#27ae60' : i === puntos.length - 1 ? COLOR_RUTA : '#f39c12', i + 1, !!p.nota)}
                            eventHandlers={{ dragend: (e) => mover(i, e.target.getLatLng()) }}>
                            <Popup minWidth={220}>
                                <NotaPunto numero={i + 1} nota={p.nota || ''} onGuardar={(n) => ponerNota(i, n)} onQuitar={() => quitar(i)} />
                            </Popup>
                        </Marker>
                    ))}
                    {gps.grabando && gps.fix && (
                        <Marker position={[gps.fix.lat, gps.fix.lng]} icon={iconoPosicion} interactive={false} />
                    )}
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

// Copia en este formulario un itinerario grabado con el GPS (colección itinerarios_grabados)
function ImportarGrabado({ tienePuntos, onImportar }) {
    const { usuario } = useAuth();
    const [abierto, setAbierto] = useState(false);
    const [lista, setLista] = useState(null);

    const abrir = async () => {
        setAbierto(true);
        setLista(null);
        try {
            const snap = await getDocs(query(collection(db, 'itinerarios_grabados'), where('creadoPor', '==', usuario.uid)));
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
            setLista(docs);
        } catch (e) {
            console.error(e);
            setLista([]);
        }
    };

    const elegir = (it) => {
        if (tienePuntos && !window.confirm(`Se sustituirá el itinerario actual por «${it.nombre}». ¿Continuar?`)) return;
        onImportar(it.puntos || []);
        setAbierto(false);
    };

    if (!usuario) return null;

    return (
        <div style={{ marginBottom: 8 }}>
            {!abierto ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" onClick={abrir} style={st.btn}><Download size={13} /> Importar itinerario grabado</button>
                    <a href="#/grabar" target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: '#3498db', fontWeight: 'bold', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Radio size={12} /> Grabar uno con el GPS
                    </a>
                </div>
            ) : (
                <div style={{ padding: 8, borderRadius: 10, border: '1px solid #dfe6e9', background: '#f8f9fa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <strong style={{ fontSize: '0.8rem', color: '#2c3e50' }}>Mis itinerarios grabados</strong>
                        <button type="button" onClick={() => setAbierto(false)} style={{ ...st.btn, padding: '2px 8px' }}>Cerrar</button>
                    </div>
                    {lista === null ? (
                        <div style={{ fontSize: '0.78rem', color: '#7f8c8d' }}>Cargando…</div>
                    ) : lista.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: '#7f8c8d' }}>
                            Aún no has grabado ninguno. <a href="#/grabar" target="_blank" rel="noreferrer" style={{ color: '#3498db', fontWeight: 'bold' }}>Grabar uno</a>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                            {lista.map(it => (
                                <button key={it.id} type="button" onClick={() => elegir(it)} disabled={!it.puntos?.length}
                                    style={{ textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: '1px solid #dfe6e9', background: 'white', cursor: it.puntos?.length ? 'pointer' : 'default', fontSize: '0.8rem', opacity: it.puntos?.length ? 1 : 0.5 }}>
                                    <strong>{it.nombre}</strong>
                                    <span style={{ color: '#7f8c8d' }}> · {it.puntos?.length || 0} puntos · {formatearDistancia(distanciaRuta(it.puntos || []))}{it.estado === 'grabando' ? ' · en curso' : ''}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Contenido del popup de un punto en el editor: observación + quitar
function NotaPunto({ numero, nota, onGuardar, onQuitar }) {
    const [texto, setTexto] = useState(nota);
    useEffect(() => setTexto(nota), [nota]);
    const sinCambios = texto.trim() === nota.trim();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <strong style={{ fontSize: '0.85rem' }}>Punto {numero}</strong>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} maxLength={300}
                placeholder="Observación (ej: hito de piedras, desvío a la izquierda, fuente...)"
                style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.8rem', padding: 6, borderRadius: 6, border: '1px solid #bdc3c7', resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                <button type="button" onClick={() => onGuardar(texto)} disabled={sinCambios}
                    style={{ ...st.btn, background: '#2c3e50', color: 'white', borderColor: '#2c3e50', opacity: sinCambios ? 0.5 : 1 }}>Guardar nota</button>
                <button type="button" onClick={onQuitar} style={{ ...st.btn, color: '#e74c3c', borderColor: '#e74c3c' }}><Trash2 size={12} /> Quitar punto</button>
            </div>
        </div>
    );
}

// ---- Grabación del recorrido con el GPS del dispositivo ----
const INTERVALOS = [
    { min: 0, label: 'Solo manual' },
    { min: 1, label: 'Cada 1 min' },
    { min: 2, label: 'Cada 2 min' },
    { min: 4, label: 'Cada 4 min' },
    { min: 5, label: 'Cada 5 min' },
    { min: 10, label: 'Cada 10 min' },
];
const DISTANCIA_MIN_AUTO = 10;      // m: si no te has movido, el punto automático no se guarda
const MAX_ANTIGUEDAD_FIX = 120000;  // ms: no usar una posición de hace más de 2 min

// Cada punto que añade se pasa a onChange al momento; quien lo usa lo guarda en Firestore.
function GrabadorGPS({ puntos, onChange, onEstado }) {
    const [grabando, setGrabando] = useState(false);
    const [intervalo, setIntervalo] = useState(5);
    const [fix, setFix] = useState(null);          // { lat, lng, precision, t }
    const [error, setError] = useState('');
    const [nota, setNota] = useState('');
    const [ahora, setAhora] = useState(Date.now());
    const [avisoPunto, setAvisoPunto] = useState('');

    // Refs para que los temporizadores vean siempre el estado más reciente
    // Solo se toma la lista de props cuando cambia de verdad: así un re-render previo a que
    // Firestore devuelva el punto recién añadido no lo borra de la referencia.
    const puntosRef = useRef(puntos);
    const puntosPropRef = useRef(puntos);
    if (puntosPropRef.current !== puntos) {
        puntosPropRef.current = puntos;
        puntosRef.current = puntos;
    }
    const fixRef = useRef(null);
    const ultimoAutoRef = useRef(0);
    const primerPuntoRef = useRef(false);
    const watchRef = useRef(null);
    const wakeLockRef = useRef(null);

    useEffect(() => { onEstado?.({ grabando, fix }); }, [grabando, fix]); // eslint-disable-line

    const agregar = (pos, texto = '') => {
        const p = { lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6) };
        if (texto.trim()) p.nota = texto.trim();
        const nuevos = [...puntosRef.current, p];
        puntosRef.current = nuevos;
        onChange(nuevos);
        setAvisoPunto(`Punto ${nuevos.length} guardado a las ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    };

    // Evita que la pantalla se apague mientras se graba (si el navegador lo permite)
    const pedirWakeLock = async () => {
        try { wakeLockRef.current = await navigator.wakeLock?.request('screen'); } catch { /* no soportado o denegado */ }
    };

    const soltarGPS = () => {
        if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
        wakeLockRef.current?.release?.().catch(() => {});
        wakeLockRef.current = null;
    };

    const iniciar = () => {
        if (!navigator.geolocation) { setError('Este dispositivo o navegador no permite obtener la ubicación.'); return; }
        setError('');
        primerPuntoRef.current = true;
        ultimoAutoRef.current = Date.now();
        setAhora(Date.now());
        watchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy, t: Date.now() };
                fixRef.current = f;
                setFix(f);
                setError('');
                if (primerPuntoRef.current) {   // al empezar (o continuar) se guarda la posición de ese momento
                    primerPuntoRef.current = false;
                    ultimoAutoRef.current = Date.now();
                    const ultimo = puntosRef.current[puntosRef.current.length - 1];
                    if (!ultimo || L.latLng(ultimo).distanceTo(L.latLng(f)) >= DISTANCIA_MIN_AUTO) agregar(f);
                }
            },
            (err) => setError(err.code === 1
                ? 'Permiso de ubicación denegado. Actívalo en el navegador para grabar.'
                : 'No se pudo obtener la ubicación. Buscando señal GPS...'),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
        );
        pedirWakeLock();
        setGrabando(true);
    };

    const pausar = () => {
        soltarGPS();
        setGrabando(false);
        setFix(null);
    };

    // Reloj de 1 s: cuenta atrás y punto automático. Compara marcas de tiempo, así que si el
    // navegador ralentiza los temporizadores el punto se toma en cuanto vuelve a ejecutarse.
    useEffect(() => {
        if (!grabando) return;
        const id = setInterval(() => {
            const t = Date.now();
            setAhora(t);
            if (!intervalo || t - ultimoAutoRef.current < intervalo * 60000) return;
            ultimoAutoRef.current = t;
            const f = fixRef.current;
            if (!f || t - f.t > MAX_ANTIGUEDAD_FIX) return;
            const ultimo = puntosRef.current[puntosRef.current.length - 1];
            if (ultimo && L.latLng(ultimo).distanceTo(L.latLng(f)) < DISTANCIA_MIN_AUTO) return;
            agregar(f);
        }, 1000);
        return () => clearInterval(id);
    }, [grabando, intervalo]); // eslint-disable-line

    // El bloqueo de pantalla se pierde al cambiar de pestaña: se vuelve a pedir al regresar
    useEffect(() => {
        if (!grabando) return;
        const alVolver = () => { if (document.visibilityState === 'visible') pedirWakeLock(); };
        document.addEventListener('visibilitychange', alVolver);
        return () => document.removeEventListener('visibilitychange', alVolver);
    }, [grabando]);

    // Al salir de la página se deja de usar el GPS
    useEffect(() => soltarGPS, []); // eslint-disable-line

    const marcarAhora = () => {
        const texto = nota;
        const hecho = (pos) => {
            agregar(pos, texto);
            setNota('');
            ultimoAutoRef.current = Date.now();   // reinicia la cuenta atrás
            primerPuntoRef.current = false;
        };
        const f = fixRef.current;
        if (f && Date.now() - f.t <= MAX_ANTIGUEDAD_FIX) { hecho(f); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => hecho({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => setError('Aún no hay señal GPS. Espera unos segundos y vuelve a intentarlo.'),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
        );
    };

    const restante = intervalo ? Math.max(0, intervalo * 60000 - (ahora - ultimoAutoRef.current)) : 0;
    const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

    return (
        <div style={{ marginBottom: 8, padding: 10, borderRadius: 10, border: `1px solid ${grabando ? '#e74c3c' : '#dfe6e9'}`, background: grabando ? '#fdf2f1' : '#f8f9fa' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {!grabando ? (
                    <button type="button" onClick={iniciar} style={{ ...st.btn, background: '#e74c3c', color: 'white', borderColor: '#e74c3c' }}>
                        <Radio size={13} /> {puntos.length ? 'Continuar grabando' : 'Empezar a grabar'}
                    </button>
                ) : (
                    <button type="button" onClick={pausar} style={{ ...st.btn, background: '#2c3e50', color: 'white', borderColor: '#2c3e50' }}>
                        <Pause size={12} /> Pausar
                    </button>
                )}
                <select value={intervalo} onChange={e => { setIntervalo(+e.target.value); ultimoAutoRef.current = Date.now(); }}
                    title="Cada cuánto se envía un punto automáticamente"
                    style={{ fontSize: '0.78rem', padding: '4px 6px', borderRadius: 6, border: '1px solid #bdc3c7' }}>
                    {INTERVALOS.map(o => <option key={o.min} value={o.min}>{o.label}</option>)}
                </select>
                {grabando && (
                    <span style={{ fontSize: '0.75rem', color: '#c0392b', fontWeight: 'bold' }}>
                        ● Grabando{intervalo ? ` · próximo punto en ${mmss(restante)}` : ''}
                        {fix ? ` · precisión ±${Math.round(fix.precision)} m` : ' · buscando GPS...'}
                    </span>
                )}
            </div>

            {grabando && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <input value={nota} onChange={e => setNota(e.target.value)} maxLength={300}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); marcarAhora(); } }}
                        placeholder="Observación para este punto (opcional)"
                        style={{ flex: '1 1 180px', minWidth: 0, fontSize: '0.8rem', padding: '5px 8px', borderRadius: 6, border: '1px solid #bdc3c7' }} />
                    <button type="button" onClick={marcarAhora} style={{ ...st.btn, background: '#27ae60', color: 'white', borderColor: '#27ae60' }}>
                        <MapPin size={13} /> Enviar punto ahora
                    </button>
                </div>
            )}

            {avisoPunto && <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#27ae60', fontWeight: 'bold' }}>✓ {avisoPunto}</p>}
            {error && <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#c0392b' }}>{error}</p>}
            {grabando && (
                <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#7f8c8d' }}>
                    Mantén esta pantalla abierta mientras caminas: si bloqueas el móvil o cambias de app, el navegador puede dejar de recibir el GPS. Cada punto se guarda al momento; puedes cerrar y seguir otro día.
                </p>
            )}
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
                            {notasRuta(r.puntos).map(({ p, n }) => (
                                <Marker key={`n-${n}`} position={[p.lat, p.lng]} icon={iconoNota(r.color || COLOR_RUTA, n)}>
                                    <Popup><strong>{n}.</strong> {p.nota}</Popup>
                                </Marker>
                            ))}
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
                    {notasRuta(r.puntos).length > 0 && (
                        <ol style={{ flexBasis: '100%', margin: '2px 0 0', paddingLeft: 0, listStyle: 'none', color: '#555', fontSize: '0.95em' }}>
                            {notasRuta(r.puntos).map(({ p, n }) => (
                                <li key={n} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 3 }}>
                                    <span style={{ flexShrink: 0, minWidth: 18, height: 18, borderRadius: 9, background: 'white', border: `2px solid ${r.color || COLOR_RUTA}`, color: '#2c3e50', fontSize: '0.75em', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
                                    <span>{p.nota}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            ))}
        </div>
    );
}

const st = {
    btn: { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 'bold' },
};
