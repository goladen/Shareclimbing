import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, deleteDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { Users, AlertTriangle, ChevronRight, Plus, Trash2, Save, BookOpen, Check, X, MessageSquare, RotateCcw, Lock, ClipboardList } from 'lucide-react';
import { db } from '../firebase';
import { Tarjeta, Marco, Centro, Campo, Opciones, st } from '../components/entrenamientoUI';
import { CamposEjercicio, PLANTILLAS, limpiar } from './SesionesPropias';
import {
    TIPOS_SESION, COMPONENTES, CATEGORIAS, ZONAS, prescribirSesion, siguienteSesion, sesionesHechas,
    zonasBloqueadas, textoCarga, ajustarFactores, componentesDelPlan, aEjercicioCrono,
} from '../utils/entrenamiento';
import { COL_PLANES, COL_BLOQUES, notificar, resumenAtleta, nombreDe } from '../utils/entrenador';
import { esAdmin } from '../utils/equipadores';
import { ListaPlantillas, DetallePlantilla } from './PlanesEntrenador';

const textoRpe = (r) => r <= 3 ? 'muy fácil' : r <= 6 ? 'moderado' : r <= 8 ? 'duro' : r === 9 ? 'muy duro' : 'máximo';
const ICONO_RES = { todo: '✓', casi: '≈', no: '✗' };
const COLOR_RES = { todo: '#27ae60', casi: '#e67e22', no: '#c0392b' };

// vistaInicial: 'atletas' | 'catalogo'
export default function EntrenadorPagina({ usuario, vistaInicial = 'atletas', onVolver }) {
    const [pestana, setPestana] = useState(vistaInicial);
    const [planes, setPlanes] = useState(null);
    const [abierto, setAbierto] = useState(null); // id del plan del atleta abierto
    const email = usuario.email?.toLowerCase();

    useEffect(() => {
        if (!email) { setPlanes([]); return; }
        return onSnapshot(query(collection(db, COL_PLANES), where('entrenadoresEmail', 'array-contains', email)),
            (snap) => setPlanes(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.estado === 'activo')),
            (e) => { console.error(e); setPlanes([]); });
    }, [email]);

    // Apuntarse en cada plan para recibir avisos cuando el atleta registre sesiones
    useEffect(() => {
        (planes || []).filter(p => !(p.entrenadoresUid || []).includes(usuario.uid)).forEach(p => {
            updateDoc(doc(db, COL_PLANES, p.id), { entrenadoresUid: arrayUnion(usuario.uid) }).catch(e => console.error(e));
        });
    }, [planes, usuario.uid]);

    const [plantillaAbierta, setPlantillaAbierta] = useState(null);

    const plan = abierto && planes?.find(p => p.id === abierto);
    if (plan) return <DetalleAtleta key={plan.id} plan={plan} usuario={usuario} onVolver={() => setAbierto(null)} />;
    if (plantillaAbierta) {
        return <DetallePlantilla key={plantillaAbierta} id={plantillaAbierta} usuario={usuario} planesAtletas={planes}
            onVolver={() => setPlantillaAbierta(null)} onAbrirAtleta={setAbierto} />;
    }

    const SUBTITULOS = { atletas: 'Tus atletas y su feedback', planes: 'Tus planes: uno por persona o el mismo para varias', catalogo: 'Catálogo de bloques de entrenamiento' };
    return (
        <Marco titulo="Panel del entrenador" subtitulo={SUBTITULOS[pestana]} onVolver={onVolver}>
            <div style={st.columna}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Pestana activa={pestana === 'atletas'} onClick={() => setPestana('atletas')}><Users size={15} /> Atletas</Pestana>
                    <Pestana activa={pestana === 'planes'} onClick={() => setPestana('planes')}><ClipboardList size={15} /> Mis planes</Pestana>
                    <Pestana activa={pestana === 'catalogo'} onClick={() => setPestana('catalogo')}><BookOpen size={15} /> Catálogo de bloques</Pestana>
                </div>
                {pestana === 'atletas' && <ListaAtletas planes={planes} uid={usuario.uid} onAbrir={setAbierto} />}
                {pestana === 'planes' && <ListaPlantillas usuario={usuario} planesAtletas={planes} onAbrir={setPlantillaAbierta} />}
                {pestana === 'catalogo' && <CatalogoBloques usuario={usuario} />}
            </div>
        </Marco>
    );
}

export const Pestana = ({ activa, onClick, children }) => (
    <button onClick={onClick} style={{ ...st.chip, padding: '8px 14px', fontSize: '0.88rem', background: activa ? '#2c3e50' : 'white', color: activa ? 'white' : '#2c3e50' }}>{children}</button>
);

// ───────────────────────────── Lista de atletas ─────────────────────────────

