import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Share2, LayoutTemplate, Save, X, ArrowUp, ArrowDown, Trash2, Plus, Minus, AlertTriangle, Sun, Calendar, MapPin, RotateCcw } from 'lucide-react';
import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import CroquisImagen from '../components/CroquisImagen';
import { ItinerarioVista } from '../components/ItinerarioMapa';
import { DesvincularCroquisModal } from '../components/AsociacionEscuela';
import { normalizarNombre as normalizar, nombreCroquis } from '../utils/escuelas';

const POSICIONES_VIAS = [
    { id: 'izquierda', label: 'Izquierda' },
    { id: 'derecha', label: 'Derecha' },
    { id: 'arriba', label: 'Arriba' },
    { id: 'abajo', label: 'Abajo' },
    { id: 'oculta', label: 'Ocultar' },
];
const DIRECCION_VIAS = { izquierda: 'row-reverse', derecha: 'row', arriba: 'column-reverse', abajo: 'column', oculta: 'column' };
const COLORES_RUTA = ['#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#e84393', '#f1c40f'];
const TIPOS_AGREGABLES = [
    { tipo: 'portada', label: 'Portada' },
    { tipo: 'info', label: 'Información' },
    { tipo: 'mapa', label: 'Mapa e itinerarios' },
    { tipo: 'sectores', label: 'Lista de sectores' },
    { tipo: 'texto', label: 'Texto libre' },
];

let contadorBloques = 0;
const crearBloque = (tipo, extra = {}) => ({
    id: `b${Date.now()}_${contadorBloques++}`,
    tipo,
    ancho: 12,
    escala: 1,
    ...(tipo === 'croquis' ? { posicionVias: 'derecha', tamFoto: 65 } : {}),
    ...(tipo === 'mapa' ? { alto: 340 } : {}),
    ...(tipo === 'portada' ? { alto: 240 } : {}),
    ...(tipo === 'texto' ? { texto: '' } : {}),
    ...extra,
});

function fotosDeCroquis(c) {
    const fotos = c.fotos?.length > 0
        ? c.fotos
        : [{ id: 'f0', imagenUrl: c.imagenUrl, vias: c.vias || [], formas: c.formas || [] }];
    return fotos
        .filter(f => f.imagenUrl || f.soloLista)
        .map((foto, i) => ({ clave: `${c.id}:${foto.id || i}`, croquis: c, foto, numero: i + 1, total: fotos.length }));
}

function paginaPorDefecto(fotos, esSector) {
    return [
        crearBloque('portada'),
        crearBloque('info', { ancho: 6 }),
        crearBloque('mapa', { ancho: 6 }),
        ...(esSector ? [] : [crearBloque('sectores')]),
        ...fotos.map(f => crearBloque('croquis', { fotoClave: f.clave })),
    ];
}

