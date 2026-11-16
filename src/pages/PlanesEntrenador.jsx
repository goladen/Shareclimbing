import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Plus, Trash2, Save, Send, Users, MessageSquare, X, ChevronRight, Copy, RotateCcw, AlertTriangle } from 'lucide-react';
import { db } from '../firebase';
import { Tarjeta, Marco, Centro, Campo, st } from '../components/entrenamientoUI';
import { TIPOS_SESION, COMPONENTES, ESTILOS_DEDOS, generarEstructura, textoCarga, sesionesHechas } from '../utils/entrenamiento';
import {
    COL_PLANES, COL_PLANTILLAS, COL_INVITACIONES, resumenPlantilla, cambiosDePlantilla, notificar, nombreDe, resumenAtleta,
} from '../utils/entrenador';
import { SelectorBloque, Pestana } from './EntrenadorPagina';

const ICONO_RES = { todo: '✓', casi: '≈', no: '✗' };
const COLOR_RES = { todo: '#27ae60', casi: '#e67e22', no: '#c0392b' };
const ordenar = (sesiones) => [...sesiones].sort((a, b) => a.semana - b.semana || a.orden - b.orden);
const esEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ───────────────────────────── Lista de planes del entrenador ─────────────────────────────

export function ListaPlantillas({ usuario, planesAtletas, onAbrir }) {
    const [plantillas, setPlantillas] = useState(null);
    const [creando, setCreando] = useState(false);

    useEffect(() => onSnapshot(query(collection(db, COL_PLANTILLAS), where('entrenadorUid', '==', usuario.uid)),
        (snap) => setPlantillas(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))),
        (e) => { console.error(e); setPlantillas([]); }), [usuario.uid]);

    if (creando) return <NuevaPlantilla usuario={usuario} onCancelar={() => setCreando(false)} onCreada={(id) => { setCreando(false); onAbrir(id); }} />;

    return (
        <>
            <button onClick={() => setCreando(true)} style={{ ...st.btnPrincipal, justifyContent: 'center' }}><Plus size={16} /> Nuevo plan</button>
            {plantillas === null ? <Centro>Cargando…</Centro> : !plantillas.length ? (
                <Tarjeta estilo={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem' }}>📋</div>
                    <h3 style={st.h3}>Crea tus planes de entrenamiento</h3>
                    <p style={st.texto}>Diseña un plan y asígnalo a una o varias personas. Cada una recibe su propia copia, con las cargas calculadas con su test, y tú ves el feedback de todas en el mismo plan.</p>
                </Tarjeta>
            ) : plantillas.map(p => {
                const atletas = (planesAtletas || []).filter(x => x.plantillaId === p.id);
                const nuevos = atletas.reduce((s, x) => s + resumenAtleta(x, usuario.uid).nuevos, 0);
                return (
                    <button key={p.id} onClick={() => onAbrir(p.id)}
                        style={{ textAlign: 'left', padding: '12px 14px', background: 'white', border: '1px solid #dfe4ea', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ color: '#2c3e50' }}>{p.nombre}</strong>
                            {nuevos > 0 && <span style={{ marginLeft: 8, background: '#2471a3', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 'bold' }}>{nuevos} sesiones nuevas</span>}
                            <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d', marginTop: 2 }}>
                                {p.semanas} semanas · {p.sesiones?.length || 0} sesiones · {atletas.length} atleta{atletas.length === 1 ? '' : 's'}
                            </span>
                        </span>
                        <ChevronRight size={18} style={{ color: '#95a5a6' }} />
                    </button>
                );
            })}
        </>
    );
}