function ListaAtletas({ planes, uid, onAbrir }) {
    if (planes === null) return <Centro>Cargando…</Centro>;
    if (!planes.length) {
        return (
            <Tarjeta estilo={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem' }}>🧑‍🏫</div>
                <h3 style={st.h3}>Aún no tienes atletas</h3>
                <p style={st.texto}>Cada atleta te añade desde su plan, en «Entrenamiento → Mi entrenador», con el email de tu cuenta. Entonces aparecerá aquí con su plan y el feedback de cada sesión.</p>
            </Tarjeta>
        );
    }
    const filas = planes.map(p => ({ p, r: resumenAtleta(p, uid) }))
        .sort((a, b) => (b.r.nuevos - a.r.nuevos) || (b.r.alertas.length - a.r.alertas.length));
    return filas.map(({ p, r }) => (
        <button key={p.id} onClick={() => onAbrir(p.id)}
            style={{ textAlign: 'left', padding: '12px 14px', background: 'white', border: `1px solid ${r.alertas.length ? '#f5cba7' : '#dfe4ea'}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ color: '#2c3e50' }}>{p.atletaNombre || p.atletaEmail || 'Atleta'}</strong>
                {r.nuevos > 0 && <span style={{ marginLeft: 8, background: '#2471a3', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 'bold' }}>{r.nuevos} nueva{r.nuevos > 1 ? 's' : ''}</span>}
                <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d', marginTop: 2 }}>
                    {sesionesHechas(p)}/{p.sesiones.length} sesiones · enfoque {p.perfil?.enfoque}
                    {r.ultimo ? ` · última ${new Date(r.ultimo.fecha).toLocaleDateString()} (esfuerzo ${r.ultimo.rpe}/10)` : ' · sin sesiones'}
                </span>
                {r.alertas.length > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: '#935116', marginTop: 3 }}>
                        <AlertTriangle size={13} /> {r.alertas.join(' · ')}
                    </span>
                )}
            </span>
            <ChevronRight size={18} style={{ color: '#95a5a6' }} />
        </button>
    ));
}

// ───────────────────────────── Detalle de un atleta ─────────────────────────────

const CAMPOS_BORRADOR = ['ajustes', 'bloqueos', 'extras', 'notasEntrenador', 'comentarios', 'mensajeEntrenador'];
const borradorDe = (plan) => ({
    ajustes: plan.ajustes || {}, bloqueos: plan.bloqueos || {}, extras: plan.extras || {},
    notasEntrenador: plan.notasEntrenador || {}, comentarios: plan.comentarios || {}, mensajeEntrenador: plan.mensajeEntrenador || '',
});

function DetalleAtleta({ plan, usuario, onVolver }) {
    const [borrador, setBorrador] = useState(() => borradorDe(plan));
    const [seccion, setSeccion] = useState('feedback');
    const [anadiendo, setAnadiendo] = useState(null); // sesión a la que se añade un bloque
    const original = useMemo(() => borradorDe(plan), [plan]);
    const sucio = JSON.stringify(borrador) !== JSON.stringify(original);

    // Si el plan cambia (p. ej. el atleta registra una sesión) y no hay cambios sin guardar,
    // el borrador se actualiza para no pisar los ajustes automáticos al guardar
    const originalPrevio = useRef(original);
    useEffect(() => {
        setBorrador(b => JSON.stringify(b) === JSON.stringify(originalPrevio.current) ? original : b);
        originalPrevio.current = original;
    }, [original]);
    const planBorrador = { ...plan, ...borrador };
    const r = resumenAtleta(plan, usuario.uid);

    // Marcar el feedback como visto al abrir
    useEffect(() => {
        updateDoc(doc(db, COL_PLANES, plan.id), { [`vistoPorEntrenador.${usuario.uid}`]: new Date().toISOString() }).catch(e => console.error(e));
    }, [plan.id, usuario.uid]);

    const cambiar = (k, v) => setBorrador(b => ({ ...b, [k]: v }));

    const guardar = () => {
        const cambios = [];
        if (JSON.stringify(borrador.ajustes) !== JSON.stringify(original.ajustes)) cambios.push('cargas');
        if (JSON.stringify(borrador.bloqueos) !== JSON.stringify(original.bloqueos)) cambios.push('bloqueos por molestias');
        if (JSON.stringify(borrador.extras) !== JSON.stringify(original.extras)) cambios.push('bloques en tus sesiones');
        if (JSON.stringify(borrador.notasEntrenador) !== JSON.stringify(original.notasEntrenador)) cambios.push('notas de sesión');
        if (JSON.stringify(borrador.comentarios) !== JSON.stringify(original.comentarios)) cambios.push('comentarios a tus sesiones');
        if (borrador.mensajeEntrenador !== original.mensajeEntrenador) cambios.push('su mensaje');
        const datos = Object.fromEntries(CAMPOS_BORRADOR.map(k => [k, borrador[k]]));
        updateDoc(doc(db, COL_PLANES, plan.id), { ...datos, updatedAt: serverTimestamp() })
            .then(() => notificar([plan.creadoPor], { tipo: 'entreno_entrenador', autorNombre: nombreDe(usuario), textoPreview: `Ha cambiado: ${cambios.join(', ')}` }))
            .catch(e => { console.error(e); alert('No se pudieron guardar los cambios.'); });
    };
    const salir = () => {
        if (sucio && !window.confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return;
        onVolver();
    };

    const pendientes = plan.sesiones.filter(s => !plan.registros?.[s.id]);

    return (
        <Marco titulo={plan.atletaNombre || plan.atletaEmail || 'Atleta'}
            subtitulo={`${plan.plantillaNombre ? `«${plan.plantillaNombre}» · ` : ""}${sesionesHechas(plan)}/${plan.sesiones.length} sesiones · ${plan.semanas} semanas`}
            onVolver={salir}>
            {anadiendo && (
                <SelectorBloque usuario={usuario} sesion={anadiendo} plan={plan}
                    onCerrar={() => setAnadiendo(null)}
                    onElegir={(bloque, todasDelTipo) => {
                        const destino = todasDelTipo ? pendientes.filter(s => s.tipo === anadiendo.tipo) : [anadiendo];
                        const extras = { ...borrador.extras };
                        destino.forEach(s => { extras[s.id] = [...(extras[s.id] || []), bloque]; });
                        cambiar('extras', extras);
                        setAnadiendo(null);
                    }} />
            )}
            <div style={{ ...st.columna, paddingBottom: sucio ? 70 : 0 }}>
                {r.alertas.length > 0 && <div style={st.aviso}><AlertTriangle size={16} style={{ flexShrink: 0 }} /><span>Atención: {r.alertas.join(' · ')}</span></div>}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Pestana activa={seccion === 'feedback'} onClick={() => setSeccion('feedback')}><MessageSquare size={15} /> Feedback</Pestana>
                    <Pestana activa={seccion === 'cargas'} onClick={() => setSeccion('cargas')}>Cargas</Pestana>
                    <Pestana activa={seccion === 'sesiones'} onClick={() => setSeccion('sesiones')}>Próximas sesiones</Pestana>
                    <Pestana activa={seccion === 'perfil'} onClick={() => setSeccion('perfil')}>Test y mensaje</Pestana>
                </div>

                {seccion === 'feedback' && <Feedback plan={plan} comentarios={borrador.comentarios} onComentar={(id, t) => cambiar('comentarios', { ...borrador.comentarios, [id]: t })} />}
                {seccion === 'cargas' && <AjusteCargas plan={planBorrador} borrador={borrador} cambiar={cambiar} />}
                {seccion === 'sesiones' && (
                    <ProximasSesiones plan={planBorrador} pendientes={pendientes} borrador={borrador} cambiar={cambiar} onAnadir={setAnadiendo} />
                )}
                {seccion === 'perfil' && <PerfilYMensaje plan={plan} mensaje={borrador.mensajeEntrenador} onMensaje={(t) => cambiar('mensajeEntrenador', t)} />}
            </div>

            {sucio && (
                <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#2c3e50', padding: '10px 16px', display: 'flex', justifyContent: 'center', gap: 8, zIndex: 20 }}>
                    <button onClick={() => setBorrador(original)} style={{ ...st.btnSecundario, background: 'transparent', color: 'white', borderColor: 'rgba(255,255,255,0.4)' }}><RotateCcw size={14} /> Descartar</button>
                    <button onClick={guardar} style={st.btnPrincipal}><Save size={16} /> Guardar y avisar al atleta</button>
                </div>
            )}
        </Marco>
    );
}

function Feedback({ plan, comentarios, onComentar }) {
    const registros = Object.entries(plan.registros || {}).map(([id, reg]) => ({ id, ...reg })).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    if (!registros.length) return <Tarjeta><p style={{ ...st.texto, margin: 0 }}>El atleta aún no ha registrado ninguna sesión.</p></Tarjeta>;
    return registros.map(reg => {
        const s = plan.sesiones.find(x => x.id === reg.id);
        return (
            <Tarjeta key={reg.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: '#2c3e50' }}>{TIPOS_SESION[s?.tipo] || 'Sesión'} · semana {s?.semana}</strong>
                    <span style={{ fontSize: '0.8rem', color: '#7f8c8d' }}>{new Date(reg.fecha).toLocaleDateString()}</span>
                </div>
                {reg.saltada ? <p style={{ ...st.texto, margin: '6px 0 0' }}>Saltada</p> : (
                    <>
                        <div style={{ fontSize: '0.82rem', color: '#555', margin: '4px 0 6px' }}>
                            Esfuerzo <strong>{reg.rpe}/10</strong> ({textoRpe(reg.rpe)})
                            {reg.estadoHoy && ` · durmió ${reg.estadoHoy.sueno}, ${reg.estadoHoy.fatiga}`}
                        </div>
                        {reg.molestia && (
                            <div style={{ ...st.aviso, padding: '6px 10px', marginBottom: 6 }}>
                                <AlertTriangle size={14} style={{ flexShrink: 0 }} /> Molestias en {reg.molestia.zona}{reg.molestia.nivel ? ` (${reg.molestia.nivel})` : ''}
                            </div>
                        )}
                        {(reg.prescripcion || []).map(e => (
                            <div key={e.clave} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.83rem', padding: '3px 0', borderTop: '1px solid #f0f2f5' }}>
                                <span>{e.nombre}: {e.principal}{e.carga != null ? ` · ${textoCarga(e.carga)}` : ''}{e.porcentaje != null ? ` · ${e.porcentaje} %` : ''}</span>
                                <strong style={{ color: COLOR_RES[reg.resultados?.[e.clave]] }}>{ICONO_RES[reg.resultados?.[e.clave]] || ''}</strong>
                            </div>
                        ))}
                        {reg.notas && <p style={{ ...st.texto, fontStyle: 'italic', margin: '6px 0 0' }}>«{reg.notas}»</p>}
                    </>
                )}
                <textarea value={comentarios[reg.id] || ''} onChange={(e) => onComentar(reg.id, e.target.value.slice(0, 1000))} rows={2}
                    placeholder="Comentario para el atleta sobre esta sesión…" style={{ ...st.input, resize: 'vertical', marginTop: 8 }} />
            </Tarjeta>
        );
    });
}

function AjusteCargas({ plan, borrador, cambiar }) {
    const comps = componentesDelPlan(plan);
    const pendientes = plan.sesiones.filter(s => !plan.registros?.[s.id]);
    const [zonaNueva, setZonaNueva] = useState('dedos');
    const [diasNueva, setDiasNueva] = useState(7);

    // Cómo queda cada ejercicio en la próxima sesión que lo incluye
    const vista = (k) => {
        const s = pendientes.find(x => x.componentes.includes(k));
        return s ? prescribirSesion(plan, s).ejercicios.find(e => e.clave === k) : null;
    };
    const ajustar = (claves, pct) => cambiar('ajustes', ajustarFactores(borrador.ajustes, claves, pct));
    const bloqueos = zonasBloqueadas(plan);

    return (
        <>
            <Tarjeta>
                <h3 style={st.h3}>Ajuste rápido</h3>
                <p style={st.texto}>Se aplica a las próximas sesiones y se suma a los ajustes automáticos según el feedback. Límite entre el 70 % y el 130 % de lo calculado por el test.</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, marginRight: 4 }}>Todo:</span>
                    {[-10, -5, 5, 10].map(p => <BotonPct key={p} p={p} onClick={() => ajustar(comps, p)} />)}
                    <button onClick={() => ajustar(comps, null)} style={st.btnSecundario}><RotateCcw size={13} /> Restablecer</button>
                </div>
            </Tarjeta>
            {comps.map(k => {
                const e = vista(k);
                const f = borrador.ajustes[k] ?? 1;
                return (
                    <Tarjeta key={k}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <strong style={{ color: '#2c3e50' }}>{COMPONENTES[k].nombre}</strong>
                            <span style={{ fontSize: '0.82rem', color: f === 1 ? '#7f8c8d' : f > 1 ? '#27ae60' : '#e67e22', fontWeight: 600 }}>
                                {f === 1 ? 'Sin ajuste' : `${f > 1 ? '+' : ''}${Math.round((f - 1) * 100)} %`}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#555', margin: '4px 0 8px' }}>
                            {e ? <>Próxima: <strong>{e.principal}</strong>{e.carga != null ? ` · ${textoCarga(e.carga)}` : ''}{e.porcentaje != null ? ` · ${e.porcentaje} % ${e.porcentajeDe}` : ''}</>
                                : 'No queda ninguna sesión con este ejercicio (o está bloqueado por molestias).'}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {[-10, -5, 5, 10].map(p => <BotonPct key={p} p={p} onClick={() => ajustar([k], p)} />)}
                            {f !== 1 && <button onClick={() => ajustar([k], null)} style={st.btnSecundario}><RotateCcw size={13} /></button>}
                        </div>
                    </Tarjeta>
                );
            })}
            <Tarjeta>
                <h3 style={{ ...st.h3, display: 'flex', alignItems: 'center', gap: 6 }}><Lock size={15} /> Bloqueos por molestias</h3>
                <p style={st.texto}>Mientras dure, se quitan los ejercicios que cargan esa zona.</p>
                {bloqueos.length === 0 && <p style={{ ...st.texto, color: '#7f8c8d' }}>Ninguno activo.</p>}
                {bloqueos.map(b => (
                    <div key={b.zona} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '5px 0', borderBottom: '1px solid #f0f2f5' }}>
                        <span>{ZONAS[b.zona]} · hasta el {new Date(b.hasta).toLocaleDateString()}</span>
                        <button onClick={() => { const n = { ...borrador.bloqueos }; delete n[b.zona]; cambiar('bloqueos', n); }} style={{ ...st.btnSecundario, padding: '4px 8px' }}>Quitar</button>
                    </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={zonaNueva} onChange={(e) => setZonaNueva(e.target.value)} style={{ ...st.input, width: 'auto' }}>
                        {Object.entries(ZONAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select value={diasNueva} onChange={(e) => setDiasNueva(Number(e.target.value))} style={{ ...st.input, width: 'auto' }}>
                        {[3, 7, 14, 21, 28].map(d => <option key={d} value={d}>{d} días</option>)}
                    </select>
                    <button onClick={() => cambiar('bloqueos', { ...borrador.bloqueos, [zonaNueva]: { hasta: new Date(Date.now() + diasNueva * 86400000).toISOString(), nivel: 'entrenador' } })}
                        style={st.btnSecundario}><Plus size={14} /> Bloquear</button>
                </div>
            </Tarjeta>
        </>
    );
}

const BotonPct = ({ p, onClick }) => (
    <button onClick={onClick} style={{ ...st.btnSecundario, minWidth: 54, justifyContent: 'center', color: p > 0 ? '#27ae60' : '#c0392b' }}>{p > 0 ? '+' : ''}{p} %</button>
);

function ProximasSesiones({ plan, pendientes, borrador, cambiar, onAnadir }) {
    const [todas, setTodas] = useState(false);
    if (!pendientes.length) return <Tarjeta><p style={{ ...st.texto, margin: 0 }}>No quedan sesiones pendientes en este plan.</p></Tarjeta>;
    const lista = todas ? pendientes : pendientes.slice(0, 6);
    const siguiente = siguienteSesion(plan);
    return (
        <>
            {lista.map(s => {
                const presc = prescribirSesion(plan, s);
                const extras = borrador.extras[s.id] || [];
                return (
                    <Tarjeta key={s.id} estilo={siguiente?.id === s.id ? { borderColor: '#27ae60', borderWidth: 2 } : null}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong style={{ color: '#2c3e50' }}>{TIPOS_SESION[s.tipo]} · semana {s.semana}, día {s.orden}</strong>
                            {siguiente?.id === s.id && <span style={{ fontSize: '0.75rem', color: '#27ae60', fontWeight: 'bold' }}>SIGUIENTE</span>}
                        </div>
                        <div style={{ fontSize: '0.83rem', color: '#555', margin: '6px 0' }}>
                            {presc.ejercicios.filter(e => !e.extra).map(e => (
                                <div key={e.clave}>{e.nombre}: {e.principal}{e.carga != null ? ` · ${textoCarga(e.carga)}` : ''}{e.porcentaje != null ? ` · ${e.porcentaje} %` : ''}</div>
                            ))}
                        </div>
                        {extras.map((b, i) => {
                            const e = aEjercicioCrono(b, plan.test);
                            return (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: '#eaf2f8', borderRadius: 8, padding: '6px 10px', marginBottom: 4, fontSize: '0.83rem' }}>
                                    <span><strong>+ {e.nombre}</strong>: {e.principal}{e.carga != null ? ` · ${textoCarga(e.carga)}` : ''}{e.porcentaje != null ? ` · ${e.porcentaje} %` : ''}</span>
                                    <button onClick={() => cambiar('extras', { ...borrador.extras, [s.id]: extras.filter((_, j) => j !== i) })} style={{ ...st.btnHeader, color: '#c0392b' }} title="Quitar"><Trash2 size={14} /></button>
                                </div>
                            );
                        })}
                        <textarea value={borrador.notasEntrenador[s.id] || ''} onChange={(e) => cambiar('notasEntrenador', { ...borrador.notasEntrenador, [s.id]: e.target.value.slice(0, 500) })}
                            rows={1} placeholder="Nota para esta sesión (la verá al empezarla)…" style={{ ...st.input, resize: 'vertical', marginTop: 4 }} />
                        <button onClick={() => onAnadir(s)} style={{ ...st.btnSecundario, marginTop: 8 }}><Plus size={14} /> Añadir bloque</button>
                    </Tarjeta>
                );
            })}
            {!todas && pendientes.length > lista.length && (
                <button onClick={() => setTodas(true)} style={st.btnSecundario}>Ver las {pendientes.length} sesiones pendientes</button>
            )}
        </>
    );
}

function PerfilYMensaje({ plan, mensaje, onMensaje }) {
    const t = plan.test || {};
    const datos = [
        ['Peso', t.peso != null && `${t.peso} kg`], ['Años escalando', t.experiencia], ['Grado vía', t.gradoVia], ['Grado bloque', t.gradoBloque],
        ['Suspensión 20 mm', t.suspension != null && textoCarga(t.suspension)], ['Dominadas', t.dominadas],
        ['Lastre en dominada', t.dominadaLastre != null && `+${t.dominadaLastre} kg`], ['Repeaters 7/3', t.repeaters], ['Elevaciones', t.core],
        ['Días / semana', t.dias], ['Objetivo', t.objetivo],
    ].filter(([, v]) => v != null && v !== '' && v !== false);
    return (
        <>
            <Tarjeta>
                <h3 style={st.h3}>Mensaje general para el atleta</h3>
                <textarea value={mensaje} onChange={(e) => onMensaje(e.target.value.slice(0, 2000))} rows={4}
                    placeholder="Objetivos del bloque, consejos, qué vigilar… Lo verá en la portada de su plan." style={{ ...st.input, resize: 'vertical' }} />
            </Tarjeta>
            <Tarjeta>
                <h3 style={st.h3}>Test</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '4px 14px', fontSize: '0.85rem' }}>
                    {datos.map(([k, v]) => <div key={k}><span style={{ color: '#7f8c8d' }}>{k}:</span> <strong>{v}</strong></div>)}
                </div>
                {plan.perfil?.debilidades?.length > 0 && <p style={{ ...st.texto, marginTop: 8 }}>Puntos débiles: {plan.perfil.debilidades.join(', ')}</p>}
            </Tarjeta>
        </>
    );
}

// ───────────────────────────── Añadir un bloque a una sesión ─────────────────────────────

const BLOQUE_VACIO = { ...PLANTILLAS.vacio, categoria: 'otro', descripcion: '' };

export function SelectorBloque({ usuario, sesion, onElegir, onCerrar }) {
    const [modo, setModo] = useState('catalogo');
    const [catalogo, setCatalogo] = useState(null);
    const [nuevo, setNuevo] = useState(BLOQUE_VACIO);
    const [todasDelTipo, setTodasDelTipo] = useState(false);
    const [proponer, setProponer] = useState(false);

    useEffect(() => onSnapshot(query(collection(db, COL_BLOQUES), where('estado', '==', 'aprobado')),
        (snap) => setCatalogo(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nombre.localeCompare(b.nombre))),
        (e) => { console.error(e); setCatalogo([]); }), []);

    const deCatalogo = (b) => onElegir({ ...limpiar(b.ejercicio || {}), nombre: b.nombre, categoria: b.categoria || 'otro', descripcion: b.descripcion || '', bloqueId: b.id }, todasDelTipo);
    const propio = () => {
        if (!nuevo.nombre?.trim()) return alert('Ponle un nombre al bloque.');
        const ej = limpiar(nuevo);
        const bloque = { ...ej, categoria: nuevo.categoria, descripcion: (nuevo.descripcion || '').slice(0, 1000), bloqueId: null };
        if (proponer) proponerBloque(usuario, bloque);
        onElegir(bloque, todasDelTipo);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onCerrar}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#f4f6f8', width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', borderRadius: '14px 14px 0 0', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h3 style={{ ...st.h3, margin: 0 }}>Añadir a {TIPOS_SESION[sesion.tipo]} · semana {sesion.semana}</h3>
                    <button onClick={onCerrar} style={{ ...st.btnHeader, color: '#2c3e50' }}><X size={20} /></button>
                </div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 10 }}>
                    <input type="checkbox" checked={todasDelTipo} onChange={(e) => setTodasDelTipo(e.target.checked)} /> Añadir a todas las sesiones pendientes de {TIPOS_SESION[sesion.tipo]}
                </label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <Pestana activa={modo === 'catalogo'} onClick={() => setModo('catalogo')}>Del catálogo</Pestana>
                    <Pestana activa={modo === 'nuevo'} onClick={() => setModo('nuevo')}>Bloque propio</Pestana>
                </div>
                {modo === 'catalogo' ? (
                    catalogo === null ? <Centro>Cargando…</Centro> : !catalogo.length ? (
                        <Tarjeta><p style={{ ...st.texto, margin: 0 }}>El catálogo aún está vacío. Crea un bloque propio y márcalo para proponerlo.</p></Tarjeta>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {catalogo.map(b => <FichaBloque key={b.id} bloque={b} accion={<button onClick={() => deCatalogo(b)} style={st.btnPrincipal}><Plus size={14} /> Añadir</button>} />)}
                        </div>
                    )
                ) : (
                    <Tarjeta>
                        <FormBloque bloque={nuevo} onChange={setNuevo} />
                        <label style={{ display: 'block', fontSize: '0.85rem', margin: '10px 0' }}>
                            <input type="checkbox" checked={proponer} onChange={(e) => setProponer(e.target.checked)} /> Proponerlo también al catálogo (lo revisa la administración)
                        </label>
                        <button onClick={propio} style={st.btnPrincipal}><Plus size={14} /> Añadir a la sesión</button>
                    </Tarjeta>
                )}
            </div>
        </div>
    );
}

function FormBloque({ bloque, onChange }) {
    return (
        <>
            <div style={st.rejilla}>
                <Campo etiqueta="Nombre"><input value={bloque.nombre} onChange={(e) => onChange({ ...bloque, nombre: e.target.value })} placeholder="Ej: Campus en regletas" style={st.input} /></Campo>
                <Campo etiqueta="Categoría">
                    <select value={bloque.categoria} onChange={(e) => onChange({ ...bloque, categoria: e.target.value })} style={st.input}>
                        {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </Campo>
            </div>
            <div style={{ margin: '10px 0' }}>
                <Campo etiqueta="Descripción y técnica">
                    <textarea value={bloque.descripcion} onChange={(e) => onChange({ ...bloque, descripcion: e.target.value })} rows={2} style={{ ...st.input, resize: 'vertical' }}
                        placeholder="Cómo se hace, para qué sirve, a quién no se lo pondrías…" />
                </Campo>
            </div>
            <CamposEjercicio e={bloque} onChange={(c) => onChange({ ...bloque, ...c })} />
        </>
    );
}

function FichaBloque({ bloque, accion, pie }) {
    const e = aEjercicioCrono({ ...bloque.ejercicio, nombre: bloque.nombre }, null);
    return (
        <Tarjeta>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                    <strong style={{ color: '#2c3e50' }}>{bloque.nombre}</strong>
                    <span style={{ ...st.chip, marginLeft: 6, padding: '1px 8px', fontSize: '0.72rem', cursor: 'default' }}>{CATEGORIAS[bloque.categoria] || 'Otro'}</span>
                    <div style={{ fontSize: '0.83rem', color: '#555', marginTop: 3 }}>
                        {e.principal}{e.porcentaje != null ? ` · ${e.porcentaje} % ${e.porcentajeDe}` : ''}{e.carga != null ? ` · ${textoCarga(e.carga)}` : ''}
                    </div>
                    {bloque.descripcion && <p style={{ ...st.texto, margin: '4px 0 0', fontSize: '0.8rem' }}>{bloque.descripcion}</p>}
                    <div style={{ fontSize: '0.75rem', color: '#95a5a6', marginTop: 3 }}>Propuesto por {bloque.autorNombre || 'un entrenador'}</div>
                </div>
                {accion}
            </div>
            {pie}
        </Tarjeta>
    );
}

function proponerBloque(usuario, bloque) {
    const { categoria, descripcion, bloqueId, nombre, ...ejercicio } = bloque;
    return setDoc(doc(collection(db, COL_BLOQUES)), {
        autorUid: usuario.uid, autorNombre: nombreDe(usuario), nombre: nombre.slice(0, 80),
        categoria: categoria || 'otro', descripcion: descripcion || '', ejercicio: { ...ejercicio, nombre: nombre.slice(0, 80) },
        estado: 'pendiente', createdAt: serverTimestamp(),
    }).catch(e => { console.error(e); alert('No se pudo enviar la propuesta.'); });
}

// ───────────────────────────── Catálogo de bloques ─────────────────────────────

function CatalogoBloques({ usuario }) {
    const admin = esAdmin(usuario);
    const [aprobados, setAprobados] = useState(null);
    const [mios, setMios] = useState([]);
    const [pendientes, setPendientes] = useState([]);
    const [nuevo, setNuevo] = useState(null);
    const [filtro, setFiltro] = useState('todas');

    useEffect(() => onSnapshot(query(collection(db, COL_BLOQUES), where('estado', '==', 'aprobado')),
        (snap) => setAprobados(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nombre.localeCompare(b.nombre))),
        (e) => { console.error(e); setAprobados([]); }), []);
    useEffect(() => onSnapshot(query(collection(db, COL_BLOQUES), where('autorUid', '==', usuario.uid)),
        (snap) => setMios(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.estado !== 'aprobado')),
        (e) => console.error(e)), [usuario.uid]);
    useEffect(() => {
        if (!admin) return;
        return onSnapshot(query(collection(db, COL_BLOQUES), where('estado', '==', 'pendiente')),
            (snap) => setPendientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    }, [admin]);

    const enviar = () => {
        if (!nuevo.nombre?.trim()) return alert('Ponle un nombre al bloque.');
        proponerBloque(usuario, { ...limpiar(nuevo), categoria: nuevo.categoria, descripcion: (nuevo.descripcion || '').slice(0, 1000) });
        setNuevo(null);
        alert('Propuesta enviada. Te avisaremos cuando se revise.');
    };
    const revisar = (b, aprobar) => {
        const motivo = aprobar ? '' : window.prompt('Motivo del rechazo (lo verá quien lo propuso):', '');
        if (!aprobar && motivo === null) return;
        updateDoc(doc(db, COL_BLOQUES, b.id), { estado: aprobar ? 'aprobado' : 'rechazado', motivo: (motivo || '').slice(0, 500), revisadoAt: serverTimestamp() })
            .then(() => notificar([b.autorUid], { tipo: aprobar ? 'bloque_aprobado' : 'bloque_rechazado', autorNombre: 'Administración', bloqueNombre: b.nombre, textoPreview: motivo || '' }))
            .catch(e => { console.error(e); alert('No se pudo guardar.'); });
    };
    const quitarDelCatalogo = (b) => {
        if (!window.confirm(`¿Quitar «${b.nombre}» del catálogo? Las sesiones donde ya se añadió no cambian.`)) return;
        deleteDoc(doc(db, COL_BLOQUES, b.id)).catch(e => console.error(e));
    };

    const visibles = (aprobados || []).filter(b => filtro === 'todas' || b.categoria === filtro);

    return (
        <>
            {admin && pendientes.length > 0 && (
                <>
                    <h3 style={{ ...st.h3, color: '#935116' }}>Pendientes de revisar ({pendientes.length})</h3>
                    {pendientes.map(b => (
                        <FichaBloque key={b.id} bloque={b} pie={
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <button onClick={() => revisar(b, true)} style={st.btnPrincipal}><Check size={14} /> Aprobar</button>
                                <button onClick={() => revisar(b, false)} style={{ ...st.btnSecundario, color: '#c0392b' }}><X size={14} /> Rechazar</button>
                            </div>
                        } />
                    ))}
                </>
            )}

            {nuevo ? (
                <Tarjeta>
                    <h3 style={st.h3}>Proponer un bloque</h3>
                    <p style={st.texto}>La administración lo revisará. Si lo aprueba, cualquier entrenador podrá añadirlo a las sesiones de sus atletas.</p>
                    <FormBloque bloque={nuevo} onChange={setNuevo} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={() => setNuevo(null)} style={st.btnSecundario}>Cancelar</button>
                        <button onClick={enviar} style={st.btnPrincipal}>Enviar propuesta</button>
                    </div>
                </Tarjeta>
            ) : (
                <button onClick={() => setNuevo(BLOQUE_VACIO)} style={{ ...st.btnPrincipal, justifyContent: 'center' }}><Plus size={16} /> Proponer un bloque al catálogo</button>
            )}

            {mios.length > 0 && (
                <>
                    <h3 style={st.h3}>Mis propuestas</h3>
                    {mios.map(b => (
                        <FichaBloque key={b.id} bloque={b} pie={
                            <div style={{ fontSize: '0.82rem', marginTop: 8, color: b.estado === 'rechazado' ? '#c0392b' : '#935116' }}>
                                {b.estado === 'rechazado' ? `Rechazado${b.motivo ? `: ${b.motivo}` : ''}` : 'Pendiente de revisión'}
                                {b.estado === 'pendiente' && <button onClick={() => deleteDoc(doc(db, COL_BLOQUES, b.id)).catch(e => console.error(e))} style={{ ...st.btnSecundario, marginLeft: 8, padding: '3px 8px' }}>Retirar</button>}
                            </div>
                        } />
                    ))}
                </>
            )}

            <h3 style={st.h3}>Catálogo</h3>
            <Opciones etiqueta="Categoría" valor={filtro} onChange={setFiltro} opciones={[['todas', 'Todas'], ...Object.entries(CATEGORIAS)]} />
            {aprobados === null ? <Centro>Cargando…</Centro> : !visibles.length ? (
                <Tarjeta><p style={{ ...st.texto, margin: 0 }}>No hay bloques aprobados{filtro !== 'todas' ? ' en esta categoría' : ''} todavía.</p></Tarjeta>
            ) : visibles.map(b => (
                <FichaBloque key={b.id} bloque={b} accion={admin ? <button onClick={() => quitarDelCatalogo(b)} style={{ ...st.btnHeader, color: '#c0392b' }} title="Quitar del catálogo"><Trash2 size={16} /></button> : null} />
            ))}
        </>
    );
}