export default function EscuelaPagina({ escuelaId, sector, onVolver, onVerSector, onVerCroquis }) {
    const { usuario } = useAuth();
    const [escuela, setEscuela] = useState(null);
    const [croquisEscuela, setCroquisEscuela] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [bloques, setBloques] = useState([]);
    const [bloquesGuardados, setBloquesGuardados] = useState([]);
    const [disenando, setDisenando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [viaSeleccionada, setViaSeleccionada] = useState(null);
    const [copiado, setCopiado] = useState(false);
    const [desvinculando, setDesvinculando] = useState(null);

    const claveSector = normalizar(sector);
    const esSector = Boolean(sector);

    useEffect(() => {
        let cancelado = false;
        setCargando(true);
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'escuelas', escuelaId));
                if (!snap.exists()) { if (!cancelado) { setEscuela(null); setCargando(false); } return; }
                const esc = { id: snap.id, ...snap.data() };
                const snapCroquis = await getDocs(collection(db, 'croquis_escalada'));
                const publicos = snapCroquis.docs.map(d => ({ id: d.id, ...d.data() }))
                    .filter(c => !c.visibilidad || c.visibilidad === 'publico')
                    .filter(c => normalizar(c.infoCroquis?.escuela) === normalizar(esc.nombre));
                if (cancelado) return;
                setEscuela(esc);
                setCroquisEscuela(publicos);
            } catch (e) { console.error(e); }
            if (!cancelado) setCargando(false);
        })();
        return () => { cancelado = true; };
    }, [escuelaId]);

    const croquisPagina = useMemo(
        () => esSector ? croquisEscuela.filter(c => normalizar(c.infoCroquis?.sector) === claveSector) : croquisEscuela,
        [croquisEscuela, esSector, claveSector]
    );
    // La numeración de fotos es por sector, aunque vengan de croquis distintos
    const fotos = useMemo(() => {
        const todas = croquisPagina.flatMap(fotosDeCroquis);
        const grupoDe = (f) => normalizar(f.croquis.infoCroquis?.sector) || f.croquis.id;
        const totales = {};
        todas.forEach(f => { totales[grupoDe(f)] = (totales[grupoDe(f)] || 0) + 1; });
        const vistos = {};
        return todas.map(f => {
            const grupo = grupoDe(f);
            vistos[grupo] = (vistos[grupo] || 0) + 1;
            return { ...f, numero: vistos[grupo], total: totales[grupo] };
        });
    }, [croquisPagina]);
    const fotoPorClave = useMemo(() => Object.fromEntries(fotos.map(f => [f.clave, f])), [fotos]);

    const sectores = useMemo(() => {
        const mapa = new Map();
        croquisEscuela.forEach(c => {
            const nombre = c.infoCroquis?.sector?.trim();
            if (!nombre) return;
            const clave = normalizar(nombre);
            if (!mapa.has(clave)) mapa.set(clave, { nombre, croquis: [] });
            mapa.get(clave).croquis.push(c);
        });
        return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [croquisEscuela]);

    // Monta la página guardada; los croquis publicados después de guardarla se añaden al final
    useEffect(() => {
        if (!escuela) return;
        const guardada = esSector ? escuela.paginasSector?.[claveSector] : escuela.pagina;
        let resultado;
        if (guardada?.bloques) {
            const conocidos = new Set(guardada.conocidos || []);
            const nuevos = fotos.filter(f => !conocidos.has(f.clave)).map(f => crearBloque('croquis', { fotoClave: f.clave }));
            resultado = [...guardada.bloques, ...nuevos];
        } else {
            resultado = paginaPorDefecto(fotos, esSector);
        }
        setBloques(resultado);
        setBloquesGuardados(resultado);
    }, [escuela, fotos]); // eslint-disable-line

    const esPropietario = Boolean(usuario && escuela?.creadoPor === usuario.uid);

    const datos = useMemo(() => {
        if (!escuela) return {};
        if (!esSector) return { ...escuela, titulo: escuela.nombre };
        const primerValor = (campo) => croquisPagina.map(c => c.infoCroquis?.[campo]).find(v => v && v.length !== 0);
        return {
            titulo: croquisPagina[0]?.infoCroquis?.sector?.trim() || sector,
            subtitulo: escuela.nombre,
            imagenUrl: fotos.find(f => f.foto.imagenUrl)?.foto.imagenUrl || escuela.imagenUrl,
            acceso: primerValor('acceso'),
            restricciones: primerValor('restricciones'),
            horarioSol: primerValor('horarioSol'),
            mejorEpoca: primerValor('mejorEpoca'),
            masInfo: primerValor('masInfo'),
            mapsUrl: primerValor('mapsUrl'),
        };
    }, [escuela, esSector, croquisPagina, fotos, sector]);

    const mapa = useMemo(() => {
        if (!escuela) return { rutas: [], marcadores: [] };
        const coordenadas = (o) => {
            const lat = parseFloat(o?.lat), lng = parseFloat(o?.lng);
            return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
        };
        const rutasDeSector = (s, i) => {
            const c = s.croquis.find(x => x.infoCroquis?.itinerario?.length > 0);
            return c ? [{ nombre: s.nombre, puntos: c.infoCroquis.itinerario, color: COLORES_RUTA[i % COLORES_RUTA.length] }] : [];
        };
        const marcadorDeSector = (s) => {
            const coords = s.croquis.map(c => coordenadas(c.infoCroquis)).find(Boolean);
            return coords ? [{ nombre: s.nombre, ...coords }] : [];
        };
        if (esSector) {
            const propio = sectores.filter(s => normalizar(s.nombre) === claveSector);
            return { rutas: propio.flatMap(rutasDeSector), marcadores: propio.flatMap(marcadorDeSector) };
        }
        const coordsEscuela = coordenadas(escuela);
        return {
            rutas: [
                ...(escuela.itinerario?.length > 0 ? [{ nombre: `Hasta ${escuela.nombre}`, puntos: escuela.itinerario, color: '#e74c3c' }] : []),
                ...sectores.flatMap(rutasDeSector),
            ],
            marcadores: [
                ...(coordsEscuela ? [{ nombre: escuela.nombre, ...coordsEscuela }] : []),
                ...sectores.flatMap(marcadorDeSector),
            ],
        };
    }, [escuela, esSector, claveSector, sectores]);

    // ── Edición del diseño ──
    const actualizarBloque = (id, cambios) => setBloques(bs => bs.map(b => b.id === id ? { ...b, ...cambios } : b));
    const moverBloque = (id, delta) => setBloques(bs => {
        const i = bs.findIndex(b => b.id === id);
        const j = i + delta;
        if (j < 0 || j >= bs.length) return bs;
        const copia = [...bs];
        [copia[i], copia[j]] = [copia[j], copia[i]];
        return copia;
    });
    const quitarBloque = (id) => setBloques(bs => bs.filter(b => b.id !== id));

    const fotosSinColocar = fotos.filter(f => !bloques.some(b => b.fotoClave === f.clave));

    const guardarDiseno = async () => {
        setGuardando(true);
        try {
            const pagina = { bloques, conocidos: fotos.map(f => f.clave) };
            const cambios = esSector
                ? { paginasSector: { ...(escuela.paginasSector || {}), [claveSector]: pagina } }
                : { pagina };
            await updateDoc(doc(db, 'escuelas', escuela.id), cambios);
            setEscuela(prev => ({ ...prev, ...cambios }));
            setDisenando(false);
        } catch (e) {
            alert('Error al guardar: ' + e.message);
        }
        setGuardando(false);
    };

    const cancelarDiseno = () => {
        setBloques(bloquesGuardados);
        setDisenando(false);
    };

    const volver = () => {
        if (disenando && JSON.stringify(bloques) !== JSON.stringify(bloquesGuardados)
            && !window.confirm('Tienes cambios de diseño sin guardar. ¿Salir igualmente?')) return;
        onVolver();
    };

    const compartir = () => {
        const url = window.location.href;
        if (navigator.share) {
            navigator.share({ title: datos.titulo, url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
            });
        }
    };

    if (cargando) return <div style={st.mensaje}>Cargando…</div>;
    if (!escuela) {
        return (
            <div style={st.mensaje}>
                <p>Esta escuela no existe o ya no está disponible.</p>
                <button onClick={onVolver} style={{ ...st.btnBarra, background: '#2c3e50', marginTop: 12 }}>Volver al inicio</button>
            </div>
        );
    }

    const renderContenido = (b) => {
        switch (b.tipo) {
            case 'portada': return <BloquePortada datos={datos} alto={b.alto} />;
            case 'info': return <BloqueInfo datos={datos} />;
            case 'mapa': return <ItinerarioVista rutas={mapa.rutas} marcadores={mapa.marcadores} alto={b.alto} />;
            case 'sectores': return <BloqueSectores sectores={sectores} onVerSector={onVerSector} />;
            case 'texto': return disenando
                ? <textarea value={b.texto} onChange={e => actualizarBloque(b.id, { texto: e.target.value })}
                    placeholder="Escribe aquí…" rows={4} style={st.textarea} />
                : <p style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#2c3e50' }}>{b.texto}</p>;
            case 'croquis': {
                const f = fotoPorClave[b.fotoClave];
                return <BloqueCroquis bloque={b} datosFoto={f} mostrarSector={!esSector} onVerVia={setViaSeleccionada} onVerCroquis={onVerCroquis}
                    onDesvincular={esPropietario && !disenando ? setDesvinculando : null}
                    onCambiarTitulo={disenando ? (titulo) => actualizarBloque(b.id, { titulo }) : null} />;
            }
            default: return null;
        }
    };

    // Un croquis borrado o hecho privado deja de mostrarse; un texto vacío solo se ve al diseñar
    const bloquesVisibles = bloques.filter(b =>
        (b.tipo !== 'croquis' || fotoPorClave[b.fotoClave]) && (disenando || b.tipo !== 'texto' || b.texto?.trim())
    );

    return (
        <div style={st.app}>
            <div style={st.topbar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <button onClick={volver} style={st.btnIcono} title="Volver"><ArrowLeft size={20} /></button>
                    <div style={{ minWidth: 0 }}>
                        <div style={st.topbarTitulo}>{datos.titulo}</div>
                        {datos.subtitulo && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{datos.subtitulo}</div>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {disenando ? (
                        <>
                            <button onClick={cancelarDiseno} style={{ ...st.btnBarra, background: 'rgba(255,255,255,0.12)' }}><X size={16} /> Cancelar</button>
                            <button onClick={guardarDiseno} disabled={guardando} style={{ ...st.btnBarra, background: '#27ae60' }}>
                                <Save size={16} /> {guardando ? 'Guardando…' : 'Guardar página'}
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={compartir} style={st.btnIcono} title="Compartir enlace">
                                <Share2 size={18} />
                                {copiado && <span style={{ fontSize: '0.78rem', marginLeft: 4 }}>Copiado</span>}
                            </button>
                            {esPropietario && (
                                <button onClick={() => setDisenando(true)} style={{ ...st.btnBarra, background: '#3498db' }}>
                                    <LayoutTemplate size={16} /> Diseñar página
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {disenando && (
                <div style={st.barraAnadir}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#2c3e50' }}>Añadir:</span>
                    {TIPOS_AGREGABLES.filter(t => !(esSector && t.tipo === 'sectores')).map(t => (
                        <button key={t.tipo} onClick={() => setBloques(bs => [...bs, crearBloque(t.tipo)])} style={st.btnAnadir}>
                            <Plus size={13} /> {t.label}
                        </button>
                    ))}
                    {fotosSinColocar.length > 0 && (
                        <select value="" style={st.selectAnadir}
                            onChange={e => { if (e.target.value) setBloques(bs => [...bs, crearBloque('croquis', { fotoClave: e.target.value })]); }}>
                            <option value="">+ Croquis retirado…</option>
                            {fotosSinColocar.map(f => (
                                <option key={f.clave} value={f.clave}>{tituloFoto(f)}</option>
                            ))}
                        </select>
                    )}
                    <button onClick={() => { if (window.confirm('¿Volver al diseño automático?')) setBloques(paginaPorDefecto(fotos, esSector)); }} style={st.btnAnadir}>
                        <RotateCcw size={13} /> Restablecer
                    </button>
                </div>
            )}

            <div style={st.scroll}>
                <div className="ep-rejilla">
                    {bloquesVisibles.map((b, i) => (
                        <section key={b.id} className="ep-bloque"
                            style={{ '--ep-span': b.ancho, fontSize: `${b.escala}rem`, ...(disenando ? st.bloqueDiseno : {}), ...(b.tipo === 'portada' ? { padding: disenando ? 8 : 0, background: 'transparent', boxShadow: 'none' } : {}) }}>
                            {disenando && (
                                <ControlesBloque bloque={b} primero={i === 0} ultimo={i === bloquesVisibles.length - 1}
                                    onCambiar={cambios => actualizarBloque(b.id, cambios)}
                                    onMover={delta => moverBloque(b.id, delta)}
                                    onQuitar={() => quitarBloque(b.id)} />
                            )}
                            {renderContenido(b)}
                        </section>
                    ))}
                </div>
                {bloquesVisibles.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#7f8c8d', fontStyle: 'italic', padding: 40 }}>Esta página está vacía.</div>
                )}
            </div>

            {desvinculando && (
                <DesvincularCroquisModal
                    croquisId={desvinculando.id}
                    croquisNombre={nombreCroquis(desvinculando.infoCroquis)}
                    escuela={escuela}
                    onClose={() => setDesvinculando(null)}
                    onDesvinculado={(id) => setCroquisEscuela(cs => cs.filter(c => c.id !== id))}
                />
            )}

            {viaSeleccionada && (
                <div style={st.overlay} onClick={() => setViaSeleccionada(null)}>
                    <div style={st.modal} onClick={e => e.stopPropagation()}>
                        <div style={st.modalHeader}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <NumeroVia color={viaSeleccionada.color}>{viaSeleccionada.num}</NumeroVia>
                                {viaSeleccionada.info?.nombre}
                            </h3>
                            <button onClick={() => setViaSeleccionada(null)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={{ padding: 20, lineHeight: 1.7 }}>
                            <p><strong>Grado:</strong> <span style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: '1.1rem' }}>{viaSeleccionada.info?.grado || '–'}</span></p>
                            <p><strong>Equipador:</strong> {viaSeleccionada.info?.equipador || 'Desconocido'}</p>
                            <p><strong>Año:</strong> {viaSeleccionada.info?.anio || '–'}</p>
                            {viaSeleccionada.info?.info && <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{viaSeleccionada.info.info}</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const etiquetaFoto = ({ foto, numero, total }) => foto.nombre || (total > 1 ? `Foto ${numero}` : '');

const tituloFoto = (datosFoto) => {
    const nombre = datosFoto.croquis.infoCroquis?.sector?.trim() || 'Croquis';
    const etiqueta = etiquetaFoto(datosFoto);
    return etiqueta ? `${nombre} · ${etiqueta}` : nombre;
};

function ControlesBloque({ bloque: b, primero, ultimo, onCambiar, onMover, onQuitar }) {
    const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
    return (
        <div style={st.controles}>
            <div style={st.controlesFila}>
                <button onClick={() => onMover(-1)} disabled={primero} style={st.btnControl} title="Subir"><ArrowUp size={14} /></button>
                <button onClick={() => onMover(1)} disabled={ultimo} style={st.btnControl} title="Bajar"><ArrowDown size={14} /></button>
                <Paso etiqueta="Ancho" valor={`${b.ancho}/12`}
                    onMenos={() => onCambiar({ ancho: limitar(b.ancho - 1, 3, 12) })}
                    onMas={() => onCambiar({ ancho: limitar(b.ancho + 1, 3, 12) })} />
                <Paso etiqueta="Letra" valor={`${Math.round(b.escala * 100)}%`}
                    onMenos={() => onCambiar({ escala: limitar(+(b.escala - 0.1).toFixed(1), 0.6, 2) })}
                    onMas={() => onCambiar({ escala: limitar(+(b.escala + 0.1).toFixed(1), 0.6, 2) })} />
                <button onClick={onQuitar} style={{ ...st.btnControl, color: '#e74c3c', marginLeft: 'auto' }} title="Quitar de la página"><Trash2 size={14} /></button>
            </div>
            {b.tipo === 'croquis' && (
                <div style={st.controlesFila}>
                    <span style={st.controlEtiqueta}>Vías:</span>
                    {POSICIONES_VIAS.map(p => (
                        <button key={p.id} onClick={() => onCambiar({ posicionVias: p.id })}
                            style={{ ...st.btnControl, ...(b.posicionVias === p.id ? st.btnControlActivo : {}) }}>{p.label}</button>
                    ))}
                    {(b.posicionVias === 'izquierda' || b.posicionVias === 'derecha') && (
                        <label style={st.controlDeslizador}>
                            Foto {b.tamFoto}%
                            <input type="range" min="30" max="80" step="5" value={b.tamFoto}
                                onChange={e => onCambiar({ tamFoto: parseInt(e.target.value) })} style={{ width: 90 }} />
                        </label>
                    )}
                </div>
            )}
            {(b.tipo === 'mapa' || b.tipo === 'portada') && (
                <div style={st.controlesFila}>
                    <label style={st.controlDeslizador}>
                        Alto {b.alto}px
                        <input type="range" min="120" max="700" step="20" value={b.alto}
                            onChange={e => onCambiar({ alto: parseInt(e.target.value) })} style={{ width: 120 }} />
                    </label>
                </div>
            )}
        </div>
    );
}

const Paso = ({ etiqueta, valor, onMenos, onMas }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={st.controlEtiqueta}>{etiqueta}</span>
        <button onClick={onMenos} style={st.btnControl} title={`Reducir ${etiqueta.toLowerCase()}`}><Minus size={13} /></button>
        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', minWidth: 34, textAlign: 'center', color: '#2c3e50' }}>{valor}</span>
        <button onClick={onMas} style={st.btnControl} title={`Aumentar ${etiqueta.toLowerCase()}`}><Plus size={13} /></button>
    </div>
);

function BloquePortada({ datos, alto }) {
    return (
        <div style={{ height: alto, borderRadius: 12, overflow: 'hidden', position: 'relative', background: '#2c3e50' }}>
            {datos.imagenUrl && <img src={datos.imagenUrl} alt={datos.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 20, background: 'linear-gradient(transparent 35%, rgba(0,0,0,0.72))', color: 'white' }}>
                <h1 style={{ fontSize: '2em', lineHeight: 1.15 }}>{datos.titulo}</h1>
                {datos.subtitulo && <div style={{ opacity: 0.85 }}>{datos.subtitulo}</div>}
                {datos.descripcion && <p style={{ marginTop: 6, fontSize: '0.95em', maxWidth: 720 }}>{datos.descripcion}</p>}
            </div>
        </div>
    );
}

function BloqueInfo({ datos }) {
    const hayDatos = datos.acceso || datos.restricciones || datos.horarioSol || datos.mejorEpoca || datos.masInfo || datos.mapsUrl;
    if (!hayDatos) return <div style={{ color: '#95a5a6', fontStyle: 'italic' }}>Aún no hay información.</div>;
    return (
        <div style={{ color: '#2c3e50', lineHeight: 1.55 }}>
            <h2 style={st.tituloBloque}>Información</h2>
            {datos.horarioSol && <p style={st.lineaInfo}><Sun size={15} /> {datos.horarioSol}</p>}
            {datos.mejorEpoca && <p style={st.lineaInfo}><Calendar size={15} /> {datos.mejorEpoca}</p>}
            {datos.acceso && <p style={{ marginBottom: 10, whiteSpace: 'pre-wrap' }}><strong>Acceso:</strong> {datos.acceso}</p>}
            {datos.restricciones && (
                <div style={{ background: '#fef9e7', border: '1px solid #f9ca24', borderRadius: 8, padding: '8px 12px', marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                    <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} /><strong>Restricciones:</strong> {datos.restricciones}
                </div>
            )}
            {datos.masInfo && <p style={{ marginBottom: 10, whiteSpace: 'pre-wrap' }}>{datos.masInfo}</p>}
            {datos.mapsUrl && (
                <a href={datos.mapsUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#3498db', fontWeight: 'bold', textDecoration: 'none' }}>
                    <MapPin size={15} /> Ver en Google Maps
                </a>
            )}
        </div>
    );
}

function BloqueSectores({ sectores, onVerSector }) {
    if (sectores.length === 0) return <div style={{ color: '#95a5a6', fontStyle: 'italic' }}>Aún no hay sectores con croquis públicos.</div>;
    return (
        <div>
            <h2 style={st.tituloBloque}>Sectores</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {sectores.map(s => {
                    const numVias = s.croquis.flatMap(fotosDeCroquis).reduce((n, f) => n + (f.foto.vias?.length || 0), 0);
                    return (
                        <button key={s.nombre} onClick={() => onVerSector(s.nombre)} style={st.chipSector}>
                            {s.nombre} <span style={{ fontWeight: 'normal', opacity: 0.7, fontSize: '0.85em' }}>· {numVias} vías</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function BloqueCroquis({ bloque, datosFoto, mostrarSector, onVerVia, onVerCroquis, onDesvincular, onCambiarTitulo }) {
    if (!datosFoto) return null;
    const { foto, croquis } = datosFoto;
    const vias = foto.vias || [];
    const combinaciones = foto.combinaciones || [];
    const tieneFoto = Boolean(foto.imagenUrl);
    const tituloAuto = mostrarSector ? tituloFoto(datosFoto) : etiquetaFoto(datosFoto) || 'Croquis';
    const conVias = (!tieneFoto || bloque.posicionVias !== 'oculta') && (vias.length > 0 || combinaciones.length > 0);
    const enLateral = tieneFoto && conVias && (bloque.posicionVias === 'izquierda' || bloque.posicionVias === 'derecha');

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                {onCambiarTitulo
                    ? <input value={bloque.titulo || ''} onChange={e => onCambiarTitulo(e.target.value)} placeholder={tituloAuto} title="Título en esta página" style={st.inputTitulo} />
                    : <h2 style={{ ...st.tituloBloque, margin: 0 }}>{bloque.titulo?.trim() || tituloAuto}</h2>}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {onDesvincular && <button onClick={() => onDesvincular(croquis)} style={{ ...st.btnEnlace, color: '#e74c3c' }}>Desvincular</button>}
                    <button onClick={() => onVerCroquis(croquis)} style={st.btnEnlace}>Ver a pantalla completa</button>
                </div>
            </div>
            <div className="ep-croquis" style={{ display: 'flex', flexDirection: conVias ? DIRECCION_VIAS[bloque.posicionVias] : 'column', gap: 14, alignItems: 'flex-start' }}>
                {tieneFoto && (
                    <div className="ep-croquis-foto" style={{ width: enLateral ? `${bloque.tamFoto}%` : '100%', flexShrink: 0 }}>
                        <CroquisImagen foto={foto} onClickVia={onVerVia} />
                    </div>
                )}
                {conVias && (
                    <div style={{ flex: 1, minWidth: 0, width: enLateral ? undefined : '100%' }}>
                        {vias.map((v, i) => <FilaVia key={v.id ?? i} via={v} marca={i + 1} onClick={() => onVerVia({ ...v, num: i + 1 })} />)}
                        {combinaciones.length > 0 && <div style={{ fontWeight: 'bold', color: '#8e44ad', fontSize: '0.85em', margin: '10px 0 4px' }}>Combinaciones</div>}
                        {combinaciones.map((c, i) => {
                            const letra = String.fromCharCode(65 + i);
                            return <FilaVia key={c.id ?? i} via={c} marca={letra} onClick={() => onVerVia({ ...c, num: letra })} />;
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

const FilaVia = ({ via, marca, onClick }) => (
    <button onClick={onClick} style={st.filaVia}>
        <NumeroVia color={via.color}>{marca}</NumeroVia>
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflowWrap: 'anywhere' }}>{via.info?.nombre}</span>
        {via.info?.grado && <strong style={{ color: '#e74c3c', whiteSpace: 'nowrap' }}>{via.info.grado}</strong>}
    </button>
);

const NumeroVia = ({ color, children }) => (
    <span style={{ background: color, color: 'white', width: '1.7em', height: '1.7em', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8em', flexShrink: 0 }}>
        {children}
    </span>
);

const st = {
    app: { display: 'flex', flexDirection: 'column', height: '100dvh', fontFamily: "'Segoe UI', Tahoma, sans-serif", background: '#f4f6f8' },
    mensaje: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontFamily: 'sans-serif', color: '#7f8c8d', fontSize: '1.05rem', padding: 20, textAlign: 'center' },
    topbar: { background: '#2c3e50', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', zIndex: 10, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' },
    topbarTitulo: { color: 'white', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    btnIcono: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' },
    btnBarra: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
    barraAnadir: { background: 'white', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #dfe6e9', zIndex: 5 },
    btnAnadir: { display: 'flex', alignItems: 'center', gap: 3, padding: '5px 9px', background: '#f8f9fa', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 6, fontSize: '0.78rem', fontWeight: 'bold', cursor: 'pointer' },
    selectAnadir: { padding: '5px 8px', border: '1px solid #bdc3c7', borderRadius: 6, fontSize: '0.78rem', background: 'white', color: '#2c3e50', maxWidth: 200 },
    scroll: { flex: 1, overflowY: 'auto', padding: 16 },
    bloqueDiseno: { outline: '2px dashed #3498db', outlineOffset: -2 },
    controles: { background: '#eaf4fb', borderRadius: 8, padding: 8, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 },
    controlesFila: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    controlEtiqueta: { fontSize: '0.75rem', fontWeight: 'bold', color: '#34495e' },
    controlDeslizador: { display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 'bold', color: '#34495e' },
    btnControl: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 28, height: 28, padding: '0 7px', background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 6, fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' },
    btnControlActivo: { background: '#2c3e50', color: 'white', borderColor: '#2c3e50' },
    inputTitulo: { flex: 1, minWidth: 160, padding: '6px 10px', border: '2px solid #3498db', borderRadius: 8, fontSize: '1.1em', fontWeight: 'bold', fontFamily: 'inherit', color: '#2c3e50', outline: 'none' },
    textarea: { width: '100%', padding: 10, border: '2px solid #bdc3c7', borderRadius: 8, fontSize: '1em', fontFamily: 'inherit', resize: 'vertical', color: '#2c3e50' },
    tituloBloque: { fontSize: '1.2em', color: '#2c3e50', marginBottom: 10 },
    lineaInfo: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
    chipSector: { padding: '8px 14px', background: '#eafaf1', color: '#1e8449', border: '1px solid #a9dfbf', borderRadius: 18, fontWeight: 'bold', fontSize: '0.95em', cursor: 'pointer' },
    btnEnlace: { background: 'none', border: 'none', color: '#3498db', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8em', padding: 0 },
    filaVia: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid #ecf0f1', color: '#2c3e50', fontSize: '0.92em', cursor: 'pointer' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 460, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
    modalHeader: { background: '#f8f9fa', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1' },
    btnClose: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' },
};
