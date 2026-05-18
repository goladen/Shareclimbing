import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { Search, Plus, LogIn, LogOut, Layers, Mountain, User } from 'lucide-react';
import logo from '../assets/logotopoclimbing.png';
import EscuelaModal from '../components/EscuelaModal';
import NotificacionesCampana from '../components/NotificacionesCampana';

const CAPAS_MAPA = {
    callejero: {
        label: 'Mapa',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    satelite: {
        label: 'Satélite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
    },
};
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import 'leaflet/dist/leaflet.css';

// Corregir iconos de Leaflet con Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const iconoEscuela = new L.DivIcon({
    className: '',
    html: `<div style="background:#27ae60;color:white;padding:5px 9px;border-radius:12px;font-size:13px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2px solid white;">⛰️</div>`,
    iconAnchor: [14, 14],
});

// Extrae lat/lng: primero coordenadas explícitas, luego parseo de mapsUrl
function extraerCoordenadas(info) {
    if (!info) return null;
    if (info.lat !== '' && info.lat !== undefined && info.lng !== '' && info.lng !== undefined) {
        const la = parseFloat(info.lat);
        const ln = parseFloat(info.lng);
        if (!isNaN(la) && !isNaN(ln)) return { lat: la, lng: ln };
    }
    const mapsUrl = info.mapsUrl;
    if (!mapsUrl) return null;
    const m = mapsUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    const m2 = mapsUrl.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m2) return { lat: parseFloat(m2[1]), lng: parseFloat(m2[2]) };
    return null;
}

function RecenterMap({ coords }) {
    const map = useMap();
    useEffect(() => {
        if (coords) map.setView(coords, 13, { animate: true });
    }, [coords, map]);
    return null;
}

function FlyToEscuela({ escuelas, escuelaId }) {
    const map = useMap();
    useEffect(() => {
        if (!escuelaId || !escuelas.length) return;
        const e = escuelas.find(e => e.id === escuelaId);
        if (e?.lat && e?.lng) map.flyTo([e.lat, e.lng], 14, { duration: 1.5 });
    }, [escuelaId, escuelas]); // eslint-disable-line
    return null;
}

