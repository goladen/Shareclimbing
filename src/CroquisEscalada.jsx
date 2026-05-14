import React, { useState, useRef, useEffect } from 'react';
import {
    Camera, Link as LinkIcon, Plus, MapPin,
    Type, Edit, Info, CheckCircle, Move, ZoomIn, ZoomOut,
    X, ArrowLeft, Image as ImageIcon, MousePointer2, Save,
    Globe, Lock, Layers, Square, Circle, AlignLeft, Printer
} from 'lucide-react';
import ModalImpresion from './components/ModalImpresion';
import { db, auth } from './firebase';
import { collection, doc, addDoc, updateDoc, getDocs, getDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { useAuth } from './contexts/AuthContext';
import LocationPicker from './components/LocationPicker';
import { procesarImagenParaSubir, subirACloudinary, formatearMB, MAX_MB } from './utils/imagen';

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

    // ─── MULTI-FOTO (varias fotos por sector) ───
    const [fotos, setFotos] = useState(() => {
        if (croquisInicial?.fotos?.length > 0) {
            return croquisInicial.fotos.map(f => ({ ...f, imagenEsArchivo: false, imagenFile: null }));
        }
        return [{ id: 'f0', imagenUrl: croquisInicial?.imagenUrl || null, imagenEsArchivo: false, imagenFile: null, vias: croquisInicial?.vias || [], formas: croquisInicial?.formas || [] }];
    });
    const [fotoIdx, setFotoIdx] = useState(0);

    // Valores derivados de la foto activa
    const foto = fotos[fotoIdx] || { imagenUrl: null, imagenEsArchivo: false, imagenFile: null, vias: [], formas: [] };
    const imagenUrl = foto.imagenUrl;
    const imagenEsArchivo = foto.imagenEsArchivo;
    const imagenFile = foto.imagenFile;
    const vias = foto.vias || [];

    // Setters que actualizan solo la foto activa
    const setImagenUrl = (v) => setFotos(fs => fs.map((f, i) => i === fotoIdx ? { ...f, imagenUrl: v } : f));
    const setImagenEsArchivo = (v) => setFotos(fs => fs.map((f, i) => i === fotoIdx ? { ...f, imagenEsArchivo: v } : f));
    const setImagenFile = (v) => setFotos(fs => fs.map((f, i) => i === fotoIdx ? { ...f, imagenFile: v } : f));
    const setVias = (fn) => setFotos(fs => fs.map((f, i) => i === fotoIdx ? { ...f, vias: typeof fn === 'function' ? fn(f.vias || []) : fn } : f));

    const [imgSize, setImgSize] = useState({ w: 800, h: 600 });
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
        color: COLORES[0], grosor: 4
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
    const [modalGradoPos, setModalGradoPos] = useState(null); // {x,y} al clicar con tool GRADO
    const [gradoTemp, setGradoTemp] = useState('');
    const [mostrarCapas, setMostrarCapas] = useState(false);
    const [capas, setCapas] = useState(croquisInicial?.capas || []);

    // Formas (rectángulo, elipse, texto libre) — derivadas de la foto activa
    const formas = foto.formas || [];
    const setFormas = (fn) => setFotos(fs => fs.map((f, i) => i === fotoIdx ? { ...f, formas: typeof fn === 'function' ? fn(f.formas || []) : fn } : f));

    const [herramientaForma, setHerramientaForma] = useState(null); // 'RECT' | 'ELIPSE' | 'TEXTO_LIBRE'
    const [dibujando, setDibujando] = useState(null); // {x,y,w,h}
    const dibujandoStart = useRef(null);
    const [colorForma, setColorForma] = useState('#e74c3c');
    const [grosorForma, setGrosorForma] = useState(2);

    // Texto libre en posición
    const [textoLibrePos, setTextoLibrePos] = useState(null);
    const [textoLibreValor, setTextoLibreValor] = useState('');

    // Texto de via (reemplaza prompt())
    const [textoModalPos, setTextoModalPos] = useState(null);
    const [textoModalValor, setTextoModalValor] = useState('');

    // Editar info de via existente
    const [editandoInfoViaIdx, setEditandoInfoViaIdx] = useState(null);

    // Impresión
    const [mostrarImpresion, setMostrarImpresion] = useState(false);

    const contenedorRef = useRef(null);

    // Actualizar escala/pan al cambiar de foto
    useEffect(() => {
        const url = fotos[fotoIdx]?.imagenUrl;
        if (!url) { setImgSize({ w: 800, h: 600 }); return; }
        const img = new Image();
        img.onload = () => {
            setImgSize({ w: img.width, h: img.height });
            const wScale = window.innerWidth / img.width;
            const hScale = (window.innerHeight - 200) / img.height;
            setScale(Math.min(wScale, hScale, 1) * 0.9);
            setPan({ x: 50, y: 50 });
        };
        img.src = url;
    }, [fotoIdx]); // eslint-disable-line

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
        if (!file) return;
        const mb = file.size / (1024 * 1024);
        if (mb > MAX_MB) {
            alert(`La imagen pesa ${formatearMB(file.size)} y supera el límite de ${MAX_MB} MB.\nUsa una foto de menor resolución.`);
            e.target.value = '';
            return;
        }
        setImagenFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => { procesarImagen(ev.target.result); setImagenEsArchivo(true); };
        reader.readAsDataURL(file);
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

    // ─── FIREBASE: guardar croquis propio (multi-foto) ───
    const ejecutarGuardado = async () => {
        setGuardando(true);
        try {
            // Subir fotos locales a Cloudinary
            const fotasGuardadas = [];
            const fotosActuales = [...fotos]; // snapshot
            for (let i = 0; i < fotosActuales.length; i++) {
                const f = fotosActuales[i];
                if (!f.imagenUrl) continue;
                let urlFinal = f.imagenEsArchivo ? null : f.imagenUrl;
                if (f.imagenEsArchivo && f.imagenUrl) {
                    setProgresoSubida(`Subiendo foto ${i + 1} de ${fotosActuales.length}…`);
                    const fileParaSubir = f.imagenFile || (() => {
                        const arr = f.imagenUrl.split(',');
                        const mime = arr[0].match(/:(.*?);/)[1];
                        const bstr = atob(arr[1]);
                        const u8arr = new Uint8Array(bstr.length);
                        for (let j = 0; j < bstr.length; j++) u8arr[j] = bstr.charCodeAt(j);
                        return new File([u8arr], 'croquis.jpg', { type: mime });
                    })();
                    const resultado = await procesarImagenParaSubir(fileParaSubir, setProgresoSubida);
                    if (resultado.error) { alert(resultado.error); setGuardando(false); setProgresoSubida(''); return; }
                    urlFinal = await subirACloudinary(resultado.blob, setProgresoSubida);
                    setFotos(prev => prev.map((pf, pi) => pi === i ? { ...pf, imagenUrl: urlFinal, imagenEsArchivo: false, imagenFile: null } : pf));
                }
                fotasGuardadas.push({
                    id: f.id || `f${i}`,
                    imagenUrl: urlFinal,
                    vias: (f.vias || []).map(v => ({ id: v.id, inicio: v.inicio, fin: v.fin, intermedios: v.intermedios, textos: v.textos, info: v.info, color: v.color, grosor: v.grosor || 4 })),
                    formas: f.formas || []
                });
            }
            setProgresoSubida('');

            const data = {
                infoCroquis,
                fotos: fotasGuardadas,
                imagenUrl: fotasGuardadas[0]?.imagenUrl || null,
                vias: fotasGuardadas[0]?.vias || [],
                formas: fotasGuardadas[0]?.formas || [],
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

                // Auto-crear escuela si el nombre no existe
                const escuelaNombre = infoCroquis.escuela?.trim();
                if (escuelaNombre && auth.currentUser) {
                    const escSnap = await getDocs(collection(db, 'escuelas'));
                    const existe = escSnap.docs.some(d => d.data().nombre?.toLowerCase() === escuelaNombre.toLowerCase());
                    if (!existe) {
                        await addDoc(collection(db, 'escuelas'), {
                            nombre: escuelaNombre,
                            descripcion: '',
                            lat: infoCroquis.lat ? parseFloat(infoCroquis.lat) : null,
                            lng: infoCroquis.lng ? parseFloat(infoCroquis.lng) : null,
                            creadoPor: auth.currentUser.uid,
                            createdAt: serverTimestamp(),
                        });
                    }
                }
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

    // ─── NAVEGACIÓN ENTRE FOTOS ───
    const cambiarFoto = (newIdx) => {
        if (creando) { setCreando(false); setHerramienta('PAN'); }
        setEditandoViaIdx(null);
        setEditandoInfoViaIdx(null);
        setFotoIdx(newIdx);
    };

    const agregarFoto = () => {
        const nuevaId = `f${Date.now()}`;
        setFotos(prev => [...prev, { id: nuevaId, imagenUrl: null, imagenEsArchivo: false, imagenFile: null, vias: [], formas: [] }]);
        cambiarFoto(fotos.length); // navegar a la nueva (índice = longitud actual antes de añadir)
    };

    const eliminarFotoActual = () => {
        if (fotos.length === 1) { alert('Debe haber al menos una foto.'); return; }
        if (!window.confirm('¿Eliminar esta foto y sus vías?')) return;
        setFotos(prev => prev.filter((_, i) => i !== fotoIdx));
        setFotoIdx(prev => Math.max(0, prev - 1));
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

        // Herramientas de forma
        if (herramientaForma === 'TEXTO_LIBRE') {
            const { x, y } = screenToSvg(e.clientX, e.clientY);
            setTextoLibrePos({ x, y });
            setTextoLibreValor('');
            return;
        }
        if (herramientaForma === 'RECT' || herramientaForma === 'ELIPSE') {
            const { x, y } = screenToSvg(e.clientX, e.clientY);
            dibujandoStart.current = { x, y };
            setDibujando({ x, y, w: 0, h: 0 });
            return;
        }

        if (!creando || herramienta === 'PAN') {
            setIsDragging(true);
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        } else {
            const { x, y } = screenToSvg(e.clientX, e.clientY);
            aplicarHerramienta(x, y);
        }
    };

    const handlePointerMove = (e) => {
        if (dibujando && dibujandoStart.current) {
            const { x, y } = screenToSvg(e.clientX, e.clientY);
            const sx = dibujandoStart.current.x;
            const sy = dibujandoStart.current.y;
            setDibujando({ x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) });
            return;
        }
        if (isDragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handlePointerUp = () => {
        if (dibujando && dibujandoStart.current && (dibujando.w > 4 || dibujando.h > 4)) {
            setFormas(prev => [...prev, {
                id: Date.now(), tipo: herramientaForma,
                x: dibujando.x, y: dibujando.y, w: dibujando.w, h: dibujando.h,
                color: colorForma, grosor: grosorForma
            }]);
        }
        setDibujando(null);
        dibujandoStart.current = null;
        setIsDragging(false);
    };

    // ─── HERRAMIENTAS DE CREACIÓN ───
    const aplicarHerramienta = (x, y) => {
        if (herramienta === 'INICIO') {
            setViaActual(prev => ({ ...prev, inicio: { x, y } }));
        } else if (herramienta === 'FIN') {
            setViaActual(prev => ({ ...prev, fin: { x, y } }));
        } else if (herramienta === 'INTERMEDIO') {
            setViaActual(prev => ({ ...prev, intermedios: [...prev.intermedios, { x, y }] }));
        } else if (herramienta === 'GRADO') {
            setGradoTemp(viaActual.info.grado || '');
            setModalGradoPos({ x, y });
        } else if (herramienta === 'TEXTO') {
            setTextoModalPos({ x, y });
            setTextoModalValor('');
        }
    };

    const iniciarNuevaVia = () => {
        setEditandoViaIdx(null);
        setCreando(true);
        setHerramienta('INICIO');
        setViaActual({
            inicio: null, fin: null, intermedios: [], textos: [],
            info: { nombre: '', grado: '', equipador: '', info: '', anio: '' },
            color: COLORES[vias.length % COLORES.length], grosor: 4
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

    // ─── RENDER: PANTALLA DE CARGA (foto vacía) ───
    if (!imagenUrl) {
        return (
            <div style={st.containerCarga}>
                <div style={st.cardCarga}>
                    <ImageIcon size={60} color="#3498db" style={{ marginBottom: 20 }} />
                    <h1 style={{ color: '#2c3e50', margin: '0 0 6px' }}>
                        {fotos.length > 1 ? `Foto ${fotoIdx + 1} de ${fotos.length}` : 'Generador de Croquis'}
                    </h1>
                    <p style={{ color: '#7f8c8d', marginBottom: 24 }}>
                        {fotos.length > 1 ? 'Esta foto está vacía. Añade una imagen.' : 'Añade una foto del sector para empezar.'}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                        <label style={st.btnCarga}>
                            <Camera size={20} /> Hacer Foto / Galería
                            <input type="file" accept="image/*" onChange={handleCargaArchivo} style={{ display: 'none' }} />
                        </label>
                        <button onClick={cargarPorUrl} style={{ ...st.btnCarga, background: '#f39c12' }}>
                            <LinkIcon size={20} /> Cargar desde URL Pública
                        </button>
                    </div>
                    {fotos.length > 1 && (
                        <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'center' }}>
                            <button onClick={() => cambiarFoto(fotoIdx - 1)} disabled={fotoIdx === 0}
                                style={{ padding: '8px 20px', borderRadius: 8, border: '2px solid #bdc3c7', background: 'white', cursor: 'pointer', fontWeight: 'bold' }}>◀ Anterior</button>
                            <button onClick={() => cambiarFoto(fotoIdx + 1)} disabled={fotoIdx === fotos.length - 1}
                                style={{ padding: '8px 20px', borderRadius: 8, border: '2px solid #bdc3c7', background: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Siguiente ▶</button>
                        </div>
                    )}
                    {onExit && (
                        <button onClick={onExit} style={{ marginTop: 20, background: 'none', border: 'none', color: '#95a5a6', cursor: 'pointer', fontWeight: 'bold' }}>
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
                    <button onClick={() => setMostrarImpresion(true)} style={st.btnIcono} title="Imprimir / Exportar PNG">
                        <Printer size={18} />
                    </button>
                    <div style={st.divider} />

                    {/* Navegación multi-foto */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 8px' }}>
                        <button onClick={() => cambiarFoto(fotoIdx - 1)} disabled={fotoIdx === 0}
                            style={{ ...st.btnIcono, padding: '4px 8px', opacity: fotoIdx === 0 ? 0.4 : 1 }}>◀</button>
                        <span style={{ color: 'white', fontSize: '0.82rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                            Foto {fotoIdx + 1}/{fotos.length}
                        </span>
                        <button onClick={() => cambiarFoto(fotoIdx + 1)} disabled={fotoIdx === fotos.length - 1}
                            style={{ ...st.btnIcono, padding: '4px 8px', opacity: fotoIdx === fotos.length - 1 ? 0.4 : 1 }}>▶</button>
                        <button onClick={agregarFoto} title="Añadir otra foto"
                            style={{ ...st.btnIcono, background: 'rgba(46,204,113,0.5)', padding: '4px 10px', fontSize: '0.8rem' }}>
                            <Plus size={14} /> Foto
                        </button>
                        {fotos.length > 1 && (
                            <button onClick={eliminarFotoActual} title="Eliminar esta foto"
                                style={{ ...st.btnIcono, background: 'rgba(231,76,60,0.4)', padding: '4px 8px' }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
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
                    {/* Paleta de colores + grosor */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.78rem', color: '#7f8c8d', fontWeight: 'bold' }}>Color:</span>
                            {COLORES.map(c => (
                                <div key={c} onClick={() => setViaActual(p => ({ ...p, color: c }))}
                                    style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: viaActual.color === c ? '3px solid #2c3e50' : '2px solid white', boxShadow: viaActual.color === c ? '0 0 0 2px #2c3e50' : '0 1px 4px rgba(0,0,0,0.2)', transform: viaActual.color === c ? 'scale(1.25)' : 'scale(1)' }} />
                            ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.78rem', color: '#7f8c8d', fontWeight: 'bold' }}>Grosor:</span>
                            <input type="range" min="1" max="14" value={viaActual.grosor || 4}
                                onChange={e => setViaActual(p => ({ ...p, grosor: parseInt(e.target.value) }))}
                                style={{ width: 90, accentColor: viaActual.color }} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#2c3e50', minWidth: 18 }}>{viaActual.grosor || 4}</span>
                        </div>
                    </div>
                    {herramienta !== 'PAN' && (
                        <div style={{ fontSize: '0.85rem', color: '#e74c3c', fontWeight: 'bold', marginTop: 6 }}>
                            Clic en la imagen para añadir: {herramienta}
                        </div>
                    )}
                </div>
            )}

            {/* BARRA HERRAMIENTAS DE FORMAS (siempre visible) */}
            {!creando && editandoViaIdx === null && (
                <div style={{ ...st.toolsBar, background: '#f0f4f8', padding: '8px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#7f8c8d' }}>Anotaciones:</span>
                        {[
                            { h: 'RECT', icon: <Square size={15} />, label: 'Rect.' },
                            { h: 'ELIPSE', icon: <Circle size={15} />, label: 'Elipse' },
                            { h: 'TEXTO_LIBRE', icon: <AlignLeft size={15} />, label: 'Texto' },
                        ].map(({ h, icon, label }) => (
                            <button key={h}
                                onClick={() => setHerramientaForma(prev => prev === h ? null : h)}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 7, fontWeight: 'bold', fontSize: '0.82rem', cursor: 'pointer', background: herramientaForma === h ? '#2c3e50' : 'white', color: herramientaForma === h ? 'white' : '#2c3e50', border: '2px solid #2c3e50' }}>
                                {icon} {label}
                            </button>
                        ))}
                        <div style={{ width: 1, height: 24, background: '#bdc3c7', margin: '0 4px' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#7f8c8d' }}>Color:</span>
                        {['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#2c3e50'].map(c => (
                            <div key={c} onClick={() => setColorForma(c)}
                                style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', border: colorForma === c ? '3px solid #2c3e50' : '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transform: colorForma === c ? 'scale(1.25)' : 'scale(1)' }} />
                        ))}
                        <input type="range" min="1" max="8" value={grosorForma}
                            onChange={e => setGrosorForma(parseInt(e.target.value))}
                            style={{ width: 70, accentColor: colorForma }} title={`Grosor: ${grosorForma}`} />
                        {formas.length > 0 && (
                            <button onClick={() => setFormas(prev => prev.slice(0, -1))}
                                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e74c3c', color: '#e74c3c', background: 'white', cursor: 'pointer', fontSize: '0.78rem' }}>
                                ↩ Deshacer última
                            </button>
                        )}
                        {herramientaForma && (
                            <span style={{ fontSize: '0.82rem', color: '#e74c3c', fontWeight: 'bold' }}>
                                Clic y arrastra sobre la imagen ({herramientaForma === 'TEXTO_LIBRE' ? 'clic para texto' : herramientaForma.toLowerCase()})
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* BARRA HERRAMIENTAS (editando) */}
            {editandoViaIdx !== null && (
                <div style={{ ...st.toolsBar, background: '#fff3cd', padding: '10px 20px' }}>
                    <div style={{ color: '#856404', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: 8 }}>
                        Editando: <b>{vias[editandoViaIdx]?.info.nombre}</b> — Arrastra los puntos · Pulsa × para eliminarlos
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#856404' }}>Grosor:</span>
                        <input type="range" min="1" max="14"
                            value={vias[editandoViaIdx]?.grosor || 4}
                            onChange={e => {
                                const g = parseInt(e.target.value);
                                setVias(prev => {
                                    const copia = [...prev];
                                    copia[editandoViaIdx] = { ...copia[editandoViaIdx], grosor: g };
                                    return copia;
                                });
                            }}
                            style={{ width: 100, accentColor: vias[editandoViaIdx]?.color }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 'bold', minWidth: 18, color: '#856404' }}>{vias[editandoViaIdx]?.grosor || 4}</span>
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
                        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: (editandoViaIdx !== null || creando || herramientaForma) ? 'all' : 'none' }}
                    >
                        {vias.map((via, idx) => {
                            const dir = via.inicio && via.fin ? via.fin.y - via.inicio.y : -1;
                            const interOrd = [...via.intermedios].sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
                            const pts = [via.inicio, ...interOrd, via.fin].filter(Boolean);
                            const isEditing = editandoViaIdx === idx;
                            return (
                                <g key={via.id}>
                                    <path d={generarCurvaSuave(pts)} fill="none" stroke="black" strokeWidth={(via.grosor || 4) + 2} opacity="0.4" />
                                    <path d={generarCurvaSuave(pts)} fill="none" stroke={via.color} strokeWidth={via.grosor || 4} strokeLinecap="round" strokeLinejoin="round" />
                                    {via.textos.map((txt, tIdx) => isEditing
                                ? <TextoEditable key={tIdx} txt={txt} color={via.color}
                                    onMove={(nx, ny) => setVias(prev => {
                                        const c = [...prev];
                                        const textos = [...c[idx].textos];
                                        textos[tIdx] = { ...textos[tIdx], x: nx, y: ny };
                                        c[idx] = { ...c[idx], textos };
                                        return c;
                                    })}
                                    onDelete={() => setVias(prev => {
                                        const c = [...prev];
                                        c[idx] = { ...c[idx], textos: c[idx].textos.filter((_, i) => i !== tIdx) };
                                        return c;
                                    })}
                                    contenedorRef={contenedorRef} pan={pan} scale={scale} />
                                : <TextoSvg key={tIdx} txt={txt} color={via.color} />
                            )}
                                    {via.inicio && (
                                        <>
                                            <circle cx={via.inicio.x} cy={via.inicio.y + 20} r="15" fill={via.color} />
                                            <text x={via.inicio.x} y={via.inicio.y + 25} fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">{idx + 1}</text>
                                        </>
                                    )}
                                    {via.fin && (
                                        <>
                                            <circle cx={via.fin.x} cy={via.fin.y} r="18" fill="none" stroke={via.color} strokeWidth="4" opacity="0.6" />
                                            <circle cx={via.fin.x} cy={via.fin.y} r="11" fill={via.color} stroke="white" strokeWidth="2.5" />
                                            <text x={via.fin.x} y={via.fin.y + 5} fill="white" fontSize="13" fontWeight="bold" textAnchor="middle">✓</text>
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

                        {/* Formas (rect, elipse, texto libre) */}
                        {formas.map(f => (
                            <g key={f.id}>
                                {f.tipo === 'RECT' && <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="none" stroke={f.color} strokeWidth={f.grosor} />}
                                {f.tipo === 'ELIPSE' && <ellipse cx={f.x + f.w/2} cy={f.y + f.h/2} rx={f.w/2} ry={f.h/2} fill="none" stroke={f.color} strokeWidth={f.grosor} />}
                                {f.tipo === 'TEXTO_LIBRE' && (
                                    <text x={f.x} y={f.y} fill={f.color} fontSize={f.fontSize || 20} fontWeight="bold"
                                        stroke="black" strokeWidth="2" paintOrder="stroke">{f.text}</text>
                                )}
                            </g>
                        ))}

                        {/* Preview forma en curso */}
                        {dibujando && herramientaForma === 'RECT' && (
                            <rect x={dibujando.x} y={dibujando.y} width={dibujando.w} height={dibujando.h}
                                fill="none" stroke={colorForma} strokeWidth={grosorForma} strokeDasharray="6,3" />
                        )}
                        {dibujando && herramientaForma === 'ELIPSE' && (
                            <ellipse cx={dibujando.x + dibujando.w/2} cy={dibujando.y + dibujando.h/2}
                                rx={dibujando.w/2} ry={dibujando.h/2}
                                fill="none" stroke={colorForma} strokeWidth={grosorForma} strokeDasharray="6,3" />
                        )}

                        {creando && (
                            <g>
                                <path d={generarCurvaSuave(puntosViaActual)} fill="none" stroke={viaActual.color} strokeWidth={viaActual.grosor || 4} strokeDasharray="8,8" />
                                {viaActual.textos.map((txt, tIdx) => (
                                    <TextoEditable key={tIdx} txt={txt} color={viaActual.color}
                                        onMove={(nx, ny) => setViaActual(prev => {
                                            const textos = [...prev.textos];
                                            textos[tIdx] = { ...textos[tIdx], x: nx, y: ny };
                                            return { ...prev, textos };
                                        })}
                                        onDelete={() => setViaActual(prev => ({
                                            ...prev, textos: prev.textos.filter((_, i) => i !== tIdx)
                                        }))}
                                        contenedorRef={contenedorRef} pan={pan} scale={scale} />
                                ))}
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
                                    <>
                                        <circle cx={viaActual.fin.x} cy={viaActual.fin.y} r="20" fill="none" stroke={viaActual.color} strokeWidth="3" strokeDasharray="4,3" opacity="0.7" />
                                        <PuntoEditable
                                            x={viaActual.fin.x} y={viaActual.fin.y} color="#2ecc71"
                                            onMove={(x, y) => setViaActual(p => ({ ...p, fin: { x, y } }))}
                                            onDelete={() => setViaActual(p => ({ ...p, fin: null }))}
                                            contenedorRef={contenedorRef} pan={pan} scale={scale} />
                                    </>
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
                                                <button onClick={() => { setEditandoInfoViaIdx(i); }} style={st.btnAccion} title="Editar información">ℹ️</button>
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
                                <div>
                                    <AutocompleteInput label="Escuela" value={infoCroquis.escuela} onChange={v => setInfoCroquis(p => ({ ...p, escuela: v }))} ph="Ej: Rodellar" opciones={escuelasDisponibles} />
                                    {(() => {
                                        const inp = infoCroquis.escuela?.toLowerCase().trim();
                                        const sugerida = inp?.length >= 3 ? escuelasDisponibles.find(e => e.toLowerCase() !== inp && e.toLowerCase().includes(inp)) : null;
                                        return sugerida ? (
                                            <div style={{ background: '#eaf4fb', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem', color: '#2980b9', display: 'flex', alignItems: 'center', gap: 8, marginTop: -8 }}>
                                                ¿Te refieres a <strong>{sugerida}</strong>?
                                                <button onClick={() => setInfoCroquis(p => ({ ...p, escuela: sugerida }))}
                                                    style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: 6, padding: '2px 10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.82rem' }}>Sí</button>
                                            </div>
                                        ) : null;
                                    })()}
                                </div>
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
                            <div style={{ marginBottom: 15 }}>
                                <label style={st.label}>Grado propuesto</label>
                                <GradeSelector value={viaActual.info.grado} onChange={v => setViaActual(p => ({
                                    ...p,
                                    info: { ...p.info, grado: v },
                                    textos: p.textos.map(t => t.type === 'grado' ? { ...t, text: v } : t)
                                }))} />
                            </div>
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

            {/* MODAL: Selección de grado (herramienta GRADO) */}
            {modalGradoPos && (
                <div style={st.overlayModal}>
                    <div style={{ ...st.modal, maxWidth: 420 }}>
                        <div style={st.modalHeader}>
                            <h3>Seleccionar grado</h3>
                            <button onClick={() => setModalGradoPos(null)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={st.modalBody}>
                            <GradeSelector value={gradoTemp} onChange={setGradoTemp} />
                            <button
                                onClick={() => {
                                    if (gradoTemp) {
                                        setViaActual(prev => ({
                                            ...prev,
                                            info: { ...prev.info, grado: gradoTemp },
                                            textos: [
                                                ...prev.textos.filter(t => t.type !== 'grado'),
                                                { text: gradoTemp, x: modalGradoPos.x, y: modalGradoPos.y, type: 'grado' }
                                            ]
                                        }));
                                    }
                                    setModalGradoPos(null);
                                }}
                                style={{ ...st.btnPrimario, width: '100%', marginTop: 20, justifyContent: 'center' }}
                            >
                                {gradoTemp ? `Colocar "${gradoTemp}"` : 'Cancelar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Texto de vía (reemplaza prompt) */}
            {textoModalPos && (
                <div style={st.overlayModal}>
                    <div style={{ ...st.modal, maxWidth: 380 }}>
                        <div style={st.modalHeader}>
                            <h3>Añadir texto</h3>
                            <button onClick={() => setTextoModalPos(null)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={st.modalBody}>
                            <input autoFocus value={textoModalValor} onChange={e => setTextoModalValor(e.target.value)}
                                placeholder="Ej: paso difícil, reunión…" style={st.input}
                                onKeyDown={e => { if (e.key === 'Enter' && textoModalValor.trim()) {
                                    setViaActual(prev => ({ ...prev, textos: [...prev.textos, { text: textoModalValor.trim(), x: textoModalPos.x, y: textoModalPos.y, type: 'texto' }] }));
                                    setTextoModalPos(null);
                                }}} />
                            <button onClick={() => {
                                if (textoModalValor.trim()) {
                                    setViaActual(prev => ({ ...prev, textos: [...prev.textos, { text: textoModalValor.trim(), x: textoModalPos.x, y: textoModalPos.y, type: 'texto' }] }));
                                }
                                setTextoModalPos(null);
                            }} style={{ ...st.btnPrimario, width: '100%', marginTop: 14, justifyContent: 'center' }}>
                                {textoModalValor.trim() ? `Añadir "${textoModalValor}"` : 'Cancelar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Texto libre */}
            {textoLibrePos && (
                <div style={st.overlayModal}>
                    <div style={{ ...st.modal, maxWidth: 380 }}>
                        <div style={st.modalHeader}>
                            <h3>Texto libre</h3>
                            <button onClick={() => setTextoLibrePos(null)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={st.modalBody}>
                            <input autoFocus value={textoLibreValor} onChange={e => setTextoLibreValor(e.target.value)}
                                placeholder="Texto de anotación…" style={st.input}
                                onKeyDown={e => { if (e.key === 'Enter' && textoLibreValor.trim()) {
                                    setFormas(prev => [...prev, { id: Date.now(), tipo: 'TEXTO_LIBRE', x: textoLibrePos.x, y: textoLibrePos.y, text: textoLibreValor.trim(), color: colorForma, fontSize: 20 }]);
                                    setTextoLibrePos(null);
                                }}} />
                            <button onClick={() => {
                                if (textoLibreValor.trim()) {
                                    setFormas(prev => [...prev, { id: Date.now(), tipo: 'TEXTO_LIBRE', x: textoLibrePos.x, y: textoLibrePos.y, text: textoLibreValor.trim(), color: colorForma, fontSize: 20 }]);
                                }
                                setTextoLibrePos(null);
                            }} style={{ ...st.btnPrimario, width: '100%', marginTop: 14, justifyContent: 'center' }}>
                                {textoLibreValor.trim() ? `Añadir "${textoLibreValor}"` : 'Cancelar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Editar info de vía existente */}
            {editandoInfoViaIdx !== null && vias[editandoInfoViaIdx] && (
                <div style={st.overlayModal}>
                    <div style={st.modal}>
                        <div style={st.modalHeader}>
                            <h3>Datos de la Vía {editandoInfoViaIdx + 1}</h3>
                            <button onClick={() => setEditandoInfoViaIdx(null)} style={st.btnClose}><X size={20} /></button>
                        </div>
                        <div style={st.modalBody}>
                            <InputModal label="Nombre *"
                                value={vias[editandoInfoViaIdx].info?.nombre || ''}
                                onChange={v => setVias(prev => { const c = [...prev]; c[editandoInfoViaIdx] = { ...c[editandoInfoViaIdx], info: { ...c[editandoInfoViaIdx].info, nombre: v } }; return c; })}
                                ph="Ej: La Vía Láctea" />
                            <div style={{ marginBottom: 15 }}>
                                <label style={st.label}>Grado</label>
                                <GradeSelector
                                    value={vias[editandoInfoViaIdx].info?.grado || ''}
                                    onChange={v => setVias(prev => {
                                        const c = [...prev];
                                        c[editandoInfoViaIdx] = {
                                            ...c[editandoInfoViaIdx],
                                            info: { ...c[editandoInfoViaIdx].info, grado: v },
                                            textos: c[editandoInfoViaIdx].textos.map(t => t.type === 'grado' ? { ...t, text: v } : t)
                                        };
                                        return c;
                                    })}
                                />
                            </div>
                            <InputModal label="Equipador/a"
                                value={vias[editandoInfoViaIdx].info?.equipador || ''}
                                onChange={v => setVias(prev => { const c = [...prev]; c[editandoInfoViaIdx] = { ...c[editandoInfoViaIdx], info: { ...c[editandoInfoViaIdx].info, equipador: v } }; return c; })}
                                ph="Nombre de quien equipó" />
                            <InputModal label="Año"
                                value={vias[editandoInfoViaIdx].info?.anio || ''}
                                onChange={v => setVias(prev => { const c = [...prev]; c[editandoInfoViaIdx] = { ...c[editandoInfoViaIdx], info: { ...c[editandoInfoViaIdx].info, anio: v } }; return c; })}
                                type="number" ph="Ej: 2018" />
                            <label style={st.label}>Información adicional</label>
                            <textarea
                                value={vias[editandoInfoViaIdx].info?.info || ''}
                                onChange={e => { const v = e.target.value; setVias(prev => { const c = [...prev]; c[editandoInfoViaIdx] = { ...c[editandoInfoViaIdx], info: { ...c[editandoInfoViaIdx].info, info: v } }; return c; }); }}
                                style={{ ...st.input, height: 80, resize: 'none' }} placeholder="Ej: 10 cintas, paso duro en la 3ª chapa." />
                            <button onClick={() => setEditandoInfoViaIdx(null)} style={{ ...st.btnPrimario, width: '100%', marginTop: 15 }}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Impresión */}
            {mostrarImpresion && (
                <ModalImpresion
                    croquis={{ ...{infoCroquis, vias, formas, imagenUrl} }}
                    onClose={() => setMostrarImpresion(false)}
                />
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

function TextoEditable({ txt, color, onMove, onDelete, contenedorRef, pan, scale }) {
    const [dragging, setDragging] = useState(false);
    const isGrado = txt.type === 'grado';

    const handlePointerDown = (e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
    };
    const handlePointerMove = (e) => {
        if (!dragging) return;
        e.stopPropagation();
        const rect = contenedorRef.current.getBoundingClientRect();
        onMove((e.clientX - rect.left - pan.x) / scale, (e.clientY - rect.top - pan.y) / scale);
    };
    const handlePointerUp = (e) => { e.stopPropagation(); setDragging(false); };

    return (
        <g>
            <g transform={`translate(${txt.x}, ${txt.y})`}
                style={{ cursor: 'move' }}
                onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
                {isGrado ? (
                    <>
                        <rect x="-22" y="-14" width="44" height="28" rx="4" fill="white" stroke={color} strokeWidth="2" />
                        <text x="0" y="5" fill={color} fontSize="14" fontWeight="bold" textAnchor="middle">{txt.text}</text>
                    </>
                ) : (
                    <>
                        <text x="0" y="0" fill="white" stroke="black" strokeWidth="3" fontSize="18" fontWeight="bold" paintOrder="stroke">{txt.text}</text>
                        <text x="0" y="0" fill="white" fontSize="18" fontWeight="bold">{txt.text}</text>
                    </>
                )}
            </g>
            <g onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ cursor: 'pointer' }}>
                <circle cx={txt.x + (isGrado ? 22 : 60)} cy={txt.y - 10} r={8} fill="#e74c3c" />
                <text x={txt.x + (isGrado ? 22 : 60)} y={txt.y - 6} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">×</text>
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

function GradeSelector({ value, onChange }) {
    const numMatch = value?.match(/^(\d)/);
    const letMatch = value?.match(/[abc]/);
    const hasPlus = value?.includes('+') ?? false;
    const hasQ = value?.includes('?') ?? false;
    const num = numMatch ? numMatch[1] : '';
    const letra = letMatch ? letMatch[0] : '';

    const build = (n, l, p, q) => {
        if (!n) return '';
        return `${n}${l}${p ? '+' : ''}${q ? '?' : ''}`;
    };

    const btnStyle = (activo, color) => ({
        width: 34, height: 34, borderRadius: 7, border: '2px solid', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem',
        borderColor: activo ? color : '#ddd',
        background: activo ? color : 'white',
        color: activo ? 'white' : '#444',
        transition: 'all 0.1s',
    });

    return (
        <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                {/* Número */}
                <div>
                    <div style={{ fontSize: '0.72rem', color: '#7f8c8d', marginBottom: 4, fontWeight: 'bold' }}>NÚMERO</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {['4','5','6','7','8','9'].map(n => (
                            <button key={n} type="button" onClick={() => onChange(build(n === num ? '' : n, letra, hasPlus, hasQ))}
                                style={btnStyle(num === n, '#e74c3c')}>{n}</button>
                        ))}
                    </div>
                </div>
                {/* Letra */}
                <div>
                    <div style={{ fontSize: '0.72rem', color: '#7f8c8d', marginBottom: 4, fontWeight: 'bold' }}>LETRA</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {['a','b','c'].map(l => (
                            <button key={l} type="button" onClick={() => onChange(build(num, letra === l ? '' : l, hasPlus, hasQ))}
                                style={btnStyle(letra === l, '#3498db')}>{l}</button>
                        ))}
                    </div>
                </div>
                {/* Modificadores */}
                <div>
                    <div style={{ fontSize: '0.72rem', color: '#7f8c8d', marginBottom: 4, fontWeight: 'bold' }}>MOD.</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" onClick={() => onChange(build(num, letra, !hasPlus, hasQ))}
                            style={btnStyle(hasPlus, '#9b59b6')}>+</button>
                        <button type="button" onClick={() => onChange(build(num, letra, hasPlus, !hasQ))}
                            style={btnStyle(hasQ, '#f39c12')}>?</button>
                    </div>
                </div>
                {/* Preview */}
                <div style={{ marginTop: 18 }}>
                    {value ? (
                        <div style={{ padding: '6px 16px', background: '#f8f9fa', border: '2px solid #ecf0f1', borderRadius: 8, fontWeight: 'bold', fontSize: '1.3rem', color: '#e74c3c', minWidth: 56, textAlign: 'center' }}>
                            {value}
                        </div>
                    ) : (
                        <div style={{ padding: '6px 16px', border: '2px dashed #ddd', borderRadius: 8, color: '#bdc3c7', fontSize: '0.85rem' }}>–</div>
                    )}
                </div>
            </div>
            {value && (
                <button type="button" onClick={() => onChange('')}
                    style={{ marginTop: 8, background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '0.8rem' }}>
                    Limpiar grado
                </button>
            )}
        </div>
    );
}

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