function NuevaPlantilla({ usuario, onCancelar, onCreada }) {
    const [f, setF] = useState({ nombre: '', enfoque: 'fuerza', dias: 3, semanas: 6, estiloDedos: 'mixto', avanzado: false, material: { rocodromo: true, multipresa: true, barra: true, campus: false } });
    const crear = () => {
        if (!f.nombre.trim()) return alert('Ponle un nombre al plan.');
        const { semanas, sesiones } = generarEstructura({ ...f, dias: Number(f.dias), semanas: Number(f.semanas) });
        const ref = doc(collection(db, COL_PLANTILLAS));
        setDoc(ref, {
            entrenadorUid: usuario.uid, entrenadorEmail: usuario.email?.toLowerCase() || '', entrenadorNombre: nombreDe(usuario),
            nombre: f.nombre.trim().slice(0, 80), descripcion: '', mensaje: '', semanas,
            sesiones: sesiones.map(s => ({ ...s, extras: [], nota: '' })),
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        }).catch(e => { console.error(e); alert('No se pudo crear el plan.'); });
        onCreada(ref.id);
    };
    const mat = (k) => <label key={k}><input type="checkbox" checked={!!f.material[k]} onChange={(e) => setF({ ...f, material: { ...f.material, [k]: e.target.checked } })} /> {{ rocodromo: 'Rocódromo', multipresa: 'Multipresa', barra: 'Barra', campus: 'Campus board' }[k]}</label>;
    return (
        <Tarjeta>
            <h3 style={st.h3}>Nuevo plan</h3>
            <p style={st.texto}>Se genera una estructura de partida que luego puedes editar sesión a sesión. Las cargas se calculan con el test de cada atleta.</p>
            <div style={st.rejilla}>
                <Campo etiqueta="Nombre"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Fuerza de dedos invierno" style={st.input} /></Campo>
                <Campo etiqueta="Enfoque">
                    <select value={f.enfoque} onChange={(e) => setF({ ...f, enfoque: e.target.value })} style={st.input}>
                        <option value="fuerza">Fuerza (bloque)</option><option value="resistencia">Resistencia (vía)</option>
                    </select>
                </Campo>
                <Campo etiqueta="Días por semana">
                    <select value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value })} style={st.input}>{[2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select>
                </Campo>
                <Campo etiqueta="Semanas">
                    <select value={f.semanas} onChange={(e) => setF({ ...f, semanas: e.target.value })} style={st.input}>{[4, 5, 6, 7, 8, 10, 12].map(n => <option key={n}>{n}</option>)}</select>
                </Campo>
                <Campo etiqueta="Suspensiones">
                    <select value={f.estiloDedos} onChange={(e) => setF({ ...f, estiloDedos: e.target.value })} style={st.input}>
                        {Object.entries(ESTILOS_DEDOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </Campo>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '10px 0', fontSize: '0.88rem' }}>
                {['rocodromo', 'multipresa', 'barra', 'campus'].map(mat)}
                <label><input type="checkbox" checked={f.avanzado} onChange={(e) => setF({ ...f, avanzado: e.target.checked })} /> Para escaladores avanzados (campus, ejercicios a un brazo)</label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onCancelar} style={st.btnSecundario}>Cancelar</button>
                <button onClick={crear} style={st.btnPrincipal}><Plus size={16} /> Crear y editar</button>
            </div>
        </Tarjeta>
    );
}

// ───────────────────────────── Un plan del entrenador ─────────────────────────────

