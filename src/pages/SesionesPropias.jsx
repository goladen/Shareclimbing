import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { Plus, Timer, Trash2, Edit, Share2, Copy, ArrowUp, ArrowDown, X, Users, Save } from 'lucide-react';
import { db } from '../firebase';
import CronoEjercicio from '../components/CronoEjercicio';
import { GuiaDesplegable } from '../components/AnimacionEjercicio';
import { Tarjeta, Marco, Centro, Campo, st } from '../components/entrenamientoUI';
import { textoCarga, aEjercicioCrono, textoTiempo as tiempo } from '../utils/entrenamiento';
export { aEjercicioCrono };

// Sesiones creadas por cada usuario para hacerlas con el crono y compartirlas.
// sesiones_propias/{id} = { creadoPor, autorNombre, nombre, descripcion, ejercicios, compartidaConEmail, copiadaDe?, createdAt, updatedAt }
// ejercicio = { nombre, modo: 'tiempo'|'manual', series, trabajo, reps, pausa, descanso, descansoTras,
//               intensidad: 'ninguna'|'kg'|'suspension'|'dominada', valor, nota }
// Con intensidad en % la carga se calcula con el test de quien la hace, así una sesión compartida
// sirve a cualquiera.
const COL = 'sesiones_propias';
const MAX_EJERCICIOS = 40;

export const PLANTILLAS = {
    suspension: { nombre: 'Suspensiones', modo: 'tiempo', series: 5, trabajo: 10, reps: 1, pausa: 0, descanso: 180, descansoTras: 180, intensidad: 'suspension', valor: 80, nota: 'Regleta de 20 mm' },
    repeaters: { nombre: 'Repeaters 7/3', modo: 'tiempo', series: 4, trabajo: 7, reps: 6, pausa: 3, descanso: 180, descansoTras: 180, intensidad: 'suspension', valor: 75, nota: 'Regleta de 20 mm' },
    dominadas: { nombre: 'Dominadas lastradas', modo: 'manual', series: 5, trabajo: 0, reps: 1, pausa: 0, descanso: 180, descansoTras: 180, intensidad: 'dominada', valor: 85, nota: '3 repeticiones' },
    largas: { nombre: 'Suspensiones largas', modo: 'tiempo', series: 4, trabajo: 30, reps: 1, pausa: 0, descanso: 150, descansoTras: 180, intensidad: 'suspension', valor: 65, nota: 'Regleta de 20 mm · se progresa alargando el tiempo' },
    tendon: { nombre: 'Suspensiones suaves (tendón)', modo: 'tiempo', series: 1, trabajo: 10, reps: 20, pausa: 20, descanso: 0, descansoTras: 120, intensidad: 'suspension', valor: 40, nota: 'Con pies apoyados o polea, sin fatiga; se pueden hacer a diario' },
    unbrazo: { nombre: 'Suspensiones a un brazo', modo: 'tiempo', series: 6, trabajo: 10, reps: 1, pausa: 0, descanso: 90, descansoTras: 180, intensidad: 'suspension', valor: 40, nota: 'Alterna brazos · % del máximo a dos manos (40 % ≈ 80 % por brazo) · con contrapeso' },
    campus: { nombre: 'Campus', modo: 'manual', series: 5, trabajo: 0, reps: 1, pausa: 0, descanso: 180, descansoTras: 240, intensidad: 'ninguna', valor: 0, nota: 'Escaleras 1-3-5 / 1-4-7 · solo escaladores con experiencia' },
    bloqueos: { nombre: 'Bloqueos a un brazo', modo: 'manual', series: 6, trabajo: 0, reps: 1, pausa: 0, descanso: 90, descansoTras: 180, intensidad: 'ninguna', valor: 0, nota: '3 por brazo a 90° y 120° · alterna brazos' },
    bloque: { nombre: 'Bloques al límite', modo: 'manual', series: 6, trabajo: 0, reps: 1, pausa: 0, descanso: 180, descansoTras: 240, intensidad: 'ninguna', valor: 0, nota: 'Bloques de 3-5 intentos' },
    vacio: { nombre: '', modo: 'tiempo', series: 3, trabajo: 30, reps: 1, pausa: 0, descanso: 60, descansoTras: 120, intensidad: 'ninguna', valor: 0, nota: '' },
};
export const NOMBRES_PLANTILLA = {
    suspension: 'Suspensiones máximas', largas: 'Suspensiones largas', tendon: 'Suspensiones suaves', repeaters: 'Repeaters',
    unbrazo: 'A un brazo', campus: 'Campus', dominadas: 'Dominadas', bloqueos: 'Bloqueos a un brazo', bloque: 'Bloque', vacio: 'En blanco',
};


