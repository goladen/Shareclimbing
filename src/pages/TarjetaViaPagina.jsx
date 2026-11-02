import React, { useState, useEffect, useRef } from 'react';
import { Plus, Minus, Send, Trash2, MapPin, MousePointer2, CheckCircle } from 'lucide-react';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import EquipadorInput from '../components/EquipadorInput';
import { GradeSelector } from '../CroquisEscalada';
import { generarCurvaSuave } from '../components/CroquisImagen';

const HERRAMIENTAS = [
    { id: 'inicio', label: 'Inicio', color: '#e74c3c', icon: <MapPin size={15} /> },
    { id: 'intermedio', label: 'Intermedio', color: '#f39c12', icon: <MousePointer2 size={15} /> },
    { id: 'fin', label: 'Fin', color: '#2ecc71', icon: <CheckCircle size={15} /> },
];

const fotosDeDatos = (d) => d.fotos?.length > 0
    ? d.fotos
    : [{ id: 'f0', imagenUrl: d.imagenUrl, vias: d.vias || [], formas: d.formas || [] }];

const ordenarPuntos = (via) => {
    const dir = via.inicio && via.fin ? via.fin.y - via.inicio.y : -1;
    const inter = [...(via.intermedios || [])].sort((a, b) => dir < 0 ? b.y - a.y : a.y - b.y);
    return [via.inicio, ...inter, via.fin].filter(Boolean);
};