export default function HomePage({ onCrearCroquis, onVerCroquis, onVerPerfil, escuelaIdDestacada }) {
    const { usuario, cerrarSesion, setModalAuth } = useAuth();
    const [croquis, setCroquis] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [cargando, setCargando] = useState(true);
    const [sectorSeleccionado, setSectorSeleccionado] = useState(null);
    const [capaMapa, setCapaMapa] = useState('callejero');
    const [escuelas, setEscuelas] = useState([]);
    const [mostrarModalEscuela, setMostrarModalEscuela] = useState(false);
    const [escuelaEditando, setEscuelaEditando] = useState(null);
    const [vistaActiva, setVistaActiva] = useState('croquis'); // 'croquis' | 'escuelas'
    const markerEscuelaRef = useRef(null);

    // Cuando llega un deep link de escuela, cambiar a la pestaña de escuelas y abrir popup
    useEffect(() => {
        if (!escuelaIdDestacada) return;
        setVistaActiva('escuelas');
        // Abrir popup después de que el mapa renderice los marcadores
        const t = setTimeout(() => markerEscuelaRef.current?.openPopup(), 1800);
        return () => clearTimeout(t);
    }, [escuelaIdDestacada, escuelas]);

    const cargarCroquis = useCallback(async () => {
        setCargando(true);
        try {
            const snapAll = await getDocs(collection(db, 'croquis_escalada'));
            const todos = snapAll.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter(d => !d.visibilidad || d.visibilidad === 'publico');
            setCroquis(todos);
        } catch (e) { console.error(e); }
        setCargando(false);
    }, []);

    const cargarEscuelas = useCallback(async () => {
        try {
            const snap = await getDocs(collection(db, 'escuelas'));
            setEscuelas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => { cargarCroquis(); cargarEscuelas(); }, [cargarCroquis, cargarEscuelas]);

    const eliminarCroquis = async (id) => {
        if (!window.confirm('¿Eliminar este croquis? Esta acción no se puede deshacer.')) return;
        await deleteDoc(doc(db, 'croquis_escalada', id));
        setCroquis(prev => prev.filter(c => c.id !== id));
    };

    const eliminarEscuela = async (id) => {
        if (!window.confirm('¿Eliminar esta escuela? Esta acción no se puede deshacer.')) return;
        await deleteDoc(doc(db, 'escuelas', id));
        setEscuelas(prev => prev.filter(e => e.id !== id));
    };

    const croquisFiltrados = croquis.filter(c => {
        const texto = busqueda.toLowerCase();
        return !texto
            || c.infoCroquis?.sector?.toLowerCase().includes(texto)
            || c.infoCroquis?.escuela?.toLowerCase().includes(texto);
    });

    const croquisConCoords = croquisFiltrados.filter(c => extraerCoordenadas(c.infoCroquis));

    // Escuelas con ubicación: sus sectores no muestran pin propio
    const escuelasConUbicacion = new Set(
        escuelas.filter(e => e.lat && e.lng).map(e => e.nombre?.toLowerCase().trim()).filter(Boolean)
    );

    // Agrupar por sector para el mapa — excluir sectores cuya escuela ya tiene marcador propio
    const sectoresMapa = Object.values(
        croquisConCoords
            .filter(c => !escuelasConUbicacion.has(c.infoCroquis?.escuela?.toLowerCase().trim()))
            .reduce((acc, c) => {
            const key = `${c.infoCroquis?.escuela}__${c.infoCroquis?.sector}`;
            if (!acc[key]) {
                acc[key] = {
                    coords: extraerCoordenadas(c.infoCroquis),
                    escuela: c.infoCroquis?.escuela,
                    sector: c.infoCroquis?.sector,
                    croquis: []
                };
            }
            acc[key].croquis.push(c);
            return acc;
        }, {})
    );

    return (
        <div style={st.app}>
            {/* NAVBAR */}
            <nav style={st.nav}>
                <div style={st.navLogo}>
                    <img src={logo} alt="TopoClimbing" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
                    <span style={st.navTitle}>TopoClimbing</span>
                </div>
                <div style={st.navBuscador}>
                    <Search size={18} color="#95a5a6" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar sector o escuela…"
                        style={st.inputBusqueda}
                    />
                </div>
                <div style={st.navAcciones}>
                    <button onClick={() => setMostrarModalEscuela(true)} style={st.btnEscuela}>
                        <Mountain size={18} /> Nueva escuela
                    </button>
                    <button onClick={() => onCrearCroquis()} style={st.btnCrear}>
                        <Plus size={18} /> Crear croquis
                    </button>
                    {usuario ? (
                        <div style={st.usuarioInfo}>
                            <NotificacionesCampana
                                onVerCroquis={(croquisId) => {
                                    const c = croquis.find(x => x.id === croquisId);
                                    if (c) onVerCroquis(c);
                                }}
                            />
                            <button onClick={onVerPerfil} style={{ ...st.btnSalir, color: 'rgba(255,255,255,0.85)' }} title="Mi perfil"><User size={18} /></button>
                            <div style={{ ...st.avatarCircle, cursor: 'pointer' }} onClick={onVerPerfil}>{(usuario.displayName || usuario.email)[0].toUpperCase()}</div>
                            <button onClick={cerrarSesion} style={st.btnSalir} title="Cerrar sesión"><LogOut size={16} /></button>
                        </div>
                    ) : (
                        <button onClick={() => setModalAuth(true)} style={st.btnLogin}>
                            <LogIn size={18} /> Entrar
                        </button>
                    )}
                </div>
            </nav>

            {/* MAPA */}
            <div style={st.mapaWrapper}>
                {/* Toggle de capa flotante sobre el mapa */}
                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.4)' }}>
                    {Object.entries(CAPAS_MAPA).map(([key, c]) => (
                        <button key={key} onClick={() => setCapaMapa(key)}
                            style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', background: capaMapa === key ? '#2c3e50' : 'rgba(255,255,255,0.92)', color: capaMapa === key ? 'white' : '#333', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Layers size={12} /> {c.label}
                        </button>
                    ))}
                </div>
                <MapContainer
                    center={[40.416, -3.703]}
                    zoom={6}
                    style={{ width: '100%', height: '100%' }}
                    zoomControl={true}
                >
                    <TileLayer
                        key={capaMapa}
                        attribution={CAPAS_MAPA[capaMapa].attribution}
                        url={CAPAS_MAPA[capaMapa].url}
                    />
                    {sectoresMapa.map((sector, i) => (
                        <Marker key={`s-${i}`} position={[sector.coords.lat, sector.coords.lng]}>
                            <Popup maxWidth={320} minWidth={260}>
                                <PopupSector sector={sector} onVer={onVerCroquis} />
                            </Popup>
                        </Marker>
                    ))}
                    {escuelas.filter(e => e.lat && e.lng).map(e => (
                        <Marker
                            key={`e-${e.id}`}
                            position={[e.lat, e.lng]}
                            icon={iconoEscuela}
                            ref={e.id === escuelaIdDestacada ? markerEscuelaRef : undefined}
                        >
                            <Popup maxWidth={300} minWidth={240}>
                                <PopupEscuela escuela={e} croquis={croquis} onCrearCroquis={onCrearCroquis} />
                            </Popup>
                        </Marker>
                    ))}
                    <FlyToEscuela escuelas={escuelas} escuelaId={escuelaIdDestacada} />
                </MapContainer>
            </div>

            {/* LISTA */}
            <div style={st.lista}>
                {/* Tabs */}
                <div style={st.tabs}>
                    <button onClick={() => setVistaActiva('croquis')} style={{ ...st.tab, ...(vistaActiva === 'croquis' ? st.tabActivo : {}) }}>
                        Croquis <span style={st.contadorBadge}>{croquisFiltrados.length}</span>
                    </button>
                    <button onClick={() => setVistaActiva('escuelas')} style={{ ...st.tab, ...(vistaActiva === 'escuelas' ? st.tabActivo : {}) }}>
                        Escuelas <span style={st.contadorBadge}>{escuelas.length}</span>
                    </button>
                </div>

                {vistaActiva === 'croquis' && (
                    cargando ? <div style={st.cargando}>Cargando…</div>
                    : croquisFiltrados.length === 0
                        ? <div style={st.sinResultados}>{busqueda ? 'No se encontraron sectores.' : 'No hay croquis públicos aún.'}</div>
                        : <div style={st.grid}>{croquisFiltrados.map(c => <TarjetaCroquis key={c.id} croquis={c} onVer={() => onVerCroquis(c)} onEliminar={() => eliminarCroquis(c.id)} usuario={usuario} />)}</div>
                )}

                {vistaActiva === 'escuelas' && (
                    escuelas.length === 0
                        ? <div style={st.sinResultados}>No hay escuelas creadas aún. ¡Crea la primera con el botón "Nueva escuela"!</div>
                        : <div style={st.grid}>
                            {escuelas
                                .filter(e => !busqueda || e.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
                                .map(e => (
                                    <TarjetaEscuela key={e.id} escuela={e}
                                        numSectores={croquis.filter(c => c.infoCroquis?.escuela?.toLowerCase() === e.nombre?.toLowerCase()).length}
                                        onCrearCroquis={onCrearCroquis}
                                        onEditar={() => setEscuelaEditando(e)}
                                        onEliminar={() => eliminarEscuela(e.id)}
                                        usuario={usuario}
                                    />
                                ))
                            }
                        </div>
                )}
            </div>

            {mostrarModalEscuela && (
                <EscuelaModal
                    onClose={() => setMostrarModalEscuela(false)}
                    onCreada={(nueva) => { setEscuelas(prev => [nueva, ...prev]); }}
                />
            )}
            {escuelaEditando && (
                <EscuelaModal
                    escuelaEditar={escuelaEditando}
                    onClose={() => setEscuelaEditando(null)}
                    onEditada={(actualizada) => {
                        setEscuelas(prev => prev.map(e => e.id === actualizada.id ? actualizada : e));
                        setEscuelaEditando(null);
                    }}
                />
            )}
        </div>
    );
}

function PopupSector({ sector, onVer }) {
    const [croquisActivo, setCroquisActivo] = useState(sector.croquis[0]);
    return (
        <div style={{ fontFamily: "'Segoe UI', sans-serif", minWidth: 240 }}>
            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#2c3e50', marginBottom: 4 }}>
                {sector.sector || sector.escuela}
            </div>
            {sector.escuela && sector.sector && (
                <div style={{ color: '#7f8c8d', fontSize: '0.8rem', marginBottom: 8 }}>{sector.escuela}</div>
            )}
            {croquisActivo && (
                <>
                    {croquisActivo.imagenUrl && (
                        <img src={croquisActivo.imagenUrl} alt="sector"
                            style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                        <InfoChip icon="🧗" label={`${croquisActivo.vias?.length || 0} vías`} />
                        {croquisActivo.infoCroquis?.horarioSol && (
                            <InfoChip icon="☀️" label={croquisActivo.infoCroquis.horarioSol} />
                        )}
                        {croquisActivo.infoCroquis?.mejorEpoca && (
                            <InfoChip icon="📅" label={croquisActivo.infoCroquis.mejorEpoca} />
                        )}
                    </div>
                    <button
                        onClick={() => onVer(croquisActivo)}
                        style={{ width: '100%', padding: '9px', background: '#3498db', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.95rem' }}
                    >
                        Ver croquis
                    </button>
                </>
            )}
            {sector.croquis.length > 1 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                    {sector.croquis.map((c, i) => (
                        <button key={c.id} onClick={() => setCroquisActivo(c)}
                            style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 12, border: '1px solid #bdc3c7', background: croquisActivo?.id === c.id ? '#3498db' : 'white', color: croquisActivo?.id === c.id ? 'white' : '#34495e', cursor: 'pointer' }}>
                            {i + 1}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function PopupEscuela({ escuela, croquis, onCrearCroquis }) {
    const sectores = croquis.filter(c => c.infoCroquis?.escuela?.toLowerCase() === escuela.nombre?.toLowerCase());
    return (
        <div style={{ fontFamily: "'Segoe UI', sans-serif", minWidth: 220 }}>
            {escuela.imagenUrl && (
                <img src={escuela.imagenUrl} alt={escuela.nombre}
                    style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
            )}
            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#2c3e50', marginBottom: 4 }}>⛰️ {escuela.nombre}</div>
            {escuela.descripcion && <p style={{ fontSize: '0.82rem', color: '#555', margin: '0 0 8px' }}>{escuela.descripcion}</p>}
            <div style={{ fontSize: '0.8rem', color: '#27ae60', fontWeight: 'bold', marginBottom: 8 }}>
                {sectores.length} sector{sectores.length !== 1 ? 'es' : ''} con croquis
            </div>
            <button onClick={() => onCrearCroquis(escuela.nombre)}
                style={{ width: '100%', padding: '8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>
                + Añadir sector
            </button>
        </div>
    );
}

function TarjetaEscuela({ escuela, numSectores, onCrearCroquis, onEditar, onEliminar, usuario }) {
    const esMio = usuario?.uid === escuela.creadoPor;
    const [copiado, setCopiado] = useState(false);
    const compartir = (e) => {
        e.stopPropagation();
        const url = `${window.location.origin}${window.location.pathname}#/escuela/${escuela.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        });
    };
    return (
        <div style={{ ...st.tarjeta, border: '2px solid #eafaf1' }}>
            <div style={{ ...st.tarjetaImg, background: '#eafaf1', position: 'relative' }}>
                {escuela.imagenUrl
                    ? <img src={escuela.imagenUrl} alt={escuela.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={st.tarjetaImgPlaceholder}>⛰️</div>}
                <div style={{ ...st.tarjetaBadge, background: 'rgba(39,174,96,0.85)' }}>{numSectores} sector{numSectores !== 1 ? 'es' : ''}</div>
                <button onClick={compartir} title="Copiar enlace"
                    style={{ ...st.btnEliminarTarjeta, position: 'absolute', bottom: 8, left: 8, background: copiado ? 'rgba(39,174,96,0.85)' : 'rgba(0,0,0,0.55)', fontSize: '0.75rem', padding: '4px 8px' }}>
                    {copiado ? '✓ Copiado' : '🔗'}
                </button>
                {esMio && (
                    <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4 }}>
                        <button onClick={e => { e.stopPropagation(); onEditar(); }} style={st.btnEliminarTarjeta} title="Editar escuela">✏️</button>
                        <button onClick={e => { e.stopPropagation(); onEliminar(); }} style={st.btnEliminarTarjeta} title="Eliminar escuela">🗑️</button>
                    </div>
                )}
            </div>
            <div style={st.tarjetaInfo}>
                <div style={{ ...st.tarjetaTitulo, color: '#27ae60' }}>{escuela.nombre}</div>
                {escuela.descripcion && <div style={{ ...st.tarjetaEscuela, fontSize: '0.8rem' }}>{escuela.descripcion.slice(0, 80)}{escuela.descripcion.length > 80 ? '…' : ''}</div>}
                <button onClick={() => onCrearCroquis(escuela.nombre)}
                    style={{ marginTop: 8, padding: '6px 12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>
                    + Añadir sector
                </button>
            </div>
        </div>
    );
}

function InfoChip({ icon, label }) {
    return (
        <div style={{ background: '#f8f9fa', borderRadius: 6, padding: '4px 8px', fontSize: '0.78rem', color: '#555' }}>
            {icon} {label}
        </div>
    );
}

function TarjetaCroquis({ croquis, onVer, onEliminar, usuario }) {
    const info = croquis.infoCroquis || {};
    const esMio = usuario?.uid === croquis.creadoPor;
    const [copiado, setCopiado] = useState(false);
    const compartir = (e) => {
        e.stopPropagation();
        const url = `${window.location.origin}${window.location.pathname}#/croquis/${croquis.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        });
    };
    return (
        <div style={{ ...st.tarjeta, position: 'relative' }}>
            <div style={st.tarjetaImg} onClick={onVer}>
                {croquis.imagenUrl
                    ? <img src={croquis.imagenUrl} alt={info.sector} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={st.tarjetaImgPlaceholder}>🏔️</div>}
                <div style={st.tarjetaBadge}>{croquis.vias?.length || 0} vías</div>
                <button onClick={compartir} title="Copiar enlace"
                    style={{ ...st.btnEliminarTarjeta, position: 'absolute', bottom: 8, left: 8, background: copiado ? 'rgba(39,174,96,0.85)' : 'rgba(0,0,0,0.55)', fontSize: '0.75rem', padding: '4px 8px' }}>
                    {copiado ? '✓ Copiado' : '🔗'}
                </button>
                {esMio && (
                    <button
                        onClick={e => { e.stopPropagation(); onEliminar(); }}
                        style={st.btnEliminarTarjeta} title="Eliminar croquis"
                    >🗑️</button>
                )}
            </div>
            <div style={st.tarjetaInfo} onClick={onVer}>
                <div style={st.tarjetaTitulo}>{info.sector || 'Sin nombre'}</div>
                {info.escuela && <div style={st.tarjetaEscuela}>{info.escuela}</div>}
                <div style={st.tarjetaMeta}>
                    {info.horarioSol && <span>☀️ {info.horarioSol}</span>}
                    {info.mejorEpoca && <span>📅 {info.mejorEpoca}</span>}
                </div>
            </div>
        </div>
    );
}

const st = {
    app: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Segoe UI', Tahoma, sans-serif", background: '#f4f6f8' },
    nav: { background: '#2c3e50', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', zIndex: 100, boxShadow: '0 2px 10px rgba(0,0,0,0.3)' },
    navLogo: { display: 'flex', alignItems: 'center', gap: 10 },
    navTitle: { color: 'white', fontWeight: 'bold', fontSize: '1.2rem', letterSpacing: 0.5 },
    navBuscador: { flex: 1, position: 'relative', minWidth: 200, maxWidth: 400 },
    inputBusqueda: { width: '100%', padding: '9px 14px 9px 38px', borderRadius: 25, border: 'none', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', background: 'rgba(255,255,255,0.12)', color: 'white' },
    navAcciones: { display: 'flex', alignItems: 'center', gap: 10 },
    btnEscuela: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'rgba(39,174,96,0.2)', color: 'white', border: '1px solid rgba(39,174,96,0.6)', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' },
    btnCrear: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' },
    tabs: { display: 'flex', gap: 8, marginBottom: 14 },
    tab: { padding: '8px 18px', borderRadius: 20, border: '2px solid #ecf0f1', background: 'white', color: '#7f8c8d', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' },
    tabActivo: { background: '#2c3e50', color: 'white', borderColor: '#2c3e50' },
    btnLogin: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' },
    btnSalir: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 4 },
    usuarioInfo: { display: 'flex', alignItems: 'center', gap: 8 },
    avatarCircle: { width: 32, height: 32, borderRadius: '50%', background: '#3498db', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem' },
    usuarioNombre: { color: 'white', fontSize: '0.85rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    mapaWrapper: { height: '45vh', minHeight: 280, flexShrink: 0, zIndex: 1, position: 'relative' },
    lista: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
    listaHeader: { display: 'flex', alignItems: 'center', marginBottom: 14 },
    listaTitulo: { margin: 0, fontSize: '1.1rem', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: 10 },
    contadorBadge: { background: '#3498db', color: 'white', borderRadius: 12, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 'bold' },
    cargando: { textAlign: 'center', padding: 40, color: '#7f8c8d' },
    sinResultados: { textAlign: 'center', padding: 40, color: '#7f8c8d', fontStyle: 'italic' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 },
    tarjeta: { background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' },
    tarjetaImg: { height: 140, background: '#ecf0f1', position: 'relative', overflow: 'hidden' },
    tarjetaImgPlaceholder: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 48 },
    tarjetaBadge: { position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.55)', color: 'white', borderRadius: 12, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 'bold' },
    btnEliminarTarjeta: { background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 },
    tarjetaInfo: { padding: '12px 14px' },
    tarjetaTitulo: { fontWeight: 'bold', fontSize: '1rem', color: '#2c3e50', marginBottom: 3 },
    tarjetaEscuela: { color: '#7f8c8d', fontSize: '0.82rem', marginBottom: 6 },
    tarjetaMeta: { display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '0.78rem', color: '#555' },
};