const duracionAprox = (ejercicios) => Math.round(ejercicios.reduce((t, e) => {
    const trabajo = e.modo === 'tiempo' ? e.series * (e.reps * e.trabajo + (e.reps - 1) * e.pausa) : e.series * 40;
    return t + trabajo + (e.series - 1) * e.descanso + e.descansoTras;
}, 0) / 60);

// ───────────────────────────── Lista ─────────────────────────────

export function ListaSesiones({ uid, email, onAbrir, onNueva, onVolver }) {
    const [mias, setMias] = useState(null);
    const [compartidas, setCompartidas] = useState(null);

    useEffect(() => onSnapshot(query(collection(db, COL), where('creadoPor', '==', uid)),
        (snap) => setMias(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))),
        (e) => { console.error(e); setMias([]); }), [uid]);
    useEffect(() => {
        if (!email) { setCompartidas([]); return; }
        return onSnapshot(query(collection(db, COL), where('compartidaConEmail', 'array-contains', email.toLowerCase())),
            (snap) => setCompartidas(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            (e) => { console.error(e); setCompartidas([]); });
    }, [email]);

    const fila = (s, compartida) => (
        <button key={s.id} onClick={() => onAbrir(s.id)}
            style={{ textAlign: 'left', padding: '12px 14px', background: 'white', border: '1px solid #dfe4ea', borderRadius: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%' }}>
            <span style={{ minWidth: 0 }}>
                <strong style={{ color: '#2c3e50' }}>{s.nombre}</strong>
                <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d', marginTop: 2 }}>
                    {s.ejercicios?.length || 0} ejercicios · ~{duracionAprox(s.ejercicios || [])} min
                    {compartida && ` · de ${s.autorNombre || 'otro usuario'}`}
                    {!compartida && s.compartidaConEmail?.length ? ` · compartida con ${s.compartidaConEmail.length}` : ''}
                </span>
            </span>
            <Timer size={18} style={{ color: '#2471a3', flexShrink: 0 }} />
        </button>
    );

    return (
        <Marco titulo="Mis sesiones" subtitulo="Sesiones propias con crono" onVolver={onVolver}
            accion={<button onClick={onNueva} style={st.btnPrincipal}><Plus size={16} /> Nueva</button>}>
            <div style={st.columna}>
                {mias === null ? <Centro>Cargando…</Centro> : mias.length === 0 ? (
                    <Tarjeta estilo={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem' }}>⏱️</div>
                        <h3 style={st.h3}>Crea tu primera sesión</h3>
                        <p style={st.texto}>Elige ejercicios, series, tiempos y descansos, y el crono te guiará pitando en cada cambio. Puedes compartirla con quien quieras.</p>
                        <button onClick={onNueva} style={st.btnPrincipal}><Plus size={16} /> Nueva sesión</button>
                    </Tarjeta>
                ) : mias.map(s => fila(s, false))}

                {compartidas?.length > 0 && (
                    <>
                        <h3 style={{ ...st.h3, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={16} /> Compartidas conmigo</h3>
                        {compartidas.map(s => fila(s, true))}
                    </>
                )}
            </div>
        </Marco>
    );
}

// ───────────────────────────── Ver / hacer ─────────────────────────────

export function VerSesion({ id, uid, email, nombreUsuario, test, onEditar, onVolver, onAbrir }) {
    const [sesion, setSesion] = useState(undefined);
    const [crono, setCrono] = useState(null);
    const [nuevoEmail, setNuevoEmail] = useState('');
    const ref = doc(db, COL, id);

    useEffect(() => onSnapshot(ref,
        (snap) => setSesion(snap.exists() ? { id: snap.id, ...snap.data() } : null),
        (e) => { console.error(e); setSesion(null); }), [id]); // eslint-disable-line

    if (sesion === undefined) return <Marco titulo="Sesión" onVolver={onVolver}><Centro>Cargando…</Centro></Marco>;
    if (sesion === null) return <Marco titulo="Sesión" onVolver={onVolver}><Centro>Esta sesión no existe o ya no está compartida.</Centro></Marco>;

    const mia = sesion.creadoPor === uid;
    const ejercicios = (sesion.ejercicios || []).map(e => aEjercicioCrono(e, test));
    const enlace = `${window.location.origin}${window.location.pathname}#/sesion/${id}`;
    const miEmail = email?.toLowerCase();

    const compartirEmail = () => {
        const e = nuevoEmail.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return alert('Escribe un email válido.');
        if (e === miEmail) return alert('Ese es tu email.');
        updateDoc(ref, { compartidaConEmail: arrayUnion(e), updatedAt: serverTimestamp() }).catch(err => { console.error(err); alert('No se pudo compartir.'); });
        setNuevoEmail('');
    };
    const quitarEmail = (e) => updateDoc(ref, { compartidaConEmail: arrayRemove(e), updatedAt: serverTimestamp() }).catch(err => console.error(err));
    const compartirEnlace = async () => {
        if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
            try { await navigator.share({ title: sesion.nombre, url: enlace }); return; } catch { /* cancelado */ }
        }
        navigator.clipboard.writeText(enlace).then(() => alert('Enlace copiado. Quien lo abra con su cuenta podrá ver la sesión y guardar una copia.'));
    };
    const guardarCopia = () => {
        const nueva = doc(collection(db, COL));
        setDoc(nueva, {
            creadoPor: uid, autorNombre: nombreUsuario || '', nombre: sesion.nombre.slice(0, 80), descripcion: sesion.descripcion || '',
            ejercicios: sesion.ejercicios, compartidaConEmail: [], copiadaDe: sesion.id,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        }).catch(e => { console.error(e); alert('No se pudo guardar la copia.'); });
        onAbrir(nueva.id);
    };
    const dejarDeVer = () => {
        if (!window.confirm('¿Quitar esta sesión de las compartidas contigo?')) return;
        updateDoc(ref, { compartidaConEmail: arrayRemove(miEmail) }).catch(e => console.error(e));
        onVolver();
    };
    const eliminar = () => {
        if (!window.confirm(`¿Eliminar «${sesion.nombre}»? Dejará de verla también la gente con la que la compartiste.`)) return;
        deleteDoc(ref).catch(e => console.error(e));
        onVolver();
    };

    return (
        <Marco titulo={sesion.nombre} subtitulo={`${ejercicios.length} ejercicios · ~${duracionAprox(sesion.ejercicios || [])} min${mia ? '' : ` · de ${sesion.autorNombre || 'otro usuario'}`}`} onVolver={onVolver}
            accion={mia ? <button onClick={() => onEditar(id)} style={st.btnHeader} title="Editar"><Edit size={18} /></button> : null}>
            {crono && <CronoEjercicio titulo={crono.titulo} ejercicios={crono.ejercicios} pesoCorporal={test?.peso || 0} onCerrar={() => setCrono(null)} />}
            <div style={st.columna}>
                {sesion.descripcion && <Tarjeta><p style={{ ...st.texto, margin: 0, whiteSpace: 'pre-wrap' }}>{sesion.descripcion}</p></Tarjeta>}

                <button onClick={() => setCrono({ titulo: sesion.nombre, ejercicios })} disabled={!ejercicios.length}
                    style={{ ...st.btnPrincipal, background: '#2471a3', justifyContent: 'center', padding: '12px 14px', fontSize: '0.95rem' }}>
                    <Timer size={18} /> Empezar con el crono
                </button>

                {ejercicios.map((e, i) => (
                    <Tarjeta key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <h3 style={{ ...st.h3, margin: 0 }}>{i + 1}. {e.nombre}</h3>
                            {e.carga != null && (
                                <span style={st.carga}>
                                    {textoCarga(e.carga)}
                                    {test?.peso ? <span style={{ fontWeight: 'normal', fontSize: '0.75rem', marginLeft: 6 }}>total {Math.round((test.peso + e.carga) * 2) / 2} kg</span> : null}
                                </span>
                            )}
                        </div>
                        {e.porcentaje != null && (
                            <div style={{ fontSize: '0.8rem', color: '#2471a3', fontWeight: 600, marginTop: 4 }}>
                                {e.porcentaje} % {e.porcentajeDe}{e.sinTest ? ' · haz el test de entrenamiento para ver los kg' : ''}
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '6px 0' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#2c3e50' }}>{e.principal}</div>
                            <button onClick={() => setCrono({ titulo: e.nombre, ejercicios: [e] })} style={{ ...st.btnSecundario, flexShrink: 0 }}><Timer size={14} /> Solo este</button>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#7f8c8d' }}>
                            {e.crono.descanso > 0 && e.crono.series > 1 && `Descanso entre series ${tiempo(e.crono.descanso)}`}
                            {i < ejercicios.length - 1 && e.crono.descansoTras > 0 && ` · antes del siguiente ${tiempo(e.crono.descansoTras)}`}
                            {e.nota && e.crono.trabajo ? ` · ${e.nota}` : ''}
                        </div>
                        <GuiaDesplegable ejercicio={e} />
                    </Tarjeta>
                ))}

                {mia ? (
                    <Tarjeta>
                        <h3 style={{ ...st.h3, display: 'flex', alignItems: 'center', gap: 6 }}><Share2 size={16} /> Compartir</h3>
                        <p style={st.texto}>Con su email aparece en «Compartidas conmigo». Con la carga en %, cada persona ve los kg según su propio test.</p>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input type="email" value={nuevoEmail} onChange={(e) => setNuevoEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && compartirEmail()}
                                placeholder="email de su cuenta" style={st.input} />
                            <button onClick={compartirEmail} style={st.btnPrincipal}><Plus size={16} /></button>
                        </div>
                        {(sesion.compartidaConEmail || []).map(e => (
                            <div key={e} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '6px 0', borderBottom: '1px solid #f0f2f5' }}>
                                {e}
                                <button onClick={() => quitarEmail(e)} style={{ ...st.btnHeader, color: '#c0392b' }} title="Dejar de compartir"><X size={16} /></button>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                            <button onClick={compartirEnlace} style={st.btnSecundario}><Share2 size={14} /> Compartir enlace</button>
                            <button onClick={eliminar} style={{ ...st.btnSecundario, color: '#c0392b', borderColor: '#e6b0aa' }}><Trash2 size={14} /> Eliminar</button>
                        </div>
                    </Tarjeta>
                ) : (
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={guardarCopia} style={st.btnPrincipal}><Copy size={16} /> Guardar una copia para editarla</button>
                        {miEmail && sesion.compartidaConEmail?.includes(miEmail) && (
                            <button onClick={dejarDeVer} style={st.btnSecundario}><X size={14} /> Quitar de compartidas</button>
                        )}
                    </div>
                )}
            </div>
        </Marco>
    );
}

// ───────────────────────────── Editor ─────────────────────────────

const ENTEROS = ['series', 'trabajo', 'reps', 'pausa', 'descanso', 'descansoTras'];
const LIMITES = { series: [1, 50], trabajo: [1, 3600], reps: [1, 50], pausa: [0, 600], descanso: [0, 1800], descansoTras: [0, 1800], valor: [-200, 200] };

export function limpiar(ej) {
    const e = { ...ej, nombre: (ej.nombre || '').trim().slice(0, 60), nota: (ej.nota || '').trim().slice(0, 120) };
    for (const k of [...ENTEROS, 'valor']) {
        const [min, max] = LIMITES[k];
        let v = Number(String(ej[k] ?? '').replace(',', '.'));
        if (!Number.isFinite(v)) v = min;
        if (ENTEROS.includes(k)) v = Math.round(v);
        e[k] = Math.min(max, Math.max(min, v));
    }
    if (e.modo !== 'tiempo') { e.trabajo = 0; e.reps = 1; e.pausa = 0; }
    if (e.intensidad === 'ninguna') e.valor = 0;
    return e;
}

export function EditorSesion({ id, uid, nombreUsuario, onGuardada, onCancelar }) {
    const [datos, setDatos] = useState(id ? null : { nombre: '', descripcion: '', ejercicios: [] });

    useEffect(() => {
        if (!id) return;
        return onSnapshot(doc(db, COL, id), (snap) => {
            if (snap.exists()) setDatos(d => d ?? { nombre: snap.data().nombre, descripcion: snap.data().descripcion || '', ejercicios: snap.data().ejercicios || [] });
        }, (e) => console.error(e));
    }, [id]);

    if (!datos) return <Marco titulo="Editar sesión" onVolver={onCancelar}><Centro>Cargando…</Centro></Marco>;

    const setEj = (i, cambios) => setDatos({ ...datos, ejercicios: datos.ejercicios.map((e, j) => j === i ? { ...e, ...cambios } : e) });
    const mover = (i, d) => {
        const l = [...datos.ejercicios];
        [l[i], l[i + d]] = [l[i + d], l[i]];
        setDatos({ ...datos, ejercicios: l });
    };
    const anadir = (k) => {
        if (datos.ejercicios.length >= MAX_EJERCICIOS) return;
        setDatos({ ...datos, ejercicios: [...datos.ejercicios, { ...PLANTILLAS[k] }] });
    };

    const guardar = () => {
        const nombre = datos.nombre.trim().slice(0, 80);
        if (!nombre) return alert('Ponle un nombre a la sesión.');
        if (!datos.ejercicios.length) return alert('Añade al menos un ejercicio.');
        const ejercicios = datos.ejercicios.map(limpiar);
        const campos = { nombre, descripcion: datos.descripcion.trim().slice(0, 1000), ejercicios, updatedAt: serverTimestamp() };
        if (id) {
            updateDoc(doc(db, COL, id), campos).catch(e => { console.error(e); alert('No se pudo guardar.'); });
            onGuardada(id);
        } else {
            const ref = doc(collection(db, COL));
            setDoc(ref, { ...campos, creadoPor: uid, autorNombre: nombreUsuario || '', compartidaConEmail: [], createdAt: serverTimestamp() })
                .catch(e => { console.error(e); alert('No se pudo guardar.'); });
            onGuardada(ref.id);
        }
    };

    return (
        <Marco titulo={id ? 'Editar sesión' : 'Nueva sesión'} onVolver={onCancelar}
            accion={<button onClick={guardar} style={st.btnPrincipal}><Save size={16} /> Guardar</button>}>
            <div style={st.columna}>
                <Tarjeta>
                    <Campo etiqueta="Nombre"><input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} placeholder="Ej: Multipresa martes" style={st.input} /></Campo>
                    <div style={{ height: 10 }} />
                    <Campo etiqueta="Descripción (opcional)">
                        <textarea value={datos.descripcion} onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })} rows={2} style={{ ...st.input, resize: 'vertical' }} placeholder="Calentamiento, material, consejos…" />
                    </Campo>
                </Tarjeta>

                {datos.ejercicios.map((e, i) => (
                    <Tarjeta key={i}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                            <strong style={{ color: '#7f8c8d', fontSize: '0.85rem' }}>{i + 1}.</strong>
                            <input value={e.nombre} onChange={(ev) => setEj(i, { nombre: ev.target.value })} placeholder="Nombre del ejercicio" style={{ ...st.input, fontWeight: 'bold' }} />
                            <button onClick={() => mover(i, -1)} disabled={i === 0} style={{ ...st.btnSecundario, padding: 6, opacity: i === 0 ? 0.4 : 1 }}><ArrowUp size={14} /></button>
                            <button onClick={() => mover(i, 1)} disabled={i === datos.ejercicios.length - 1} style={{ ...st.btnSecundario, padding: 6, opacity: i === datos.ejercicios.length - 1 ? 0.4 : 1 }}><ArrowDown size={14} /></button>
                            <button onClick={() => setDatos({ ...datos, ejercicios: datos.ejercicios.filter((_, j) => j !== i) })} style={{ ...st.btnSecundario, padding: 6, color: '#c0392b' }}><Trash2 size={14} /></button>
                        </div>

                        <CamposEjercicio e={e} onChange={(c) => setEj(i, c)} />
                    </Tarjeta>
                ))}

                <Tarjeta estilo={{ background: '#f8f9fa' }}>
                    <div style={st.etiqueta}>Añadir ejercicio</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {Object.keys(PLANTILLAS).map(k => (
                            <button key={k} onClick={() => anadir(k)} disabled={datos.ejercicios.length >= MAX_EJERCICIOS} style={st.btnSecundario}><Plus size={14} /> {NOMBRES_PLANTILLA[k]}</button>
                        ))}
                    </div>
                </Tarjeta>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onCancelar} style={st.btnSecundario}>Cancelar</button>
                    <button onClick={guardar} style={st.btnPrincipal}><Save size={16} /> Guardar</button>
                </div>
            </div>
        </Marco>
    );
}

function Num({ etiqueta, valor, onChange, decimal }) {
    return (
        <Campo etiqueta={etiqueta}>
            <input type="number" inputMode={decimal ? 'decimal' : 'numeric'} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} style={st.input} />
        </Campo>
    );
}


// Campos de un ejercicio: modo, series, tiempos, descansos, carga y nota
export function CamposEjercicio({ e, onChange }) {
    return (
        <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                            {[['tiempo', 'Con cuenta atrás'], ['manual', 'Por repeticiones (pulso «Hecho»)']].map(([v, t]) => (
                                <button key={v} onClick={() => onChange({ modo: v, ...(v === 'tiempo' && !e.trabajo ? { trabajo: 30 } : {}) })}
                                    style={{ ...st.chip, background: e.modo === v ? '#2c3e50' : 'white', color: e.modo === v ? 'white' : '#2c3e50' }}>{t}</button>
                            ))}
                        </div>

                        <div style={st.rejilla}>
                            <Num etiqueta="Series" valor={e.series} onChange={(v) => onChange({ series: v })} />
                            {e.modo === 'tiempo' && <>
                                <Num etiqueta="Trabajo (s)" valor={e.trabajo} onChange={(v) => onChange({ trabajo: v })} />
                                <Num etiqueta="Repeticiones por serie" valor={e.reps} onChange={(v) => onChange({ reps: v })} />
                                {Number(e.reps) > 1 && <Num etiqueta="Pausa entre reps (s)" valor={e.pausa} onChange={(v) => onChange({ pausa: v })} />}
                            </>}
                            <Num etiqueta="Descanso entre series (s)" valor={e.descanso} onChange={(v) => onChange({ descanso: v })} />
                            <Num etiqueta="Descanso al acabar (s)" valor={e.descansoTras} onChange={(v) => onChange({ descansoTras: v })} />
                        </div>

                        <div style={{ ...st.rejilla, marginTop: 10 }}>
                            <Campo etiqueta="Carga">
                                <select value={e.intensidad} onChange={(ev) => onChange({ intensidad: ev.target.value, valor: ev.target.value === 'kg' ? 0 : ev.target.value === 'ninguna' ? 0 : 80 })} style={st.input}>
                                    <option value="ninguna">Sin carga</option>
                                    <option value="kg">Kg fijos</option>
                                    <option value="suspension">% de la suspensión máxima</option>
                                    <option value="dominada">% de la dominada lastrada máxima</option>
                                </select>
                            </Campo>
                            {e.intensidad !== 'ninguna' && (
                                <Num etiqueta={e.intensidad === 'kg' ? 'Kg (− si quitas peso)' : '% del máximo'} valor={e.valor} onChange={(v) => onChange({ valor: v })} decimal />
                            )}
                        </div>
                        <div style={{ marginTop: 10 }}>
                            <Campo etiqueta="Nota (opcional)"><input value={e.nota} onChange={(ev) => onChange({ nota: ev.target.value })} placeholder="Ej: regleta de 20 mm, 3 dominadas…" style={st.input} /></Campo>
                        </div>
        </>
    );
}