// Trazado sobre la foto: tocar la imagen coloca puntos y los puntos se arrastran.
// Las coordenadas se guardan en la misma escala que usa el editor de croquis.
function TrazadoVia({ foto, otrasVias, inicio, fin, intermedios, color, herramienta, seleccion, setSeleccion, onColocar, onMover }) {
    const [natural, setNatural] = useState(null);
    const [anchoVisible, setAnchoVisible] = useState(0);
    const contRef = useRef(null);
    const arrastre = useRef(null);

    useEffect(() => {
        const obs = new ResizeObserver(([e]) => setAnchoVisible(e.contentRect.width));
        obs.observe(contRef.current);
        return () => obs.disconnect();
    }, []);

    const baseW = foto.srcW || natural?.w || 1;
    const baseH = foto.srcH || natural?.h || 1;
    const xRatio = natural ? natural.w / baseW : 1;
    const yRatio = natural ? natural.h / baseH : 1;
    const f = natural && anchoVisible ? natural.w / anchoVisible : 1;
    const aPantalla = (p) => ({ x: p.x * xRatio, y: p.y * yRatio });

    const posicion = (e) => {
        const r = contRef.current.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * baseW,
            y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * baseH,
        };
    };

    const punto = (p, ref, relleno) => {
        const q = aPantalla(p);
        const activo = seleccion?.tipo === ref.tipo && seleccion?.i === ref.i;
        return (
            <circle key={`${ref.tipo}-${ref.i}`} cx={q.x} cy={q.y} r={(activo ? 11 : 8) * f} fill={relleno} stroke="white" strokeWidth={2 * f}
                style={{ cursor: 'move', touchAction: 'none' }}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    arrastre.current = ref;
                    setSeleccion(ref);
                }}
                onPointerMove={e => { if (arrastre.current) onMover(arrastre.current, posicion(e)); }}
                onPointerUp={() => { arrastre.current = null; }}
                onPointerCancel={() => { arrastre.current = null; }} />
        );
    };

    const trazoActual = ordenarPuntos({ inicio, fin, intermedios }).map(aPantalla);

    return (
        <div ref={contRef} onClick={e => { if (seleccion) setSeleccion(null); else onColocar(herramienta, posicion(e)); }}
            style={{ position: 'relative', lineHeight: 0, cursor: 'crosshair' }}>
            <img src={foto.imagenUrl} alt="Pared" draggable={false}
                onLoad={e => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }} />
            {natural && (
                <svg viewBox={`0 0 ${natural.w} ${natural.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    {otrasVias.map(v => (
                        <path key={v.id} d={generarCurvaSuave(ordenarPuntos(v).map(aPantalla))} fill="none" stroke={v.color} strokeWidth={2 * f} opacity={0.4} pointerEvents="none" />
                    ))}
                    <path d={generarCurvaSuave(trazoActual)} fill="none" stroke="black" strokeWidth={6 * f} opacity={0.4} pointerEvents="none" />
                    <path d={generarCurvaSuave(trazoActual)} fill="none" stroke={color} strokeWidth={4 * f} strokeLinecap="round" pointerEvents="none" />
                    {inicio && punto(inicio, { tipo: 'inicio', i: 0 }, '#e74c3c')}
                    {intermedios.map((p, i) => punto(p, { tipo: 'intermedio', i }, '#f39c12'))}
                    {fin && punto(fin, { tipo: 'fin', i: 0 }, '#2ecc71')}
                </svg>
            )}
        </div>
    );
}

export default function TarjetaViaPagina({ token, onSalir }) {
    const [estado, setEstado] = useState('cargando'); // cargando | listo | invalida
    const [tarjeta, setTarjeta] = useState(null);
    const [contexto, setContexto] = useState(null); // { titulo, foto, otrasVias, color }
    const [nombre, setNombre] = useState('');
    const [grado, setGrado] = useState('');
    const [numero, setNumero] = useState('');
    const [equipador, setEquipador] = useState({ nombre: '', id: null });
    const [anio, setAnio] = useState('');
    const [infoExtra, setInfoExtra] = useState('');
    const [autorNombre, setAutorNombre] = useState('');
    const [inicio, setInicio] = useState(null);
    const [fin, setFin] = useState(null);
    const [intermedios, setIntermedios] = useState([]);
    const [herramienta, setHerramienta] = useState('intermedio');
    const [seleccion, setSeleccion] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [guardando, setGuardando] = useState(false);
    const [mensaje, setMensaje] = useState(null); // { tipo: 'ok' | 'error', texto }

    useEffect(() => {
        (async () => {
            try {
                const snapTarjeta = await getDoc(doc(db, 'tarjetas_via', token));
                if (!snapTarjeta.exists()) { setEstado('invalida'); return; }
                const t = snapTarjeta.data();
                const snap = await getDoc(doc(db, 'croquis_escalada', t.croquisId));
                if (!snap.exists()) { setEstado('invalida'); return; }
                const datos = snap.data();
                const foto = fotosDeDatos(datos).find(f => (f.vias || []).some(v => v.id === t.viaId));
                const via = foto?.vias.find(v => v.id === t.viaId);
                if (!via) { setEstado('invalida'); return; }
                setTarjeta(t);
                setContexto({
                    titulo: [datos.infoCroquis?.escuela, datos.infoCroquis?.sector].filter(Boolean).join(' · '),
                    foto,
                    otrasVias: foto.vias.filter(v => v.id !== t.viaId && v.inicio),
                    color: via.color || '#e74c3c',
                });
                setNombre(via.info?.nombre || '');
                setGrado(via.info?.grado || '');
                setNumero(via.info?.numero || '');
                setEquipador({ nombre: via.info?.equipador || '', id: via.info?.equipadorId || null });
                setAnio(via.info?.anio || '');
                setInfoExtra(via.info?.info || '');
                setInicio(via.inicio || null);
                setFin(via.fin || null);
                setIntermedios(via.intermedios || []);
                setEstado('listo');
            } catch (e) {
                console.error(e);
                setEstado('invalida');
            }
        })();
    }, [token]);

    const colocar = (tipo, p) => {
        setMensaje(null);
        if (tipo === 'inicio') setInicio(p);
        else if (tipo === 'fin') setFin(p);
        else setIntermedios(ps => [...ps, p]);
    };

    const mover = (ref, p) => {
        setMensaje(null);
        if (ref.tipo === 'inicio') setInicio(p);
        else if (ref.tipo === 'fin') setFin(p);
        else setIntermedios(ps => ps.map((q, i) => i === ref.i ? p : q));
    };

    const quitarPunto = () => {
        setIntermedios(ps => ps.filter((_, i) => i !== seleccion.i));
        setSeleccion(null);
    };

    // Sin registro: la propuesta llega a quien compartió la tarjeta, que decide si se aplica
    const enviar = async () => {
        if (!autorNombre.trim()) { setMensaje({ tipo: 'error', texto: 'Escribe tu nombre para que sepan quién propone el cambio.' }); return; }
        if (!nombre.trim()) { setMensaje({ tipo: 'error', texto: 'La vía necesita un nombre.' }); return; }
        if (contexto.foto.imagenUrl && (!inicio || !fin)) { setMensaje({ tipo: 'error', texto: 'El trazado necesita punto de inicio y de fin.' }); return; }
        setGuardando(true);
        setMensaje(null);
        try {
            await addDoc(collection(db, 'propuestas_via'), {
                token,
                croquisId: tarjeta.croquisId,
                viaId: tarjeta.viaId,
                paraUid: tarjeta.creadoPor,
                autorNombre: autorNombre.trim().slice(0, 60),
                cambios: {
                    info: {
                        nombre: nombre.trim(), grado, numero: numero.trim(),
                        equipador: equipador.nombre.trim(), equipadorId: equipador.id,
                        anio: String(anio).trim(), info: infoExtra.trim(),
                    },
                    trazado: contexto.foto.imagenUrl ? { inicio, fin, intermedios } : null,
                },
                estado: 'pendiente',
                createdAt: serverTimestamp(),
            });
            setMensaje({ tipo: 'ok', texto: 'Propuesta enviada. Se aplicará cuando la acepten.' });
        } catch (e) {
            setMensaje({ tipo: 'error', texto: 'No se pudo enviar: ' + e.message });
        }
        setGuardando(false);
    };

    if (estado === 'cargando') return <div style={st.pantallaMensaje}>Cargando…</div>;
    if (estado === 'invalida') {
        return (
            <div style={st.pantallaMensaje}>
                <p>Este enlace ya no está disponible. Puede que lo hayan desactivado o que la vía se haya eliminado.</p>
                <button onClick={onSalir} style={{ ...st.btnGuardar, background: '#2c3e50', marginTop: 14 }}>Ir al inicio</button>
            </div>
        );
    }

    return (
        <div style={st.app}>
            <div style={st.topbar}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'white', fontWeight: 'bold' }}>Tarjeta de vía</div>
                    {contexto.titulo && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', overflowWrap: 'anywhere' }}>{contexto.titulo}</div>}
                </div>
                <button onClick={enviar} disabled={guardando} style={st.btnGuardar}>
                    <Send size={16} /> {guardando ? 'Enviando…' : 'Enviar propuesta'}
                </button>
            </div>
            <div style={st.scroll}>
                <div style={st.tarjeta}>
                    {mensaje && <div style={mensaje.tipo === 'ok' ? st.ok : st.error}>{mensaje.texto}</div>}
                    <label style={st.label}>Tu nombre *</label>
                    <input value={autorNombre} onChange={e => { setAutorNombre(e.target.value); setMensaje(null); }} maxLength={60} placeholder="Para que sepan quién propone el cambio" style={st.input} />
                    <p style={st.ayuda}>Tu propuesta llegará a quien compartió esta vía. Si la acepta, aparecerás como colaborador.</p>
                    <label style={st.label}>Nombre de la vía</label>
                    <input value={nombre} onChange={e => { setNombre(e.target.value); setMensaje(null); }} placeholder="Nombre de la vía" style={st.input} />
                    <label style={st.label}>Grado</label>
                    <GradeSelector value={grado} onChange={v => { setGrado(v); setMensaje(null); }} />
                    <div style={st.dosColumnas}>
                        <div>
                            <label style={st.label}>Número en la pared</label>
                            <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ej: 7a" style={st.input} />
                        </div>
                        <div>
                            <label style={st.label}>Año</label>
                            <input type="number" value={anio} onChange={e => setAnio(e.target.value)} placeholder="Ej: 2018" style={st.input} />
                        </div>
                    </div>
                    <label style={st.label}>Equipador/a</label>
                    <EquipadorInput nombre={equipador.nombre} onChange={(n, id) => setEquipador({ nombre: n, id })} inputStyle={st.input} />
                    <label style={st.label}>Información adicional</label>
                    <textarea value={infoExtra} onChange={e => setInfoExtra(e.target.value)} rows={3} placeholder="Ej: 10 cintas, paso duro en la 3ª chapa." style={{ ...st.input, resize: 'vertical', fontFamily: 'inherit' }} />

                    {contexto.foto.imagenUrl && (
                        <>
                            <label style={st.label}>Trazado</label>
                            <div style={st.herramientas}>
                                {HERRAMIENTAS.map(h => (
                                    <button key={h.id} onClick={() => { setHerramienta(h.id); setSeleccion(null); }}
                                        style={{ ...st.btnHerramienta, borderColor: h.color, background: herramienta === h.id ? h.color : 'white', color: herramienta === h.id ? 'white' : '#2c3e50' }}>
                                        {h.icon} {h.label}
                                    </button>
                                ))}
                                <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} style={st.btnCuadrado} title="Alejar"><Minus size={15} /></button>
                                <button onClick={() => setZoom(z => Math.min(4, z + 0.5))} style={st.btnCuadrado} title="Acercar"><Plus size={15} /></button>
                                {seleccion?.tipo === 'intermedio' && (
                                    <button onClick={quitarPunto} style={{ ...st.btnCuadrado, color: '#e74c3c', padding: '0 8px' }}><Trash2 size={14} /> Quitar punto</button>
                                )}
                            </div>
                            <p style={st.ayuda}>Toca la foto para colocar el punto elegido. Arrastra un punto para moverlo.</p>
                            <div style={st.lienzo}>
                                <div style={{ width: `${zoom * 100}%` }}>
                                    <TrazadoVia foto={contexto.foto} otrasVias={contexto.otrasVias} inicio={inicio} fin={fin} intermedios={intermedios}
                                        color={contexto.color} herramienta={herramienta} seleccion={seleccion} setSeleccion={setSeleccion}
                                        onColocar={colocar} onMover={mover} />
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

const st = {
    app: { display: 'flex', flexDirection: 'column', height: '100dvh', fontFamily: "'Segoe UI', Tahoma, sans-serif", background: '#f4f6f8' },
    pantallaMensaje: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontFamily: 'sans-serif', color: '#7f8c8d', padding: 20, textAlign: 'center' },
    topbar: { background: '#2c3e50', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexShrink: 0 },
    btnGuardar: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem', flexShrink: 0 },
    scroll: { flex: 1, overflowY: 'auto', padding: 12 },
    tarjeta: { background: 'white', borderRadius: 12, padding: 16, maxWidth: 900, margin: '0 auto', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
    label: { display: 'block', fontWeight: 'bold', color: '#34495e', margin: '14px 0 6px', fontSize: '0.88rem' },
    input: { width: '100%', padding: '10px 12px', border: '2px solid #bdc3c7', borderRadius: 8, fontSize: '1rem', color: '#2c3e50', outline: 'none' },
    herramientas: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    btnHerramienta: { display: 'flex', alignItems: 'center', gap: 4, padding: '7px 10px', border: '2px solid', borderRadius: 8, fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' },
    btnCuadrado: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 34, height: 34, background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 7, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 'bold' },
    ayuda: { color: '#7f8c8d', fontSize: '0.76rem', margin: '6px 0' },
    dosColumnas: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    lienzo: { overflow: 'auto', maxHeight: '70dvh', borderRadius: 8, background: '#ecf0f1' },
    ok: { background: '#eafaf1', color: '#1e8449', padding: '9px 12px', borderRadius: 8, fontSize: '0.88rem' },
    error: { background: '#fdecea', color: '#c0392b', padding: '9px 12px', borderRadius: 8, fontSize: '0.88rem' },
};
