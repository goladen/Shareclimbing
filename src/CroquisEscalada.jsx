import React, { useState, useRef, useEffect } from 'react';
import {
    Camera, Link as LinkIcon, Plus, MapPin,
    Type, Edit, Info, CheckCircle, Move, ZoomIn, ZoomOut,
    X, ArrowLeft, Image as ImageIcon, MousePointer2, Save,
    Globe, Lock, Layers
} from 'lucide-react';
import { db, auth, storage } from './firebase';
import { collection, doc, addDoc, updateDoc, getDocs, getDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from './contexts/AuthContext';
import LocationPicker from './components/LocationPicker';

const COLORES = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e84393'];

const generarCurvaSuave = (puntos) => {
    if (puntos.length === 0) return "";
    if (puntos.length === 1) return `M ${puntos[0].x},${puntos[0].y}`;
    if (puntos.length === 2) return `M ${puntos[0].x},${puntos[0].y} L ${puntos[1].x},${puntos[1].y}`;
    let path = `M ${puntos[0].x},${puntos[0].y}`;
    for (let i = 0; i < puntos.length - 1; i++) {
        const p0 = puntos[Math.max(0, i - 1)];
        const p1 = puntos[i];
        const p2 = puntos[i + 1];
        const p3 = puntos[Math.min(puntos.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
};

const INFO_CROQUIS_INIT = {
    escuela: '', sector: '', mapsUrl: '', lat: '', lng: '', horarioSol: '',
    mejorEpoca: '', acceso: '', restricciones: '', masInfo: ''
};

export default function CroquisEscalada({ onExit, croquisInicial }) {
    const { usuario, pedirAuth } = useAuth();

    const [imagenUrl, setImagenUrl] = useState(croquisInicial?.imagenUrl || null);
    const [imagenEsArchivo, setImagenEsArchivo] = useState(false);
    const [imgSize, setImgSize] = useState({ w: 800, h: 600 });
    const [vias, setVias] = useState(croquisInicial?.vias || []);
    const [visibilidad, setVisibilidad] = useState(croquisInicial?.visibilidad || 'publico');

    // Detectar si editamos un croquis ajeno
    const croquísId = useRef(croquisInicial?.id || null);
    const propietarioCroquis = croquisInicial?.creadoPor || null;
    const esAjeno = propietarioCroquis && usuario && propietarioCroquis !== usuario.uid;
    const esMio = !propietarioCroquis || (usuario && propietarioCroquis === usuario.uid);

    // Pan & Zoom
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Creación de vía
    const [creando, setCreando] = useState(false);
    const [herramienta, setHerramienta] = useState('PAN');
    const [viaActual, setViaActual] = useState({
        inicio: null, fin: null, intermedios: [], textos: [],
        info: { nombre: '', grado: '', equipador: '', info: '', anio: '' },
        color: COLORES[0]
    });

    const [infoCroquis, setInfoCroquis] = useState(croquisInicial?.infoCroquis || INFO_CROQUIS_INIT);
    const [mostrarModalCroquis, setMostrarModalCroquis] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [progresoSubida, setProgresoSubida] = useState('');
    const [editandoViaIdx, setEditandoViaIdx] = useState(null);
    const [escuelasDisponibles, setEscuelasDisponibles] = useState([]);
    const [sectoresDisponibles, setSectoresDisponibles] = useState([]);
    const [mapsEmbedUrl, setMapsEmbedUrl] = useState('');
    const [mostrarModalInfo, setMostrarModalInfo] = useState(false);
    const [viaVisualizando, setViaVisualizando] = useState(null);
    const [mostrarCapas, setMostrarCapas] = useState(false);
    const [capas, setCapas] = useState(croquisInicial?.capas || []);

    const contenedorRef = useRef(null);

    // Inicializar scale/pan cuando hay imagen desde croquisInicial
    useEffect(() => {
        if (imagenUrl && croquisInicial?.imagenUrl) {
            const img = new Image();
            img.onload = () => {
                setImgSize({ w: img.width, h: img.height });
                const wScale = window.innerWidth / img.width;
                const hScale = (window.innerHeight - 200) / img.height;
                setScale(Math.min(wScale, hScale, 1) * 0.9);
                setPan({ x: 50, y: 50 });
            };
            img.src = imagenUrl;
        }
    }, []);

    const cargarSugerencias = async () => {
        try {
            const snap = await getDocs(collection(db, 'croquis_escalada'));
            const escuelas = new Set();
            const sectores = new Set();
            snap.docs.forEach(d => {
                const info = d.data().infoCroquis;
                if (info?.escuela?.trim()) escuelas.add(info.escuela.trim());
                if (info?.sector?.trim()) sectores.add(info.sector.trim());
            });
            setEscuelasDisponibles([...escuelas].sort());
            setSectoresDisponibles([...sectores].sort());
        } catch (_) {}
    };

    useEffect(() => {
        const timer = setTimeout(() => setMapsEmbedUrl(parsearUrlMaps(infoCroquis.mapsUrl)), 700);
        return () => clearTimeout(timer);
    }, [infoCroquis.mapsUrl]);

    // ─── CARGA DE IMAGEN ───
    const handleCargaArchivo = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => { procesarImagen(ev.target.result); setImagenEsArchivo(true); };
            reader.readAsDataURL(file);
        }
    };

    const procesarImagen = (src) => {
        const img = new Image();
        img.onload = () => {
            setImgSize({ w: img.width, h: img.height });
            const wScale = window.innerWidth / img.width;
            const hScale = (window.innerHeight - 200) / img.height;
            setScale(Math.min(wScale, hScale, 1) * 0.9);
            setPan({ x: 50, y: 50 });
            setImagenUrl(src);
        };
        img.src = src;
    };

    const cargarPorUrl = () => {
        const url = prompt("Introduce la URL pública de la imagen:");
        if (url) { procesarImagen(url); setImagenEsArchivo(false); }
    };

    // ─── FIREBASE: guardar croquis propio ───
    const ejecutarGuardado = async () => {
        setGuardando(true);
        try {
            let urlFinal = imagenEsArchivo ? null : imagenUrl;

            if (imagenEsArchivo && imagenUrl) {
                setProgresoSubida('Subiendo imagen…');
                const uid = auth.currentUser?.uid || 'anonimo';
                const nombreArchivo = `croquis/${uid}/${Date.now()}.jpg`;
                const storageRef = ref(storage, nombreArchivo);
                const res = await fetch(imagenUrl);
                const blob = await res.blob();
                await uploadBytes(storageRef, blob);
                urlFinal = await getDownloadURL(storageRef);
                setImagenEsArchivo(false);
                setImagenUrl(urlFinal);
                setProgresoSubida('');
            }

            const data = {
                infoCroquis,
                imagenUrl: urlFinal,
                vias: vias.map(v => ({
                    id: v.id, inicio: v.inicio, fin: v.fin,
                    intermedios: v.intermedios, textos: v.textos,
                    info: v.info, color: v.color
                })),
                visibilidad,
                creadoPor: auth.currentUser?.uid || 'anonimo',
                updatedAt: serverTimestamp()
            };

            if (croquísId.current) {
                await updateDoc(doc(db, 'croquis_escalada', croquísId.current), data);
            } else {
                data.createdAt = serverTimestamp();
                data.capas = [];
                const docRef = await addDoc(collection(db, 'croquis_escalada'), data);
                croquísId.current = docRef.id;
            }
            alert('Croquis guardado');
        } catch (e) {
            setProgresoSubida('');
            alert('Error al guardar: ' + e.message);
        }
        setGuardando(false);
    };

    // ─── FIREBASE: guardar como capa (croquis ajeno) ───
    const guardarComoCapa = async () => {
        if (!usuario) return;
        setGuardando(true);
        try {
            const capa = {
                vias: vias.map(v => ({
                    id: v.id, inicio: v.inicio, fin: v.fin,
                    intermedios: v.intermedios, textos: v.textos,
                    info: v.info, color: v.color
                })),
                creadorId: usuario.uid,
                creadorNombre: usuario.displayName || usuario.email,
                estado: 'pendiente',
                createdAt: new Date().toISOString()
            };
            await updateDoc(doc(db, 'croquis_escalada', croquísId.current), {
                capas: arrayUnion(capa)
            });
            alert('Cambios enviados al propietario para su revisión.');
        } catch (e) {
            alert('Error: ' + e.message);
        }
        setGuardando(false);
    };

    // ─── ACEPTAR / RECHAZAR CAPA ───
    const gestionarCapa = async (capaIdx, accion) => {
        const nuevasCapas = [...capas];
        if (accion === 'aceptar') {
            const capaData = nuevasCapas[capaIdx];
            nuevasCapas[capaIdx] = { ...capaData, estado: 'aceptado' };
            // Reemplazar vías con las de la capa
            setVias(capaData.vias);
        } else {
            nuevasCapas[capaIdx] = { ...nuevasCapas[capaIdx], estado: 'rechazado' };
        }
        setCapas(nuevasCapas);
        await updateDoc(doc(db, 'croquis_escalada', croquísId.current), { capas: nuevasCapas });
    };

    // ─── GUARDAR (decide flujo según contexto) ───
    const guardarEnFirebase = () => {
        if (!usuario) {
            pedirAuth(() => ejecutarGuardado());
            return;
        }
        if (esAjeno) {
            if (!window.confirm('Al guardar, tus cambios se enviarán al propietario del croquis para que los apruebe. ¿Continuar?')) return;
            guardarComoCapa();
        } else {
            ejecutarGuardado();
        }
    };

    // ─── VISOR ───
    const handleWheel = (e) => {
        e.preventDefault();
        setScale(s => Math.min(Math.max(s * (e.deltaY > 0 ? 0.9 : 1.1), 0.1), 5));
    };

    const screenToSvg = (clientX, clientY) => {
        const rect = contenedorRef.current.getBoundingClientRect();
        return { x: (clientX - rect.left - pan.x) / scale, y: (clientY - rect.top - pan.y) / scale };
    };

    const handlePointerDown = (e) => {
        if (editandoViaIdx !== null) return;
        if (!creando || herramienta === 'PAN') {
            setIsDragging(true);
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        } else {
            const { x, y } = screenToSvg(e.clientX, e.clientY);
            aplicarHerramienta(x, y);
        }
    };

    const handlePointerMove = (e) => {
        if (isDragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handlePointerUp = () => setIsDragging(false);

    // ─── HERRAMIENTAS DE CREACIÓN ───
    const aplicarHerramienta = (x, y) => {
        if (herramienta === 'INICIO') {
            setViaActual(prev => ({ ...prev, inicio: { x, y } }));
        } else if (herramienta === 'FIN') {
            setViaActual(prev => ({ ...prev, fin: { x, y } }));
        } else if (herramienta === 'INTERMEDIO') {
            setViaActual(prev => ({ ...prev, intermedios: [...prev.intermedios, { x, y }] }));
        } else if (herramienta === 'GRADO' || herramienta === 'TEXTO') {
            const txt = prompt(`Introduce el ${herramienta.toLowerCase()}:`);
            if (txt) setViaActual(prev => ({ ...prev, textos: [...prev.textos, { text: txt, x, y, type: herramienta.toLowerCase() }] }));
        }
    };

    const iniciarNuevaVia = () => {
        setEditandoViaIdx(null);
        setCreando(true);
        setHerramienta('INICIO');
        setViaActual({
            inicio: null, fin: null, intermedios: [], textos: [],
            info: { nombre: '', grado: '', equipador: '', info: '', anio: '' },
            color: COLORES[vias.length % COLORES.length]
        });
    };

    const guardarVia = () => {
        if (!viaActual.inicio || !viaActual.fin) { alert("La vía necesita punto de INICIO y FIN."); return; }
        if (!viaActual.info.nombre.trim()) { alert("Dale un nombre a la vía (botón ℹ️)."); return; }
        const nuevasVias = [...vias, { ...viaActual, id: Date.now() }].sort((a, b) => a.inicio.x - b.inicio.x);
        setVias(nuevasVias);
        setCreando(false);
        setHerramienta('PAN');
    };

    // ─── EDICIÓN DE VÍAS ───
    const moverPuntoVia = (viaIdx, tipo, pIdx, x, y) => {
        setVias(prev => {
            const copia = [...prev];
            const via = { ...copia[viaIdx], intermedios: [...copia[viaIdx].intermedios] };
            if (tipo === 'inicio') via.inicio = { x, y };
            else if (tipo === 'fin') via.fin = { x, y };
            else via.intermedios[pIdx] = { x, y };
            copia[viaIdx] = via;
            return copia;
        });
    };

    const eliminarPuntoVia = (viaIdx, tipo, pIdx) => {
        setVias(prev => {
            const copia = [...prev];
            const via = { ...copia[viaIdx], intermedios: [...copia[viaIdx].intermedios] };
            if (tipo === 'intermedio') via.intermedios = via.intermedios.filter((_, i) => i !== pIdx);
            else via[tipo] = null;
            copia[viaIdx] = via;
            return copia;
        });
    };

    const eliminarVia = (idx) => {
        if (!window.confirm('¿Eliminar esta vía?')) return;
        setVias(prev => prev.filter((_, i) => i !== idx));
        if (editandoViaIdx === idx) setEditandoViaIdx(null);
    };

    // ─── RENDER: PANTALLA DE CARGA ───
    if (!imagenUrl) {
        return (
            <div style={st.containerCarga}>
                <div style={st.cardCarga}>
                    <ImageIcon size={60} color="#3498db" style={{ marginBottom: 20 }} />
                    <h1 style={{ color: '#2c3e50', margin: '0 0 10px' }}>Generador de Croquis</h1>
                    <p style={{ color: '#7f8c8d', marginBottom: 30 }}>Añade una foto del sector para empezar.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                        <label style={st.btnCarga}>
                            <Camera size={20} /> Hacer Foto / Galería
                            <input type="file" accept="image/*" onChange={handleCargaArchivo} style={{ display: 'none' }} />
                        </label>
                        <button onClick={cargarPorUrl} style={{ ...st.btnCarga, background: '#f39c12' }}>
                            <LinkIcon size={20} /> Cargar desde URL Pública
                        </button>
                    </div>
                    {onExit && (
                        <button onClick={onExit} style={{ marginTop: 30, background: 'none', border: 'none', color: '#95a5a6', cursor: 'pointer', fontWeight: 'bold' }}>
                            Cancelar y volver
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const intermediosOrdenados = [...viaActual.intermedios].sort((a, b) => {
        const dir = viaActual.inicio && viaActual.fin ? viaActual.fin.y - viaActual.inicio.y : -1;
        return dir < 0 ? b.y - a.y : a.y - b.y;
    });
    const puntosViaActual = viaActual.inicio
        ? [viaActual.inicio, ...intermediosOrdenados, ...(viaActual.fin ? [viaActual.fin] : [])]
        : [];

    const capasPendientes = capas.filter(c => c.estado === 'pendiente');

    // ─── RENDER: EDITOR PRINCIPAL ───
    return (
        <div style={st.appContainer}>

            {/* TOPBAR */}
            <div style={st.topbar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => imagenUrl ? (onExit ? onExit() : setImagenUrl(null)) : null} style={st.btnIcono} title="Volver">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>
                            {infoCroquis.escuela || 'Mi Croquis'}
                        </div>
                        {infoCroquis.sector && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.8rem' }}>{infoCroquis.sector}</div>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => setScale(s => s * 1.2)} style={st.btnIcono}><ZoomIn size={18} /></button>
                    <button onClick={() => setScale(s => s * 0.8)} style={st.btnIcono}><ZoomOut size={18} /></button>
                    <div style={st.divider} />

                    {/* Visibilidad — solo si es croquis propio */}
                    {esMio && (
                        <button
                            onClick={() => setVisibilidad(v => v === 'publico' ? 'privado' : 'publico')}
                            style={{ ...st.btnIcono, background: visibilidad === 'publico' ? 'rgba(46,204,113,0.4)' : 'rgba(231,76,60,0.4)' }}
                            title={visibilidad === 'publico' ? 'Público (click para hacer privado)' : 'Privado (click para hacer público)'}
                        >
                            {visibilidad === 'publico' ? <Globe size={16} /> : <Lock size={16} />}
                            <span style={{ color: 'white', fontSize: '0.75rem', marginLeft: 4 }}>
                                {visibilidad === 'publico' ? 'Público' : 'Privado'}
                            </span>
                        </button>
                    )}

                    {/* Capas pendientes — solo si es mi croquis */}
                    {esMio && capasPendientes.length > 0 && (
                        <button onClick={() => setMostrarCapas(true)} style={{ ...st.btnIcono, background: 'rgba(243,156,18,0.5)', position: 'relative' }}>
                            <Layers size={18} />
                            <span style={{ ...st.badge }}>{capasPendientes.length}</span>
                        </button>
                    )}

                    <button
                        onClick={() => { setMostrarModalCroquis(true); cargarSugerencias(); }}
                        style={{ ...st.btnIcono, background: 'rgba(52,152,219,0.5)' }}
                        title="Información del sector"
                    ><Info size={18} /></button>

                    <button
                        onClick={guardarEnFirebase}
                        style={{ ...st.btnIcono, background: guardando ? 'rgba(46,204,113,0.3)' : 'rgba(46,204,113,0.6)', minWidth: progresoSubida ? 120 : 'auto', fontSize: '0.75rem', gap: 6 }}
                        title={!usuario ? 'Guardar (necesitas registrarte)' : esAjeno ? 'Proponer cambios al propietario' : 'Guardar en la nube'}
                        disabled={guardando}
                    >
                        <Save size={18} />
                        {esAjeno && <span style={{ color: 'white', fontSize: '0.75rem' }}>Proponer</span>}
                        {progresoSubida && <span style={{ color: 'white' }}>{progresoSubida}</span>}
                    </button>

                    <div style={st.divider} />
                    {!creando && editandoViaIdx === null && (
                        <button onClick={iniciarNuevaVia} style={st.btnPrimario}><Plus size={18} /> Nueva Vía</button>
                    )}
                    {creando && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setCreando(false); setHerramienta('PAN'); }} style={st.btnPeligro}>Cancelar</button>
                            <button onClick={guardarVia} style={st.btnExito}><CheckCircle size={18} /> Crear Vía</button>
                        </div>
                    )}
                    {editandoViaIdx !== null && (
                        <button onClick={() => setEditandoViaIdx(null)} style={st.btnExito}><CheckCircle size={18} /> Fin Edición</button>
                    )}
                </div>
            </div>

            {/* Aviso croquis ajeno */}
            {esAjeno && (
                <div style={{ background: '#fff3cd', padding: '8px 16px', fontSize: '0.85rem', color: '#856404', borderBottom: '1px solid #ffc107', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Layers size={16} />
                    Estás editando un croquis de otro usuario. Al guardar, tus cambios se enviarán para aprobación del propietario.
                </div>
            )}

            {/* BARRA HERRAMIENTAS (creando) */}
            {creando && (
                <div style={st.toolsBar}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <ToolBtn h="PAN" act={herramienta} set={setHerramienta} icon={<Move size={16} />} text="Mover" color="#34495e" />
                        <ToolBtn h="INICIO" act={herramienta} set={setHerramienta} icon={<MapPin size={16} />} text="Inicio" color="#e74c3c" />
                        <ToolBtn h="INTERMEDIO" act={herramienta} set={setHerramienta} icon={<MousePointer2 size={16} />} text="P.Intermedio" color="#f39c12" />
                        <ToolBtn h="FIN" act={herramienta} set={setHerramienta} icon={<CheckCircle size={16} />} text="Fin" color="#2ecc71" />
                        <ToolBtn h="GRADO" act={herramienta} set={setHerramienta} icon={<Type size={16} />} text="Grado" color="#9b59b6" />
                        <ToolBtn h="TEXTO" act={herramienta} set={setHerramienta} icon={<Edit size={16} />} text="Texto" color="#3498db" />
                        <div style={{ width: 2, background: '#bdc3c7', margin: '0 5px' }} />
                        <button onClick={() => setMostrarModalInfo(true)} style={{ ...st.btnInfo, border: viaActual.info.nombre ? '2px solid #2ecc71' : '2px solid #e74c3c' }}>
                            <Info size={18} /> Info de la Vía
                        </button>
                    </div>
                    {herramienta !== 'PAN' && (
                        <div style={{ fontSize: '0.85rem', color: '#e74c3c', fontWeight: 'bold', marginTop: 8 }}>
                            Haz clic sobre la imagen para añadir: {herramienta}
                        </div>
                    )}
                </div>
            )}

            {/* BARRA HERRAMIENTAS (editando) */}
            {editandoViaIdx !== null && (
                <div style={{ ...st.toolsBar, background: '#fff3cd', padding: '10px 20px' }}>
                    <div style={{ color: '#856404', fontWeight: 'bold', fontSize: '0.9rem' }}>
                        Editando: <b>{vias[editandoViaIdx]?.info.nombre}</b> — Arrastra los puntos para moverlos · Pulsa × para eliminarlos
                    </div>
                </div>
            )}

            {/* VISOR */}
            <div
                ref={contenedorRef}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{
                    flex: 1, overflow: 'hidden', background: '#ecf0f1', position: 'relative',
                    cursor: (editandoViaIdx !== null || (creando && herramienta === 'PAN'))
                        ? (isDragging ? 'grabbing' : 'grab')
                        : creando ? 'crosshair'
                        : isDragging ? 'grabbing' : 'grab',
                    touchAction: 'none'
                }}
            >
                <div style={{
                    position: 'absolute', transformOrigin: '0 0',
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    width: imgSize.w, height: imgSize.h
                }}>
                    <img src={imagenUrl} alt="Pared" style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />

                    <svg
                        width={imgSize.w} height={imgSize.h}
                        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: (editandoViaIdx !== null || creando) ? 'all' : 'none' }}
                    >
                        {vias.map((via, idx) => {
                            const dir = via.inicio && via.fin ? via.fin.y - via.inicio.y : -1;
                            const interOrd = [...via.intermedios].sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
                            const pts = [via.inicio, ...interOrd, via.fin].filter(Boolean);
                            const isEditing = editandoViaIdx === idx;
                            return (
                                <g key={via.id}>
                                    <path d={generarCurvaSuave(pts)} fill="none" stroke="black" strokeWidth="6" opacity="0.5" />
                                    <path d={generarCurvaSuave(pts)} fill="none" stroke={via.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                                    {via.textos.map((txt, i) => <TextoSvg key={i} txt={txt} color={via.color} />)}
                                    {via.inicio && (
                                        <>
                                            <circle cx={via.inicio.x} cy={via.inicio.y + 20} r="15" fill={via.color} />
                                            <text x={via.inicio.x} y={via.inicio.y + 25} fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">{idx + 1}</text>
                                        </>
                                    )}
                                    {isEditing && (
                                        <>
                                            {via.inicio && (
                                                <PuntoEditable x={via.inicio.x} y={via.inicio.y} color="#e74c3c"
                                                    onMove={(x, y) => moverPuntoVia(idx, 'inicio', null, x, y)}
                                                    onDelete={() => eliminarPuntoVia(idx, 'inicio', null)}
                                                    contenedorRef={contenedorRef} pan={pan} scale={scale} />
                                            )}
                                            {via.intermedios.map((p, pIdx) => (
                                                <PuntoEditable key={pIdx} x={p.x} y={p.y} color="#f39c12"
                                                    onMove={(x, y) => moverPuntoVia(idx, 'intermedio', pIdx, x, y)}
                                                    onDelete={() => eliminarPuntoVia(idx, 'intermedio', pIdx)}
                                                    contenedorRef={contenedorRef} pan={pan} scale={scale} />
                                            ))}
                                            {via.fin && (
                                                <PuntoEditable x={via.fin.x} y={via.fin.y} color="#2ecc71"
                                                    onMove={(x, y) => moverPuntoVia(idx, 'fin', null, x, y)}
                                                    onDelete={() => eliminarPuntoVia(idx, 'fin', null)}
                                                    contenedorRef={contenedorRef} pan={pan} scale={scale} />
                                            )}
                                        </>
                                    )}
                                </g>
                            );
                        })}

                        {creando && (
                            <g>
                                <path d={generarCurvaSuave(puntosViaActual)} fill="none" stroke={viaActual.color} strokeWidth="4" strokeDasharray="8,8" />
                                {viaActual.textos.map((txt, i) => <TextoSvg key={i} txt={txt} color={viaActual.color} />)}
                                {viaActual.inicio && (
                                    <PuntoEditable
                                        x={viaActual.inicio.x} y={viaActual.inicio.y} color="#e74c3c"
                                        onMove={(x, y) => setViaActual(p => ({ ...p, inicio: { x, y } }))}
                                        onDelete={() => setViaActual(p => ({ ...p, inicio: null }))}
                                        contenedorRef={contenedorRef} pan={pan} scale={scale} />
                                )}
                                {viaActual.intermedios.map((p, i) => (
                                    <PuntoEditable key={i} x={p.x} y={p.y} color="#f39c12"
                                        onMove={(x, y) => setViaActual(prev => {
                                            const intermedios = [...prev.intermedios];
                                            intermedios[i] = { x, y };
                                            return { ...prev, intermedios };
                                        })}
                                        onDelete={() => setViaActual(prev => ({
                                            ...prev, intermedios: prev.intermedios.filter((_, idx) => idx !== i)
                                        }))}
                                        contenedorRef={contenedorRef} pan={pan} scale={scale} />
                                ))}
                                {viaActual.fin && (
                                    <PuntoEditable
                                        x={viaActual.fin.x} y={viaActual.fin.y} color="#2ecc71"
                                        onMove={(x, y) => setViaActual(p => ({ ...p, fin: { x, y } }))}
                                        onDelete={() => setViaActual(p => ({ ...p, fin: null }))}
                                        contenedorRef={contenedorRef} pan={pan} scale={scale} />
                                )}
                            </g>
                        )}
                    </svg>
                </div>
            </div>

            {/* PANEL INFERIOR */}
            <div style={st.panelInferior}>
                <h3 style={{ margin: '0 0 12px', color: '#2c3e50', borderBottom: '2px solid #ecf0f1', paddingBottom: 8 }}>
                    {infoCroquis.escuela || 'Croquis'}{infoCroquis.sector ? ` · ${infoCroquis.sector}` : ''}
                    {infoCroquis.mapsUrl && (
                        <a href={infoCroquis.mapsUrl} target="_blank" rel="noreferrer"
                            style={{ marginLeft: 10, fontSize: '0.85rem', color: '#3498db' }}>Ver mapa</a>
                    )}
                </h3>
                {vias.length === 0 ? (
                    <div style={{ color: '#7f8c8d', fontStyle: 'italic', textAlign: 'center', padding: 15 }}>No hay vías. ¡Crea la primera!</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                            <thead>
                                <tr style={{ background: '#f8f9fa', color: '#2c3e50', textAlign: 'left' }}>
                                    <th style={st.th}>Nº</th>
                                    <th style={st.th}>Nombre</th>
                                    <th style={st.th}>Grado</th>
                                    <th style={st.th}>Color</th>
                                    <th style={st.th}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vias.map((v, i) => (
                                    <tr key={v.id} style={{ borderBottom: '1px solid #ecf0f1', background: editandoViaIdx === i ? '#fff9c4' : 'white' }}>
                                        <td style={{ ...st.td, fontWeight: 'bold' }}>{i + 1}</td>
                                        <td style={st.td}>
                                            <button onClick={() => setViaVisualizando({ ...v, num: i + 1 })} style={st.btnLink}>
                                                {v.info.nombre}
                                            </button>
                                        </td>
                                        <td style={{ ...st.td, fontWeight: 'bold', color: '#e74c3c' }}>{v.info.grado || '-'}</td>
                                        <td style={st.td}><div style={{ width: 20, height: 20, borderRadius: '50%', background: v.color }} /></td>
                                        <td style={st.td}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button onClick={() => { setEditandoViaIdx(i); setCreando(false); }} style={st.btnAccion} title="Editar puntos">✏️</button>
                                                <button onClick={() => eliminarVia(i)} style={st.btnAccion} title="Eliminar vía">🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL: Información del Croquis */}
            {mostrarModalCroquis && (
                <div style={st.overlayModal}>
                    <div style={{ ...st.modal, maxWidth: 640 }}>
                        <div style={st.modalHeader}>
                            <h3>Información del Sector</h3>
                            <button onClick={() => setMostrarModalCroquis(false)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={{ ...st.modalBody, maxHeight: '82vh', overflowY: 'auto' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <AutocompleteInput label="Escuela" value={infoCroquis.escuela} onChange={v => setInfoCroquis(p => ({ ...p, escuela: v }))} ph="Ej: Rodellar" opciones={escuelasDisponibles} />
                                <AutocompleteInput label="Sector" value={infoCroquis.sector} onChange={v => setInfoCroquis(p => ({ ...p, sector: v }))} ph="Ej: Surgencia" opciones={sectoresDisponibles} />
                            </div>
                            <div style={{ marginBottom: 15 }}>
                                <label style={st.label}>Ubicación exacta en el mapa</label>
                                <LocationPicker
                                    lat={infoCroquis.lat}
                                    lng={infoCroquis.lng}
                                    onChange={(la, ln) => setInfoCroquis(p => ({ ...p, lat: la, lng: ln }))}
                                />
                                <label style={{ ...st.label, marginTop: 12 }}>Enlace Google Maps (opcional, para compartir)</label>
                                <input value={infoCroquis.mapsUrl} onChange={e => setInfoCroquis(p => ({ ...p, mapsUrl: e.target.value }))}
                                    placeholder="https://maps.app.goo.gl/..." style={st.input} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <InputModal label="Horario sol/sombra" value={infoCroquis.horarioSol} onChange={v => setInfoCroquis(p => ({ ...p, horarioSol: v }))} ph="Ej: Sombra todo el año" />
                                <InputModal label="Mejor época" value={infoCroquis.mejorEpoca} onChange={v => setInfoCroquis(p => ({ ...p, mejorEpoca: v }))} ph="Ej: Marzo - Noviembre" />
                            </div>
                            <div style={{ marginBottom: 15 }}>
                                <label style={st.label}>Acceso (cómo llegar)</label>
                                <textarea value={infoCroquis.acceso} onChange={e => setInfoCroquis(p => ({ ...p, acceso: e.target.value }))}
                                    style={{ ...st.input, height: 68, resize: 'none' }} placeholder="Ej: Desde el pueblo tomar pista forestal 2 km..." />
                            </div>
                            <div style={{ marginBottom: 15 }}>
                                <label style={st.label}>Restricciones</label>
                                <textarea value={infoCroquis.restricciones} onChange={e => setInfoCroquis(p => ({ ...p, restricciones: e.target.value }))}
                                    style={{ ...st.input, height: 56, resize: 'none' }} placeholder="Ej: Cerrado Feb-Jun por nidificación" />
                            </div>
                            <div style={{ marginBottom: 15 }}>
                                <label style={st.label}>Más información</label>
                                <textarea value={infoCroquis.masInfo} onChange={e => setInfoCroquis(p => ({ ...p, masInfo: e.target.value }))}
                                    style={{ ...st.input, height: 72, resize: 'none' }} placeholder="Información adicional del sector..." />
                            </div>
                            <button onClick={() => setMostrarModalCroquis(false)} style={{ ...st.btnPrimario, width: '100%' }}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Info vía en creación */}
            {mostrarModalInfo && (
                <div style={st.overlayModal}>
                    <div style={st.modal}>
                        <div style={st.modalHeader}>
                            <h3>Datos de la Vía</h3>
                            <button onClick={() => setMostrarModalInfo(false)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={st.modalBody}>
                            <InputModal label="Nombre *" value={viaActual.info.nombre} onChange={v => setViaActual(p => ({ ...p, info: { ...p.info, nombre: v } }))} ph="Ej: La Vía Láctea" />
                            <InputModal label="Grado propuesto" value={viaActual.info.grado} onChange={v => setViaActual(p => ({ ...p, info: { ...p.info, grado: v } }))} ph="Ej: 6b+" />
                            <InputModal label="Equipador/a" value={viaActual.info.equipador} onChange={v => setViaActual(p => ({ ...p, info: { ...p.info, equipador: v } }))} ph="Nombre de quien equipó" />
                            <InputModal label="Año" value={viaActual.info.anio} onChange={v => setViaActual(p => ({ ...p, info: { ...p.info, anio: v } }))} type="number" ph="Ej: 2018" />
                            <label style={st.label}>Información adicional</label>
                            <textarea value={viaActual.info.info} onChange={e => setViaActual(p => ({ ...p, info: { ...p.info, info: e.target.value } }))}
                                style={{ ...st.input, height: 80, resize: 'none' }} placeholder="Ej: 10 cintas, paso duro en la 3ª chapa." />
                            <button onClick={() => setMostrarModalInfo(false)} style={{ ...st.btnPrimario, width: '100%', marginTop: 15 }}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Visualizar vía */}
            {viaVisualizando && (
                <div style={st.overlayModal}>
                    <div style={st.modal}>
                        <div style={st.modalHeader}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ background: viaVisualizando.color, color: 'white', width: 25, height: 25, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {viaVisualizando.num}
                                </div>
                                {viaVisualizando.info.nombre}
                            </h3>
                            <button onClick={() => setViaVisualizando(null)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={st.modalBody}>
                            <p><strong>Grado:</strong> <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>{viaVisualizando.info.grado || 'No especificado'}</span></p>
                            <p><strong>Equipador:</strong> {viaVisualizando.info.equipador || 'Desconocido'}</p>
                            <p><strong>Año:</strong> {viaVisualizando.info.anio || '-'}</p>
                            <div style={{ background: '#f8f9fa', padding: 15, borderRadius: 10, marginTop: 15, border: '1px solid #ecf0f1' }}>
                                <strong style={{ color: '#7f8c8d' }}>Información técnica:</strong>
                                <p style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{viaVisualizando.info.info || 'Sin información adicional.'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Capas pendientes */}
            {mostrarCapas && (
                <div style={st.overlayModal}>
                    <div style={{ ...st.modal, maxWidth: 560 }}>
                        <div style={st.modalHeader}>
                            <h3>Cambios propuestos por otros usuarios</h3>
                            <button onClick={() => setMostrarCapas(false)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={{ ...st.modalBody, maxHeight: '70vh', overflowY: 'auto' }}>
                            {capas.map((capa, i) => (
                                <div key={i} style={{ border: '1px solid #ecf0f1', borderRadius: 10, padding: 14, marginBottom: 12, background: capa.estado === 'pendiente' ? '#fff' : capa.estado === 'aceptado' ? '#eafaf1' : '#fdecea' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <div>
                                            <strong>{capa.creadorNombre}</strong>
                                            <span style={{ color: '#7f8c8d', fontSize: '0.8rem', marginLeft: 8 }}>{capa.createdAt?.split('T')[0]}</span>
                                        </div>
                                        <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 'bold', background: capa.estado === 'pendiente' ? '#fef9e7' : capa.estado === 'aceptado' ? '#eafaf1' : '#fdecea', color: capa.estado === 'pendiente' ? '#856404' : capa.estado === 'aceptado' ? '#1e8449' : '#c0392b' }}>
                                            {capa.estado}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>{capa.vias?.length} vías modificadas</p>
                                    {capa.estado === 'pendiente' && (
                                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                            <button onClick={() => gestionarCapa(i, 'aceptar')} style={{ flex: 1, padding: '8px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>
                                                Aceptar
                                            </button>
                                            <button onClick={() => gestionarCapa(i, 'rechazar')} style={{ flex: 1, padding: '8px', background: 'transparent', border: '2px solid #e74c3c', color: '#e74c3c', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>
                                                Rechazar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {capas.length === 0 && <p style={{ color: '#7f8c8d', textAlign: 'center' }}>Sin cambios propuestos.</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── COMPONENTE: Punto editable con drag ───
function PuntoEditable({ x, y, color, onMove, onDelete, contenedorRef, pan, scale }) {
    const [dragging, setDragging] = useState(false);

    const handlePointerDown = (e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
    };

    const handlePointerMove = (e) => {
        if (!dragging) return;
        e.stopPropagation();
        const rect = contenedorRef.current.getBoundingClientRect();
        onMove(
            (e.clientX - rect.left - pan.x) / scale,
            (e.clientY - rect.top - pan.y) / scale
        );
    };

    const handlePointerUp = (e) => {
        e.stopPropagation();
        setDragging(false);
    };

    return (
        <g>
            <circle cx={x} cy={y} r={dragging ? 14 : 10}
                fill={color} fillOpacity={0.85} stroke="white" strokeWidth="2"
                style={{ cursor: 'grab' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp} />
            <g onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ cursor: 'pointer' }}>
                <circle cx={x + 12} cy={y - 12} r={8} fill="#e74c3c" />
                <text x={x + 12} y={y - 8} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">×</text>
            </g>
        </g>
    );
}

function parsearUrlMaps(entrada) {
    if (!entrada?.trim()) return '';
    const s = entrada.trim();
    const coordsMatch = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordsMatch) return `https://maps.google.com/maps?q=${coordsMatch[1]},${coordsMatch[2]}&output=embed&z=15`;
    const qMatch = s.match(/[?&]q=([^&]+)/);
    if (qMatch) return `https://maps.google.com/maps?q=${qMatch[1]}&output=embed`;
    const placeMatch = s.match(/place\/([^/@?]+)/);
    if (placeMatch) return `https://maps.google.com/maps?q=${placeMatch[1]}&output=embed`;
    if (!s.startsWith('http')) return `https://maps.google.com/maps?q=${encodeURIComponent(s)}&output=embed`;
    return `https://maps.google.com/maps?q=${encodeURIComponent(s)}&output=embed`;
}

function AutocompleteInput({ label, value, onChange, ph, opciones }) {
    const [abierto, setAbierto] = useState(false);
    const filtradas = opciones.filter(o =>
        o.toLowerCase().includes(value.toLowerCase()) && o.toLowerCase() !== value.toLowerCase()
    );
    return (
        <div style={{ marginBottom: 15, position: 'relative' }}>
            <label style={st.label}>{label}</label>
            <input value={value} onChange={e => onChange(e.target.value)}
                onFocus={() => setAbierto(true)}
                onBlur={() => setTimeout(() => setAbierto(false), 150)}
                placeholder={ph}
                style={{ ...st.input, borderColor: abierto && filtradas.length > 0 ? '#3498db' : '#bdc3c7', borderBottomLeftRadius: abierto && filtradas.length > 0 ? 0 : 8, borderBottomRightRadius: abierto && filtradas.length > 0 ? 0 : 8 }} />
            {abierto && filtradas.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '2px solid #3498db', borderTop: 'none', borderRadius: '0 0 8px 8px', boxShadow: '0 6px 16px rgba(0,0,0,0.15)', maxHeight: 160, overflowY: 'auto' }}>
                    {filtradas.map((o, i) => (
                        <div key={i} onMouseDown={() => { onChange(o); setAbierto(false); }}
                            style={{ padding: '9px 12px', cursor: 'pointer', fontSize: '0.95rem', borderBottom: i < filtradas.length - 1 ? '1px solid #f0f0f0' : 'none' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#eaf4ff'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            {o}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const ToolBtn = ({ h, act, set, icon, text, color }) => (
    <button onClick={() => set(h)} style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8,
        fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer',
        background: act === h ? color : 'white', color: act === h ? 'white' : color, border: `2px solid ${color}`
    }}>{icon} {text}</button>
);

const TextoSvg = ({ txt, color }) => {
    const isGrado = txt.type === 'grado';
    return (
        <g transform={`translate(${txt.x}, ${txt.y})`}>
            {isGrado ? (
                <><rect x="-20" y="-12" width="40" height="24" rx="4" fill="white" stroke={color} strokeWidth="2" />
                    <text x="0" y="4" fill={color} fontSize="14" fontWeight="bold" textAnchor="middle">{txt.text}</text></>
            ) : (
                <><text x="0" y="0" fill="white" stroke="black" strokeWidth="3" fontSize="18" fontWeight="bold" paintOrder="stroke">{txt.text}</text>
                    <text x="0" y="0" fill="white" fontSize="18" fontWeight="bold">{txt.text}</text></>
            )}
        </g>
    );
};

const InputModal = ({ label, value, onChange, ph, type = "text" }) => (
    <div style={{ marginBottom: 15 }}>
        <label style={st.label}>{label}</label>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={ph} style={st.input} />
    </div>
);

const st = {
    containerCarga: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f8', padding: 20 },
    cardCarga: { background: 'white', padding: 40, borderRadius: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: 450, width: '100%' },
    btnCarga: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 15, background: '#3498db', color: 'white', borderRadius: 12, cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', border: 'none', width: '100%', boxSizing: 'border-box' },
    appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#1e272e', fontFamily: "'Segoe UI', Tahoma, sans-serif" },
    topbar: { background: '#2c3e50', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, zIndex: 10, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' },
    toolsBar: { background: '#ecf0f1', padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
    panelInferior: { background: 'white', padding: 15, maxHeight: '30vh', overflowY: 'auto', zIndex: 10, boxShadow: '0 -4px 10px rgba(0,0,0,0.1)' },
    divider: { width: 1, height: 30, background: 'rgba(255,255,255,0.2)', margin: '0 4px' },
    btnIcono: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: 10, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    btnPrimario: { background: '#3498db', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
    btnExito: { background: '#2ecc71', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
    btnPeligro: { background: 'transparent', border: '2px solid #e74c3c', color: '#e74c3c', padding: '8px 18px', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
    btnInfo: { background: 'white', color: '#2c3e50', padding: '8px 15px', borderRadius: 8, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' },
    btnLink: { background: 'none', border: 'none', color: '#3498db', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: '1rem' },
    btnAccion: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 6px', borderRadius: 4 },
    th: { padding: '10px 12px', borderBottom: '2px solid #bdc3c7' },
    td: { padding: '10px 12px' },
    overlayModal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 500, borderRadius: 15, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
    modalHeader: { background: '#f8f9fa', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1' },
    modalBody: { padding: 25 },
    btnClose: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' },
    label: { display: 'block', fontWeight: 'bold', color: '#34495e', marginBottom: 5, fontSize: '0.9rem' },
    input: { width: '100%', padding: 12, borderRadius: 8, border: '2px solid #bdc3c7', boxSizing: 'border-box', fontSize: '1rem', outline: 'none' },
    badge: { position: 'absolute', top: -6, right: -6, background: '#e74c3c', color: 'white', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold' },
};