export function DetallePlantilla({ id, usuario, planesAtletas, onVolver, onAbrirAtleta }) {
    const [plantilla, setPlantilla] = useState(undefined);
    const [invitaciones, setInvitaciones] = useState([]);
    const [seccion, setSeccion] = useState('sesiones');

    useEffect(() => onSnapshot(doc(db, COL_PLANTILLAS, id),
        (snap) => setPlantilla(snap.exists() ? { id: snap.id, ...snap.data() } : null),
        (e) => { console.error(e); setPlantilla(null); }), [id]);
    useEffect(() => onSnapshot(query(collection(db, COL_INVITACIONES), where('entrenadorUid', '==', usuario.uid)),
        (snap) => setInvitaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.plantillaId === id)),
        (e) => console.error(e)), [id, usuario.uid]);

    if (plantilla === undefined) return <Marco titulo="Plan" onVolver={onVolver}><Centro>Cargando…</Centro></Marco>;
    if (plantilla === null) return <Marco titulo="Plan" onVolver={onVolver}><Centro>Este plan ya no existe.</Centro></Marco>;

    const atletas = (planesAtletas || []).filter(p => p.plantillaId === id);
    const nuevos = atletas.reduce((s, x) => s + resumenAtleta(x, usuario.uid).nuevos, 0);

    return (
        <Marco titulo={plantilla.nombre} subtitulo={`${plantilla.semanas} semanas · ${atletas.length} atleta${atletas.length === 1 ? '' : 's'}`} onVolver={onVolver}>
            <div style={st.columna}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Pestana activa={seccion === 'sesiones'} onClick={() => setSeccion('sesiones')}>Sesiones</Pestana>
                    <Pestana activa={seccion === 'feedback'} onClick={() => setSeccion('feedback')}><MessageSquare size={15} /> Feedback{nuevos ? ` (${nuevos})` : ''}</Pestana>
                    <Pestana activa={seccion === 'atletas'} onClick={() => setSeccion('atletas')}><Users size={15} /> Atletas</Pestana>
                </div>
                {seccion === 'sesiones' && <EditorSesionesPlantilla plantilla={plantilla} usuario={usuario} atletas={atletas} invitaciones={invitaciones} />}
                {seccion === 'feedback' && <FeedbackPlantilla plantilla={plantilla} atletas={atletas} usuario={usuario} />}
                {seccion === 'atletas' && <AtletasPlantilla plantilla={plantilla} atletas={atletas} invitaciones={invitaciones} usuario={usuario} onAbrirAtleta={onAbrirAtleta} />}
            </div>
        </Marco>
    );
}

// ── Editor de sesiones ──

function EditorSesionesPlantilla({ plantilla, usuario, atletas, invitaciones }) {
    const original = useMemo(() => ({ nombre: plantilla.nombre, descripcion: plantilla.descripcion || '', mensaje: plantilla.mensaje || '', semanas: plantilla.semanas, sesiones: ordenar(plantilla.sesiones) }), [plantilla]);
    const [b, setB] = useState(original);
    const [todasDelTipo, setTodasDelTipo] = useState(true);
    const [anadiendo, setAnadiendo] = useState(null);
    const [pendienteEnviar, setPendienteEnviar] = useState(false);
    const sucio = JSON.stringify(b) !== JSON.stringify(original);

    // Si la plantilla cambia fuera y aquí no hay cambios sin guardar, se actualiza el borrador
    const originalPrevio = useRef(original);
    useEffect(() => {
        setB(prev => JSON.stringify(prev) === JSON.stringify(originalPrevio.current) ? original : prev);
        originalPrevio.current = original;
    }, [original]);

    const semanas = useMemo(() => {
        const m = {};
        b.sesiones.forEach(s => { (m[s.semana] ||= []).push(s); });
        return Object.entries(m).map(([n, l]) => [Number(n), l.sort((x, y) => x.orden - y.orden)]);
    }, [b.sesiones]);

    // Aplica un cambio a una sesión (o a todas las del mismo tipo si está marcado)
    const editar = (s, fn, aTodas = todasDelTipo) => setB(prev => ({
        ...prev, sesiones: prev.sesiones.map(x => (x.id === s.id || (aTodas && x.tipo === s.tipo)) ? fn(x) : x),
    }));
    const quitarComp = (s, k) => editar(s, x => ({ ...x, componentes: x.componentes.filter(c => c !== k) }));
    const anadirComp = (s, k) => k && editar(s, x => x.componentes.includes(k) ? x : ({ ...x, componentes: [...x.componentes, k] }));

    const anadirSemana = () => setB(prev => {
        const ultima = prev.sesiones.filter(s => s.semana === prev.semanas);
        const n = prev.semanas + 1;
        return { ...prev, semanas: n, sesiones: [...prev.sesiones, ...ultima.map(s => ({ ...s, id: `s${n}d${s.orden}`, semana: n }))] };
    });
    const quitarSemana = () => setB(prev => prev.semanas <= 1 ? prev : ({ ...prev, semanas: prev.semanas - 1, sesiones: prev.sesiones.filter(s => s.semana < prev.semanas) }));
    const anadirSesion = (semana) => setB(prev => {
        const orden = Math.max(0, ...prev.sesiones.filter(s => s.semana === semana).map(s => s.orden)) + 1;
        return { ...prev, sesiones: [...prev.sesiones, { id: `s${semana}d${orden}`, semana, orden, tipo: 'base', componentes: ['core'], extras: [], nota: '' }] };
    });
    const quitarSesion = (s) => setB(prev => ({ ...prev, sesiones: prev.sesiones.filter(x => x.id !== s.id) }));

    const guardar = () => {
        if (!b.nombre.trim()) return alert('El plan necesita un nombre.');
        const datos = { ...b, nombre: b.nombre.trim().slice(0, 80), sesiones: ordenar(b.sesiones) };
        const lote = writeBatch(db);
        lote.update(doc(db, COL_PLANTILLAS, plantilla.id), { ...datos, updatedAt: serverTimestamp() });
        // Las invitaciones aún no aceptadas reciben la versión nueva
        invitaciones.filter(i => i.estado === 'pendiente').forEach(i => lote.update(doc(db, COL_INVITACIONES, i.id), { plan: resumenPlantilla(datos), updatedAt: serverTimestamp() }));
        lote.commit().catch(e => { console.error(e); alert('No se pudo guardar el plan.'); });
        if (atletas.length) setPendienteEnviar(true);
    };
    const enviar = () => {
        const lote = writeBatch(db);
        atletas.forEach(p => lote.update(doc(db, COL_PLANES, p.id), { ...cambiosDePlantilla(p, { ...plantilla, ...b }), updatedAt: serverTimestamp() }));
        lote.commit()
            .then(() => notificar(atletas.map(p => p.creadoPor), { tipo: 'entreno_entrenador', autorNombre: nombreDe(usuario), textoPreview: `Ha actualizado el plan «${b.nombre}»` }))
            .catch(e => { console.error(e); alert('No se pudieron enviar los cambios.'); });
        setPendienteEnviar(false);
    };

    return (
        <>
            {anadiendo && (
                <SelectorBloque usuario={usuario} sesion={anadiendo} onCerrar={() => setAnadiendo(null)}
                    onElegir={(bloque, todas) => { editar(anadiendo, x => ({ ...x, extras: [...(x.extras || []), bloque] }), todas); setAnadiendo(null); }} />
            )}
            {pendienteEnviar && !sucio && (
                <div style={{ ...st.aviso, background: '#eaf2f8', borderColor: '#aed6f1', color: '#1b4f72', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1 }}>Plan guardado. ¿Envías los cambios a los {atletas.length} atletas que lo siguen? Las sesiones que ya han hecho no cambian.</span>
                    <button onClick={enviar} style={st.btnPrincipal}><Send size={14} /> Enviar a todos</button>
                    <button onClick={() => setPendienteEnviar(false)} style={st.btnSecundario}>Ahora no</button>
                </div>
            )}
            <Tarjeta>
                <div style={st.rejilla}>
                    <Campo etiqueta="Nombre"><input value={b.nombre} onChange={(e) => setB({ ...b, nombre: e.target.value })} style={st.input} /></Campo>
                </div>
                <div style={{ marginTop: 10 }}>
                    <Campo etiqueta="Mensaje para los atletas (portada del plan)">
                        <textarea value={b.mensaje} onChange={(e) => setB({ ...b, mensaje: e.target.value.slice(0, 2000) })} rows={2} style={{ ...st.input, resize: 'vertical' }} placeholder="Objetivo del plan, consejos generales…" />
                    </Campo>
                </div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginTop: 10 }}>
                    <input type="checkbox" checked={todasDelTipo} onChange={(e) => setTodasDelTipo(e.target.checked)} /> Al cambiar ejercicios, aplicarlo a todas las sesiones del mismo tipo
                </label>
            </Tarjeta>

            {semanas.map(([n, sesiones]) => (
                <Tarjeta key={n}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <h3 style={{ ...st.h3, margin: 0 }}>Semana {n}{n === b.semanas && b.semanas >= 4 ? ' · descarga' : ''}</h3>
                        <button onClick={() => anadirSesion(n)} style={{ ...st.btnSecundario, padding: '4px 10px' }}><Plus size={13} /> Sesión</button>
                    </div>
                    {sesiones.map(s => (
                        <div key={s.id} style={{ borderTop: '1px solid #f0f2f5', padding: '8px 0' }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '0.85rem', color: '#7f8c8d' }}>Día {s.orden}</strong>
                                <select value={s.tipo} onChange={(e) => editar(s, x => ({ ...x, tipo: e.target.value }), false)} style={{ ...st.input, width: 'auto', padding: '4px 8px' }}>
                                    {Object.entries(TIPOS_SESION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                <span style={{ flex: 1 }} />
                                <button onClick={() => quitarSesion(s)} style={{ ...st.btnHeader, color: '#c0392b' }} title="Quitar sesión"><Trash2 size={14} /></button>
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '6px 0' }}>
                                {s.componentes.map(k => (
                                    <span key={k} style={{ ...st.chip, cursor: 'default', background: '#f4f6f8' }}>
                                        {COMPONENTES[k]?.nombre || k}
                                        <button onClick={() => quitarComp(s, k)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#c0392b' }}><X size={12} /></button>
                                    </span>
                                ))}
                                {(s.extras || []).map((x, i) => (
                                    <span key={`e${i}`} style={{ ...st.chip, cursor: 'default', background: '#eaf2f8', color: '#1b4f72' }}>
                                        + {x.nombre}
                                        <button onClick={() => editar(s, y => ({ ...y, extras: y.extras.filter((_, j) => j !== i) }), false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#c0392b' }}><X size={12} /></button>
                                    </span>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <select value="" onChange={(e) => anadirComp(s, e.target.value)} style={{ ...st.input, width: 'auto', padding: '4px 8px', fontSize: '0.82rem' }}>
                                    <option value="">+ Ejercicio del plan…</option>
                                    {Object.entries(COMPONENTES).filter(([k]) => !s.componentes.includes(k)).map(([k, c]) => <option key={k} value={k}>{c.nombre}</option>)}
                                </select>
                                <button onClick={() => setAnadiendo(s)} style={{ ...st.btnSecundario, padding: '4px 10px', fontSize: '0.82rem' }}><Plus size={13} /> Bloque</button>
                            </div>
                            <input value={s.nota || ''} onChange={(e) => editar(s, x => ({ ...x, nota: e.target.value.slice(0, 500) }), false)}
                                placeholder="Nota para esta sesión…" style={{ ...st.input, marginTop: 6, fontSize: '0.82rem', padding: '5px 8px' }} />
                        </div>
                    ))}
                </Tarjeta>
            ))}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={anadirSemana} style={st.btnSecundario}><Copy size={14} /> Añadir semana (copia de la última)</button>
                <button onClick={quitarSemana} style={st.btnSecundario}><Trash2 size={14} /> Quitar la última semana</button>
                <button onClick={() => { if (window.confirm(`¿Eliminar el plan «${plantilla.nombre}»? Los atletas que ya lo siguen conservan su copia.`)) deleteDoc(doc(db, COL_PLANTILLAS, plantilla.id)).catch(e => console.error(e)); }}
                    style={{ ...st.btnSecundario, color: '#c0392b', borderColor: '#e6b0aa' }}><Trash2 size={14} /> Eliminar plan</button>
            </div>

            {sucio && (
                <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#2c3e50', padding: '10px 16px', display: 'flex', justifyContent: 'center', gap: 8, zIndex: 20 }}>
                    <button onClick={() => setB(original)} style={{ ...st.btnSecundario, background: 'transparent', color: 'white', borderColor: 'rgba(255,255,255,0.4)' }}><RotateCcw size={14} /> Descartar</button>
                    <button onClick={guardar} style={st.btnPrincipal}><Save size={16} /> Guardar plan</button>
                </div>
            )}
            {sucio && <div style={{ height: 60 }} />}
        </>
    );
}

// ── Feedback de todos los atletas, sesión a sesión ──

function FeedbackPlantilla({ plantilla, atletas, usuario }) {
    const [respuestas, setRespuestas] = useState({});
    const sesiones = ordenar(plantilla.sesiones);
    const conFeedback = sesiones.filter(s => atletas.some(a => a.registros?.[s.id]));

    // Marcar como visto
    useEffect(() => {
        const ahora = new Date().toISOString();
        atletas.forEach(a => updateDoc(doc(db, COL_PLANES, a.id), { [`vistoPorEntrenador.${usuario.uid}`]: ahora }).catch(e => console.error(e)));
    }, []); // eslint-disable-line

    if (!atletas.length) return <Tarjeta><p style={{ ...st.texto, margin: 0 }}>Nadie sigue este plan todavía. Asígnalo desde la pestaña «Atletas».</p></Tarjeta>;
    if (!conFeedback.length) return <Tarjeta><p style={{ ...st.texto, margin: 0 }}>Aún no hay sesiones registradas.</p></Tarjeta>;

    const responder = (a, sid) => {
        const clave = `${a.id}/${sid}`;
        const texto = (respuestas[clave] ?? a.comentarios?.[sid] ?? '').trim().slice(0, 1000);
        updateDoc(doc(db, COL_PLANES, a.id), { [`comentarios.${sid}`]: texto, updatedAt: serverTimestamp() })
            .then(() => notificar([a.creadoPor], { tipo: 'entreno_entrenador', autorNombre: nombreDe(usuario), textoPreview: `Ha comentado tu sesión: «${texto.slice(0, 80)}»` }))
            .catch(e => { console.error(e); alert('No se pudo enviar.'); });
        setRespuestas(r => { const n = { ...r }; delete n[clave]; return n; });
    };

    return conFeedback.slice().reverse().map(s => (
        <Tarjeta key={s.id}>
            <h3 style={st.h3}>{TIPOS_SESION[s.tipo]} · semana {s.semana}, día {s.orden}</h3>
            {atletas.filter(a => a.registros?.[s.id]).map(a => {
                const r = a.registros[s.id];
                const clave = `${a.id}/${s.id}`;
                const valor = respuestas[clave] ?? a.comentarios?.[s.id] ?? '';
                const cambiado = respuestas[clave] != null && respuestas[clave] !== (a.comentarios?.[s.id] ?? '');
                return (
                    <div key={a.id} style={{ borderTop: '1px solid #f0f2f5', padding: '8px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: '0.85rem' }}>
                            <strong>{a.atletaNombre || a.atletaEmail}</strong>
                            <span style={{ color: '#7f8c8d' }}>{new Date(r.fecha).toLocaleDateString()}{r.saltada ? ' · saltada' : ` · esfuerzo ${r.rpe}/10`}</span>
                        </div>
                        {!r.saltada && (
                            <div style={{ fontSize: '0.8rem', color: '#555', marginTop: 3 }}>
                                {(r.prescripcion || []).map(e => (
                                    <span key={e.clave} style={{ marginRight: 10, whiteSpace: 'nowrap' }}>
                                        <strong style={{ color: COLOR_RES[r.resultados?.[e.clave]] }}>{ICONO_RES[r.resultados?.[e.clave]] || '·'}</strong> {e.nombre}{e.carga != null ? ` ${textoCarga(e.carga)}` : ''}
                                    </span>
                                ))}
                                {r.molestia && <div style={{ color: '#935116', marginTop: 3 }}><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> Molestias en {r.molestia.zona}{r.molestia.nivel ? ` (${r.molestia.nivel})` : ''}</div>}
                                {r.notas && <div style={{ fontStyle: 'italic', marginTop: 3 }}>«{r.notas}»</div>}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <input value={valor} onChange={(e) => setRespuestas({ ...respuestas, [clave]: e.target.value })} placeholder="Responder a esta sesión…" style={{ ...st.input, fontSize: '0.82rem', padding: '5px 8px' }} />
                            {cambiado && <button onClick={() => responder(a, s.id)} style={st.btnPrincipal}><Send size={13} /></button>}
                        </div>
                    </div>
                );
            })}
        </Tarjeta>
    ));
}

// ── Atletas que siguen el plan e invitaciones ──

function AtletasPlantilla({ plantilla, atletas, invitaciones, usuario, onAbrirAtleta }) {
    const [emails, setEmails] = useState('');

    const asignar = () => {
        const lista = [...new Set(emails.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean))];
        const malos = lista.filter(e => !esEmail(e));
        if (!lista.length) return;
        if (malos.length) return alert(`Revisa estos emails: ${malos.join(', ')}`);
        const yaInvitados = new Set(invitaciones.filter(i => i.estado === 'pendiente').map(i => i.atletaEmail));
        const lote = writeBatch(db);
        lista.filter(e => !yaInvitados.has(e)).forEach(e => lote.set(doc(collection(db, COL_INVITACIONES)), {
            entrenadorUid: usuario.uid, entrenadorEmail: usuario.email?.toLowerCase() || '', entrenadorNombre: nombreDe(usuario),
            atletaEmail: e, plantillaId: plantilla.id, plan: resumenPlantilla(plantilla), estado: 'pendiente', createdAt: serverTimestamp(),
        }));
        lote.commit().then(() => alert('Invitaciones enviadas. Cada persona lo verá en su campana y en Entrenamiento.')).catch(e => { console.error(e); alert('No se pudieron enviar.'); });
        setEmails('');
    };

    const pendientes = invitaciones.filter(i => i.estado !== 'aceptada');
    return (
        <>
            <Tarjeta>
                <h3 style={st.h3}>Asignar este plan</h3>
                <p style={st.texto}>Escribe los emails de sus cuentas (separados por comas). Cada persona recibe una invitación; al aceptarla, tiene su propia copia con las cargas calculadas con su test.</p>
                <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} placeholder="ana@correo.com, luis@correo.com" style={{ ...st.input, resize: 'vertical' }} />
                <button onClick={asignar} style={{ ...st.btnPrincipal, marginTop: 8 }}><Send size={14} /> Enviar invitaciones</button>
            </Tarjeta>

            <h3 style={st.h3}>Siguen este plan ({atletas.length})</h3>
            {!atletas.length && <Tarjeta><p style={{ ...st.texto, margin: 0 }}>Todavía nadie.</p></Tarjeta>}
            {atletas.map(a => {
                const r = resumenAtleta(a, usuario.uid);
                return (
                    <button key={a.id} onClick={() => onAbrirAtleta(a.id)}
                        style={{ textAlign: 'left', padding: '10px 14px', background: 'white', border: `1px solid ${r.alertas.length ? '#f5cba7' : '#dfe4ea'}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                        <span style={{ flex: 1 }}>
                            <strong style={{ color: '#2c3e50' }}>{a.atletaNombre || a.atletaEmail}</strong>
                            <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d' }}>
                                {sesionesHechas(a)}/{a.sesiones.length} sesiones{r.ultimo ? ` · última ${new Date(r.ultimo.fecha).toLocaleDateString()}` : ''}
                                {r.alertas.length ? ` · ⚠ ${r.alertas.join(', ')}` : ''}
                            </span>
                        </span>
                        <ChevronRight size={18} style={{ color: '#95a5a6' }} />
                    </button>
                );
            })}

            {pendientes.length > 0 && (
                <>
                    <h3 style={st.h3}>Invitaciones</h3>
                    {pendientes.map(i => (
                        <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid #dfe4ea', borderRadius: 10, padding: '8px 12px', fontSize: '0.85rem' }}>
                            <span>{i.atletaEmail} · <em style={{ color: i.estado === 'rechazada' ? '#c0392b' : '#935116' }}>{i.estado === 'rechazada' ? 'rechazada' : 'pendiente'}</em></span>
                            <button onClick={() => deleteDoc(doc(db, COL_INVITACIONES, i.id)).catch(e => console.error(e))} style={{ ...st.btnHeader, color: '#c0392b' }} title={i.estado === 'pendiente' ? 'Cancelar invitación' : 'Quitar'}><X size={16} /></button>
                        </div>
                    ))}
                </>
            )}
        </>
    );
}

