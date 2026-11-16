import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Play, CheckCircle, SkipForward, AlertTriangle, RefreshCw, ClipboardList, TrendingUp, TrendingDown, Timer, Printer, MessageSquare, UserCheck, X, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import CronoEjercicio from '../components/CronoEjercicio';
import { GuiaDesplegable } from '../components/AnimacionEjercicio';
import ImprimirPlan from '../components/ImprimirPlan';
import { ListaSesiones, VerSesion, EditorSesion } from './SesionesPropias';
import EntrenadorPagina from './EntrenadorPagina';
import { notificar, nombreDe, COL_INVITACIONES, planDesdeInvitacion } from '../utils/entrenador';
import { Opciones, Campo, Test, Tarjeta, Marco, Centro, st } from '../components/entrenamientoUI';
import { useAuth } from '../contexts/AuthContext';
import {
    GRADOS_VIA, GRADOS_BLOQUE, CAPACIDADES, TIPOS_SESION, ZONAS, ESTILOS_DEDOS,
    calcularPerfil, generarPlan, prescribirSesion, aplicarRegistro, siguienteSesion, sesionesHechas,
    zonasBloqueadas, textoCarga, textoGrado,
} from '../utils/entrenamiento';

// Planes de entrenamiento privados de cada usuario.
// tests_entrenamiento/{id}  = { creadoPor, fecha, ...valores del test }
// planes_entrenamiento/{id} = { creadoPor, testId, test, perfil, semanas, sesiones, ajustes, registros, bloqueos, estado }
const COL_TESTS = 'tests_entrenamiento';
const COL_PLANES = 'planes_entrenamiento';

const segundos = (x) => x.createdAt?.seconds ?? Date.now() / 1000;

// sesionId: abrir directamente una sesión propia (enlace compartido #/sesion/{id})
// vistaInicial: 'entrenador' | 'catalogo' para abrir directamente el panel del entrenador
export default function EntrenamientoPagina({ onVolver, sesionId = null, vistaInicial = null }) {
    const { usuario, cargando, pedirAuth } = useAuth();

    if (cargando) return <Marco titulo="Entrenamiento" onVolver={onVolver}><Centro>Cargando…</Centro></Marco>;
    if (!usuario) {
        return (
            <Marco titulo="Entrenamiento" onVolver={onVolver}>
                <Centro>
                    <p>{sesionId ? 'Inicia sesión para ver la sesión que te han compartido.' : 'Inicia sesión para crear tu plan de entrenamiento.'}</p>
                    <button onClick={() => pedirAuth()} style={st.btnPrincipal}>Iniciar sesión</button>
                </Centro>
            </Marco>
        );
    }
    return <Panel usuario={usuario} onVolver={onVolver} sesionId={sesionId} vistaInicial={vistaInicial} />;
}

function Panel({ usuario, onVolver, sesionId, vistaInicial }) {
    const uid = usuario.uid;
    const [planes, setPlanes] = useState(null);
    const [tests, setTests] = useState(null);
    const [vista, setVista] = useState(sesionId ? { tipo: 'verSesion', id: sesionId }
        : vistaInicial === 'entrenador' || vistaInicial === 'catalogo' ? { tipo: 'entrenador', pestana: vistaInicial === 'catalogo' ? 'catalogo' : 'atletas' }
        : { tipo: 'inicio' });
    const inicio = () => setVista({ tipo: 'inicio' });
    const irASesiones = () => setVista({ tipo: 'sesiones' });

    useEffect(() => onSnapshot(query(collection(db, COL_PLANES), where('creadoPor', '==', uid)),
        (snap) => setPlanes(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => segundos(b) - segundos(a))),
        (e) => { console.error(e); setPlanes([]); }), [uid]);
    useEffect(() => onSnapshot(query(collection(db, COL_TESTS), where('creadoPor', '==', uid)),
        (snap) => setTests(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))),
        (e) => { console.error(e); setTests([]); }), [uid]);
    // Planes que un entrenador ha preparado para este usuario
    const [invitaciones, setInvitaciones] = useState([]);
    const email = usuario.email?.toLowerCase();
    useEffect(() => {
        if (!email) return;
        return onSnapshot(query(collection(db, COL_INVITACIONES), where('atletaEmail', '==', email), where('estado', '==', 'pendiente')),
            (snap) => setInvitaciones(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            (e) => console.error(e));
    }, [email]);

    if (planes === null || tests === null) return <Marco titulo="Entrenamiento" onVolver={onVolver}><Centro>Cargando…</Centro></Marco>;

    const plan = planes.find(p => p.estado === 'activo');

    // Con invitacion: el test se usa para el plan del entrenador en lugar de generar uno
    const guardarTest = (test, invitacion = null) => {
        const batch = writeBatch(db);
        const refTest = doc(collection(db, COL_TESTS));
        batch.set(refTest, { creadoPor: uid, ...test, fecha: new Date().toISOString(), createdAt: serverTimestamp() });
        if (invitacion) {
            crearPlanDeEntrenador(batch, invitacion, test, refTest.id);
        } else {
            const perfil = calcularPerfil(test);
            const nuevo = generarPlan(test, perfil);
            planes.filter(p => p.estado === 'activo').forEach(p => batch.update(doc(db, COL_PLANES, p.id), { estado: 'terminado', updatedAt: serverTimestamp() }));
            // El entrenador sigue vinculado al plan nuevo
            const previo = planes.find(p => p.estado === 'activo');
            batch.set(doc(collection(db, COL_PLANES)), {
                creadoPor: uid, testId: refTest.id, test, perfil, ...nuevo, estado: 'activo',
                atletaNombre: nombreDe(usuario), atletaEmail: email || '',
                entrenadoresEmail: previo?.entrenadoresEmail || [], entrenadoresUid: previo?.entrenadoresUid || [],
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            });
        }
        // Sin await: con la caché local se ve al momento aunque no haya cobertura
        batch.commit().catch(e => { console.error(e); alert('No se pudo guardar.'); });
        setVista({ tipo: 'inicio' });
    };

    // El plan del entrenador pasa a ser el plan activo, con las cargas calculadas con este test
    function crearPlanDeEntrenador(batch, inv, test, testId) {
        planes.filter(p => p.estado === 'activo').forEach(p => batch.update(doc(db, COL_PLANES, p.id), { estado: 'terminado', updatedAt: serverTimestamp() }));
        const { fecha, createdAt, creadoPor, id, ...datosTest } = test;
        const ref = doc(collection(db, COL_PLANES));
        batch.set(ref, {
            ...planDesdeInvitacion(inv, { uid, test: datosTest, testId, perfil: calcularPerfil(datosTest), atletaNombre: nombreDe(usuario), atletaEmail: email || '' }),
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, COL_INVITACIONES, inv.id), { estado: 'aceptada', planId: ref.id, respondidaAt: serverTimestamp() });
        notificar([inv.entrenadorUid], { tipo: 'entreno_aceptado', autorNombre: nombreDe(usuario), textoPreview: `Ha empezado tu plan «${inv.plan.nombre}»` });
    }

    const aceptarInvitacion = (inv) => {
        const ultimo = tests[0];
        if (!ultimo) {
            alert('Para calcular tus cargas necesitas hacer el test primero. Al guardarlo empezarás el plan de tu entrenador.');
            setVista({ tipo: 'test', invitacion: inv });
            return;
        }
        if (plan && !window.confirm(`Empezar «${inv.plan.nombre}» terminará tu plan actual (queda en tu historial). ¿Continuar?`)) return;
        if (!window.confirm(`Se usará tu test del ${new Date(ultimo.fecha).toLocaleDateString()} para calcular las cargas. Pulsa Cancelar si prefieres repetirlo antes.`)) {
            setVista({ tipo: 'test', invitacion: inv });
            return;
        }
        const batch = writeBatch(db);
        crearPlanDeEntrenador(batch, inv, ultimo, ultimo.id);
        batch.commit().catch(e => { console.error(e); alert('No se pudo empezar el plan.'); });
    };
    const rechazarInvitacion = (inv) => {
        if (!window.confirm(`¿Rechazar el plan «${inv.plan.nombre}» de ${inv.entrenadorNombre}?`)) return;
        updateDoc(doc(db, COL_INVITACIONES, inv.id), { estado: 'rechazada', respondidaAt: serverTimestamp() }).catch(e => console.error(e));
    };
    const tarjetaInvitaciones = <Invitaciones invitaciones={invitaciones} onAceptar={aceptarInvitacion} onRechazar={rechazarInvitacion} />;

    if (vista.tipo === 'entrenador') {
        return <EntrenadorPagina usuario={usuario} vistaInicial={vista.pestana} onVolver={inicio} />;
    }
    if (vista.tipo === 'sesiones') {
        return <ListaSesiones uid={uid} email={usuario.email} onVolver={inicio}
            onNueva={() => setVista({ tipo: 'editarSesion', id: null })}
            onAbrir={(id) => setVista({ tipo: 'verSesion', id })} />;
    }
    if (vista.tipo === 'verSesion') {
        return <VerSesion key={vista.id} id={vista.id} uid={uid} email={usuario.email} nombreUsuario={usuario.displayName} test={tests[0]}
            onVolver={irASesiones} onEditar={(id) => setVista({ tipo: 'editarSesion', id })}
            onAbrir={(id) => setVista({ tipo: 'verSesion', id })} />;
    }
    if (vista.tipo === 'editarSesion') {
        return <EditorSesion key={vista.id || 'nueva'} id={vista.id} uid={uid} nombreUsuario={usuario.displayName}
            onCancelar={() => vista.id ? setVista({ tipo: 'verSesion', id: vista.id }) : irASesiones()}
            onGuardada={(id) => setVista({ tipo: 'verSesion', id })} />;
    }
    if (vista.tipo === 'imprimir' && plan) {
        return <ImprimirPlan plan={plan} test={tests.find(t => t.id === plan.testId) || tests[0]} onVolver={inicio} />;
    }
    if (vista.tipo === 'test') {
        return <FormTest previo={tests[0]} primero={tests.length === 0} onCancelar={() => setVista({ tipo: 'inicio' })}
            onGuardar={(t) => guardarTest(t, vista.invitacion || null)} invitacion={vista.invitacion} />;
    }
    if (vista.tipo === 'sesion' && plan) {
        const sesion = plan.sesiones.find(s => s.id === vista.id);
        if (sesion) return <VistaSesion key={sesion.id} plan={plan} sesion={sesion} onVolver={() => setVista({ tipo: 'inicio' })} />;
    }
    if (plan) {
        return <VistaPlan plan={plan} tests={tests} onVolver={onVolver}
            onAbrirSesion={(id) => setVista({ tipo: 'sesion', id })}
            onNuevoTest={() => setVista({ tipo: 'test' })}
            onSesiones={irASesiones}
            onImprimir={() => setVista({ tipo: 'imprimir' })}
            usuario={usuario}
            onEntrenador={() => setVista({ tipo: 'entrenador', pestana: 'atletas' })}
            invitaciones={tarjetaInvitaciones} />;
    }
    return <Bienvenida tests={tests} onVolver={onVolver} onEmpezar={() => setVista({ tipo: 'test' })} onSesiones={irASesiones}
        onEntrenador={() => setVista({ tipo: 'entrenador', pestana: 'atletas' })} invitaciones={tarjetaInvitaciones} />;
}

function Invitaciones({ invitaciones, onAceptar, onRechazar }) {
    if (!invitaciones.length) return null;
    return invitaciones.map(inv => (
        <Tarjeta key={inv.id} estilo={{ borderColor: '#8e44ad', borderWidth: 2 }}>
            <div style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: 'bold', textTransform: 'uppercase' }}>Plan de tu entrenador</div>
            <h3 style={{ ...st.h3, margin: '4px 0' }}>{inv.plan.nombre}</h3>
            <p style={st.texto}>
                <strong>{inv.entrenadorNombre}</strong> te ha preparado un plan de {inv.plan.semanas} semanas ({inv.plan.sesiones.length} sesiones).
                Las cargas se calculan con tu test, y tu entrenador verá cómo te va cada sesión.
            </p>
            {inv.plan.mensaje && <p style={{ ...st.texto, fontStyle: 'italic' }}>«{inv.plan.mensaje}»</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => onAceptar(inv)} style={st.btnPrincipal}><CheckCircle size={16} /> Empezar este plan</button>
                <button onClick={() => onRechazar(inv)} style={st.btnSecundario}>Rechazar</button>
            </div>
        </Tarjeta>
    ));
}

function AccesoEntrenador({ onEntrenador }) {
    return (
        <button onClick={onEntrenador} style={{ textAlign: 'left', padding: '12px 14px', background: 'white', border: '1px solid #dfe4ea', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <UserCheck size={22} style={{ color: '#8e44ad', flexShrink: 0 }} />
            <span>
                <strong style={{ color: '#2c3e50' }}>Panel del entrenador</strong>
                <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d' }}>Si entrenas a otros: sus planes, su feedback y el catálogo de bloques</span>
            </span>
        </button>
    );
}

// El atleta decide qué entrenadores ven su plan y pueden ajustarlo
function TarjetaEntrenador({ plan, usuario }) {
    const [email, setEmail] = useState('');
    const lista = plan.entrenadoresEmail || [];
    const ref = doc(db, COL_PLANES, plan.id);
    const anadir = () => {
        const e = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return alert('Escribe un email válido.');
        if (e === usuario.email?.toLowerCase()) return alert('Ese es tu email.');
        if (lista.includes(e)) return;
        updateDoc(ref, {
            entrenadoresEmail: [...lista, e], atletaNombre: nombreDe(usuario), atletaEmail: usuario.email?.toLowerCase() || '',
            updatedAt: serverTimestamp(),
        }).catch(err => { console.error(err); alert('No se pudo añadir.'); });
        setEmail('');
    };
    const quitar = (e) => {
        if (!window.confirm(`¿Dejar de compartir tu plan con ${e}? Ya no podrá verlo ni ajustarlo.`)) return;
        // Al quitar un entrenador también se quitan los avisos: se vuelve a apuntar si se le añade de nuevo
        updateDoc(ref, { entrenadoresEmail: lista.filter(x => x !== e), entrenadoresUid: [], updatedAt: serverTimestamp() })
            .catch(err => console.error(err));
    };
    return (
        <Tarjeta>
            <h3 style={{ ...st.h3, display: 'flex', alignItems: 'center', gap: 6 }}><UserCheck size={16} /> Mi entrenador</h3>
            <p style={st.texto}>Con el email de su cuenta verá tu plan y el feedback de cada sesión, y podrá ajustar cargas, añadir bloques y dejarte notas.</p>
            {lista.map(e => (
                <div key={e} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.86rem', padding: '5px 0', borderBottom: '1px solid #f0f2f5' }}>
                    {e}
                    <button onClick={() => quitar(e)} style={{ ...st.btnHeader, color: '#c0392b' }} title="Quitar"><X size={16} /></button>
                </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && anadir()} placeholder="email del entrenador" style={st.input} />
                <button onClick={anadir} style={st.btnPrincipal}>Añadir</button>
            </div>
        </Tarjeta>
    );
}

function AccesoSesiones({ onSesiones }) {
    return (
        <button onClick={onSesiones} style={{ textAlign: 'left', padding: '12px 14px', background: 'white', border: '1px solid #dfe4ea', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Timer size={22} style={{ color: '#2471a3', flexShrink: 0 }} />
            <span>
                <strong style={{ color: '#2c3e50' }}>Mis sesiones con crono</strong>
                <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d' }}>Crea tus propias sesiones, hazlas con el crono y compártelas</span>
            </span>
        </button>
    );
}

// ───────────────────────────── Inicio sin plan ─────────────────────────────

function Bienvenida({ tests, onVolver, onEmpezar, onSesiones, onEntrenador, invitaciones }) {
    return (
        <Marco titulo="Entrenamiento" subtitulo="Planes que se adaptan a tus resultados" onVolver={onVolver}>
            <div style={st.columna}>
                {invitaciones}
                <Tarjeta>
                    <div style={{ fontSize: '2.2rem', textAlign: 'center' }}>🧗</div>
                    <h3 style={{ ...st.h3, textAlign: 'center' }}>Crea tu plan de entrenamiento</h3>
                    <ol style={{ margin: '8px 0 14px 20px', fontSize: '0.88rem', color: '#555', lineHeight: 1.6 }}>
                        <li>Haz unos tests sencillos: dedos, dominadas, resistencia y core.</li>
                        <li>Se comparan con la referencia para tu grado para ver tus puntos débiles.</li>
                        <li>Se genera un plan de 4 a 8 semanas con cargas calculadas a partir de tus números.</li>
                        <li>Después de cada sesión indicas cómo te ha ido y las siguientes se ajustan.</li>
                    </ol>
                    <div style={{ textAlign: 'center' }}>
                        <button onClick={onEmpezar} style={st.btnPrincipal}><ClipboardList size={16} /> {tests.length ? 'Repetir el test' : 'Hacer el test'}</button>
                    </div>
                </Tarjeta>
                <AccesoSesiones onSesiones={onSesiones} />
                <AccesoEntrenador onEntrenador={onEntrenador} />
                {tests.length > 0 && <HistorialTests tests={tests} />}
            </div>
        </Marco>
    );
}

function HistorialTests({ tests }) {
    const OBJETIVOS = { bloque: 'Bloque', via: 'Vía', mixto: 'Las dos' };
    const MATERIAL = { rocodromo: 'Rocódromo', multipresa: 'Multipresa', barra: 'Barra', campus: 'Campus' };
    const eliminar = (t) => {
        if (!window.confirm(`¿Eliminar el test del ${new Date(t.fecha).toLocaleDateString()}? Tu plan actual no cambia: guarda su propia copia de los resultados.`)) return;
        deleteDoc(doc(db, COL_TESTS, t.id)).catch(e => { console.error(e); alert('No se pudo eliminar el test.'); });
    };
    // [clave, nombre, unidad, texto opcional para valores que no son números]
    const filas = [
        ['peso', 'Peso', 'kg'], ['experiencia', 'Años escalando', ''],
        ['gradoVia', 'Grado en vía', ''], ['gradoBloque', 'Grado en bloque', ''],
        ['objetivo', 'Objetivo', '', (t) => OBJETIVOS[t.objetivo]],
        ['suspension', 'Suspensión 20 mm', 'kg', (t) => t.suspension == null ? null : textoCarga(t.suspension)],
        ['dominadas', 'Dominadas', ''],
        ['dominadaLastre', 'Lastre en dominada', 'kg', (t) => t.dominadaLastre == null ? null : `+${t.dominadaLastre} kg`],
        ['repeaters', 'Repeaters 7/3', ''], ['core', 'Elevaciones', ''],
        ['dias', 'Días por semana', ''], ['semanas', 'Semanas', ''],
        ['material', 'Material', '', (t) => Object.keys(MATERIAL).filter(k => t.material?.[k]).map(k => MATERIAL[k]).join(', ') || null],
    ].filter(([k]) => tests.some(t => t[k] != null && t[k] !== ''));
    const recientes = tests.slice(0, 4);
    return (
        <Tarjeta>
            <h3 style={st.h3}>{tests.length === 1 ? 'Tu test' : 'Historial de tests'}</h3>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                        <tr>
                            <th style={st.th}></th>
                            {recientes.map(t => (
                                <th key={t.id} style={st.th}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        {new Date(t.fecha).toLocaleDateString()}
                                        <button onClick={() => eliminar(t)} title="Eliminar este test" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: 2, display: 'flex' }}><Trash2 size={13} /></button>
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map(([k, nombre, ud, texto]) => (
                            <tr key={k}>
                                <td style={{ ...st.td, color: '#7f8c8d' }}>{nombre}</td>
                                {recientes.map((t, i) => {
                                    const previo = recientes[i + 1]?.[k];
                                    const dif = typeof t[k] === 'number' && typeof previo === 'number' ? t[k] - previo : null;
                                    const valor = texto ? texto(t) : (t[k] === '' ? null : t[k]);
                                    return (
                                        <td key={t.id} style={st.td}>
                                            {valor ?? '—'}{valor != null && !texto && ud ? ` ${ud}` : ''}
                                            {dif ? <span style={{ marginLeft: 4, fontSize: '0.72rem', color: (k === 'peso' ? -dif : dif) > 0 ? '#27ae60' : '#c0392b' }}>{dif > 0 ? '+' : ''}{Math.round(dif * 10) / 10}</span> : null}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Tarjeta>
    );
}

// ───────────────────────────── Formulario del test ─────────────────────────────

const CAMPOS_NUM = ['peso', 'experiencia', 'suspension', 'dominadas', 'dominadaLastre', 'repeaters', 'core'];

function FormTest({ previo, primero, onCancelar, onGuardar, invitacion }) {
    const [f, setF] = useState(() => ({
        peso: previo?.peso ?? '', experiencia: previo?.experiencia ?? '',
        gradoVia: previo?.gradoVia ?? '', gradoBloque: previo?.gradoBloque ?? '', objetivo: previo?.objetivo ?? 'mixto',
        suspension: '', dominadas: '', dominadaLastre: '', repeaters: '', core: '',
        dias: previo?.dias ?? 3, semanas: previo?.semanas ?? 6,
        material: previo?.material ?? { rocodromo: true, multipresa: false, barra: false, campus: false },
        estiloDedos: previo?.estiloDedos ?? 'mixto',
    }));
    const [acepto, setAcepto] = useState(!primero);
    const [error, setError] = useState('');
    const cambia = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const cambiaMat = (k) => (e) => setF({ ...f, material: { ...f.material, [k]: e.target.checked } });

    const enviar = () => {
        const test = { ...f, dias: Number(f.dias), semanas: Number(f.semanas) };
        for (const k of CAMPOS_NUM) {
            const v = String(f[k]).replace(',', '.').trim();
            test[k] = v === '' || isNaN(Number(v)) ? null : Number(v);
        }
        if (!test.peso || test.peso < 30 || test.peso > 200) return setError('Indica tu peso (entre 30 y 200 kg).');
        if (test.experiencia == null || test.experiencia < 0) return setError('Indica cuántos años llevas escalando.');
        if (!test.gradoVia && !test.gradoBloque) return setError('Indica al menos un grado máximo, de vía o de bloque.');
        if (!test.material.rocodromo && !test.material.multipresa) return setError('Necesitas acceso a rocódromo/roca o a una multipresa.');
        if (test.suspension != null && test.peso + test.suspension <= 0) return setError('La carga de la suspensión no puede quitar todo tu peso.');
        if (!acepto) return setError('Confirma que has leído el aviso de seguridad.');
        onGuardar(test);
    };

    return (
        <Marco titulo={primero ? 'Test inicial' : 'Repetir el test'} subtitulo="Calienta bien 15-20 min antes de los tests de fuerza" onVolver={onCancelar}>
            <div style={st.columna}>
                {invitacion && <div style={{ ...st.aviso, background: "#f5eef8", borderColor: "#d2b4de", color: "#5b2c6f" }}>Al guardar el test empezarás el plan «{invitacion.plan.nombre}» de {invitacion.entrenadorNombre}, con las cargas calculadas con estos resultados.</div>}
                <Tarjeta>
                    <h3 style={st.h3}>Sobre ti</h3>
                    <div style={st.rejilla}>
                        <Campo etiqueta="Peso (kg)"><input type="number" inputMode="decimal" value={f.peso} onChange={cambia('peso')} style={st.input} /></Campo>
                        <Campo etiqueta="Años escalando"><input type="number" inputMode="decimal" value={f.experiencia} onChange={cambia('experiencia')} style={st.input} /></Campo>
                        <Campo etiqueta="Grado máx. en vía (encadenado)">
                            <select value={f.gradoVia} onChange={cambia('gradoVia')} style={st.input}>
                                <option value="">—</option>{GRADOS_VIA.map(g => <option key={g}>{g}</option>)}
                            </select>
                        </Campo>
                        <Campo etiqueta="Grado máx. en bloque">
                            <select value={f.gradoBloque} onChange={cambia('gradoBloque')} style={st.input}>
                                <option value="">—</option>{GRADOS_BLOQUE.map(g => <option key={g}>{g}</option>)}
                            </select>
                        </Campo>
                        <Campo etiqueta="Objetivo">
                            <select value={f.objetivo} onChange={cambia('objetivo')} style={st.input}>
                                <option value="bloque">Bloque</option><option value="via">Vía deportiva</option><option value="mixto">Las dos cosas</option>
                            </select>
                        </Campo>
                    </div>
                </Tarjeta>

                <Tarjeta>
                    <h3 style={st.h3}>Disponibilidad</h3>
                    <div style={st.rejilla}>
                        <Campo etiqueta="Días por semana">
                            <select value={f.dias} onChange={cambia('dias')} style={st.input}>{[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select>
                        </Campo>
                        <Campo etiqueta="Duración del plan">
                            <select value={f.semanas} onChange={cambia('semanas')} style={st.input}>{[4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} semanas</option>)}</select>
                        </Campo>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: '0.88rem' }}>
                        <label><input type="checkbox" checked={!!f.material.rocodromo} onChange={cambiaMat('rocodromo')} /> Rocódromo o roca</label>
                        <label><input type="checkbox" checked={!!f.material.multipresa} onChange={cambiaMat('multipresa')} /> Multipresa</label>
                        <label><input type="checkbox" checked={!!f.material.barra} onChange={cambiaMat('barra')} /> Barra de dominadas</label>
                        <label><input type="checkbox" checked={!!f.material.campus} onChange={cambiaMat('campus')} /> Campus board</label>
                    </div>
                    {f.material.campus && (
                        <p style={{ ...st.texto, fontSize: '0.8rem', marginTop: 8 }}>
                            El campus solo se incluye con 3 años o más escalando y un grado de 7b (6C+ en bloque) o superior.
                        </p>
                    )}
                    {f.material.multipresa && (
                        <div style={{ marginTop: 10, maxWidth: 360 }}>
                            <Campo etiqueta="Cómo prefieres las suspensiones">
                                <select value={f.estiloDedos} onChange={cambia('estiloDedos')} style={st.input}>
                                    {Object.entries(ESTILOS_DEDOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </Campo>
                            <p style={{ ...st.texto, fontSize: '0.78rem', marginTop: 4 }}>
                                Las largas (20-45 s con poca carga) cargan menos los dedos y construyen base y tendón; las máximas (10 s) son las más estudiadas para la fuerza máxima.
                                En mixto se hacen largas en la primera mitad del plan y máximas en la segunda.
                            </p>
                        </div>
                    )}
                    <div>
                    </div>
                </Tarjeta>

                <Tarjeta>
                    <h3 style={st.h3}>Tests</h3>
                    <p style={st.texto}>Deja vacío el que no puedas hacer. Descansa al menos 5 min entre tests.</p>
                    {f.material.multipresa && (
                        <Test titulo="Suspensión máxima" ayuda="Regleta de 20 mm, agarre semiarqueo, 10 s. Busca la carga máxima que aguantas los 10 s. Indica los kg añadidos (o con signo menos los que quitas con polea o goma).">
                            <input type="number" inputMode="decimal" placeholder="kg añadidos, p. ej. 10 o -5" value={f.suspension} onChange={cambia('suspension')} style={st.input} />
                        </Test>
                    )}
                    <Test titulo="Dominadas máximas" ayuda="Seguidas, de brazos estirados hasta la barbilla por encima de la barra, sin balanceo.">
                        <input type="number" inputMode="numeric" placeholder="repeticiones" value={f.dominadas} onChange={cambia('dominadas')} style={st.input} />
                    </Test>
                    {Number(f.experiencia) >= 2 && (f.material.barra || f.material.multipresa) && (
                        <Test titulo="Lastre máximo en una dominada (opcional)" ayuda="Solo el peso extra (cinturón, chaleco), sin contar tu peso corporal, con el que haces una dominada completa. Hazlo solo si ya entrenas con lastre.">
                            <input type="number" inputMode="decimal" placeholder="kg extra, p. ej. 20" value={f.dominadaLastre} onChange={cambia('dominadaLastre')} style={st.input} />
                        </Test>
                    )}
                    {f.material.multipresa && (
                        <Test titulo="Repeaters 7/3" ayuda="Regleta de 20 mm a peso corporal: 7 s colgado y 3 s de descanso hasta que no puedas. Cuenta las repeticiones completas.">
                            <input type="number" inputMode="numeric" placeholder="repeticiones" value={f.repeaters} onChange={cambia('repeaters')} style={st.input} />
                        </Test>
                    )}
                    <Test titulo="Elevaciones de piernas" ayuda="Colgado de una barra, piernas rectas hasta la horizontal, sin balanceo.">
                        <input type="number" inputMode="numeric" placeholder="repeticiones" value={f.core} onChange={cambia('core')} style={st.input} />
                    </Test>
                </Tarjeta>

                {primero && (
                    <Tarjeta estilo={{ background: '#fef9e7', borderColor: '#f5d78e' }}>
                        <p style={{ ...st.texto, display: 'flex', gap: 8 }}>
                            <AlertTriangle size={18} style={{ color: '#e67e22', flexShrink: 0 }} />
                            <span>El plan es orientativo y no sustituye a un entrenador. El entrenamiento de dedos mal dosificado puede lesionar las poleas:
                                calienta siempre, para ante cualquier dolor y, si tienes una lesión, consulta antes con un fisioterapeuta.</span>
                        </p>
                        <label style={{ fontSize: '0.88rem' }}><input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} /> Lo he leído y lo entiendo</label>
                    </Tarjeta>
                )}

                {error && <div style={{ color: '#c0392b', fontSize: '0.88rem', fontWeight: 'bold' }}>{error}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={onCancelar} style={st.btnSecundario}>Cancelar</button>
                    <button onClick={enviar} style={st.btnPrincipal}><CheckCircle size={16} /> {invitacion ? `Guardar y empezar «${invitacion.plan.nombre}»` : "Crear mi plan"}</button>
                </div>
            </div>
        </Marco>
    );
}

// ───────────────────────────── Plan activo ─────────────────────────────

function VistaPlan({ plan, tests, onVolver, onAbrirSesion, onNuevoTest, onSesiones, onImprimir, usuario, onEntrenador, invitaciones }) {
    const siguiente = siguienteSesion(plan);
    const hechas = sesionesHechas(plan);
    const total = plan.sesiones.length;
    const bloqueos = zonasBloqueadas(plan);
    const semanas = useMemo(() => {
        const m = {};
        plan.sesiones.forEach(s => { (m[s.semana] ||= []).push(s); });
        return Object.entries(m);
    }, [plan.sesiones]);

    const abandonar = () => {
        if (!window.confirm('¿Terminar este plan? Se guarda en tu historial y podrás crear otro con un test nuevo.')) return;
        updateDoc(doc(db, COL_PLANES, plan.id), { estado: 'terminado', updatedAt: serverTimestamp() }).catch(e => console.error(e));
    };

    return (
        <Marco titulo="Mi plan" subtitulo={`${plan.semanas} semanas · enfoque ${plan.perfil.enfoque} · ${hechas}/${total} sesiones`} onVolver={onVolver}
            accion={<div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onImprimir} style={st.btnHeader} title="Imprimir el plan"><Printer size={18} /></button>
                <button onClick={onNuevoTest} style={st.btnHeader} title="Repetir el test"><RefreshCw size={18} /></button>
            </div>}>
            <div style={st.columna}>
                <div style={{ height: 6, background: '#dfe4ea', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(hechas / total) * 100}%`, height: '100%', background: '#27ae60' }} />
                </div>

                {invitaciones}
                {plan.plantillaNombre && <div style={{ fontSize: "0.82rem", color: "#8e44ad", fontWeight: 600 }}>Plan de tu entrenador: «{plan.plantillaNombre}»</div>}
                {plan.mensajeEntrenador && <NotaEntrenador texto={plan.mensajeEntrenador} titulo="Mensaje de tu entrenador" />}

                {bloqueos.map(b => (
                    <div key={b.zona} style={st.aviso}>
                        <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                        <span>Molestias en {ZONAS[b.zona]}: hasta el {new Date(b.hasta).toLocaleDateString()} no se incluyen ejercicios que las carguen.</span>
                    </div>
                ))}

                {siguiente ? (
                    <Tarjeta estilo={{ borderColor: '#27ae60', borderWidth: 2 }}>
                        <div style={{ fontSize: '0.75rem', color: '#27ae60', fontWeight: 'bold', textTransform: 'uppercase' }}>Siguiente sesión · semana {siguiente.semana}</div>
                        <h3 style={{ ...st.h3, margin: '4px 0' }}>{TIPOS_SESION[siguiente.tipo]}</h3>
                        <p style={st.texto}>{prescribirSesion(plan, siguiente).ejercicios.map(e => e.nombre).join(' · ')}</p>
                        <button onClick={() => onAbrirSesion(siguiente.id)} style={st.btnPrincipal}><Play size={16} /> Empezar</button>
                    </Tarjeta>
                ) : (
                    <Tarjeta estilo={{ borderColor: '#27ae60', borderWidth: 2, textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem' }}>🎉</div>
                        <h3 style={st.h3}>¡Plan completado!</h3>
                        <p style={st.texto}>Descansa 2-3 días y repite el test para ver tu progreso y generar el siguiente plan.</p>
                        <button onClick={onNuevoTest} style={st.btnPrincipal}><ClipboardList size={16} /> Repetir el test</button>
                    </Tarjeta>
                )}

                <AccesoSesiones onSesiones={onSesiones} />

                <TarjetaEntrenador plan={plan} usuario={usuario} />
                <AccesoEntrenador onEntrenador={onEntrenador} />

                <Perfil perfil={plan.perfil} />

                <Tarjeta>
                    <h3 style={st.h3}>Semanas</h3>
                    {semanas.map(([n, sesiones]) => (
                        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #f0f2f5', flexWrap: 'wrap' }}>
                            <span style={{ width: 82, fontSize: '0.8rem', color: '#7f8c8d', flexShrink: 0 }}>
                                Semana {n}{Number(n) === plan.semanas && plan.semanas >= 4 ? <><br /><em>descarga</em></> : ''}
                            </span>
                            {sesiones.map(s => {
                                const r = plan.registros?.[s.id];
                                const esSiguiente = siguiente?.id === s.id;
                                return (
                                    <button key={s.id} onClick={() => onAbrirSesion(s.id)}
                                        style={{
                                            ...st.chip,
                                            background: r ? (r.saltada ? '#ecf0f1' : '#eafaf1') : 'white',
                                            color: r ? (r.saltada ? '#95a5a6' : '#27ae60') : '#2c3e50',
                                            borderColor: esSiguiente ? '#27ae60' : '#dfe4ea',
                                        }}>
                                        {r ? (r.saltada ? <SkipForward size={12} /> : <CheckCircle size={12} />) : null} {TIPOS_SESION[s.tipo]}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </Tarjeta>

                {tests.length > 0 && <HistorialTests tests={tests} />}

                <div style={{ textAlign: 'center' }}>
                    <button onClick={abandonar} style={{ ...st.btnSecundario, color: '#c0392b', borderColor: '#e6b0aa' }}>Terminar este plan</button>
                </div>
            </div>
        </Marco>
    );
}

function Perfil({ perfil }) {
    const caps = Object.entries(perfil.capacidades || {});
    return (
        <Tarjeta>
            <h3 style={st.h3}>Tu perfil</h3>
            <p style={st.texto}>Comparado con la referencia orientativa para un escalador de {textoGrado(perfil.grado)} (la línea vertical).</p>
            {caps.map(([k, c]) => {
                const p = c.puntuacion;
                const color = p < 0.85 ? '#e67e22' : p < 1 ? '#f1c40f' : '#27ae60';
                return (
                    <div key={k} style={{ margin: '10px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', gap: 8 }}>
                            <strong style={{ color: '#2c3e50' }}>{CAPACIDADES[k].nombre}{perfil.debilidades[0] === k ? ' · prioridad' : ''}</strong>
                            <span style={{ color: '#7f8c8d' }}>{CAPACIDADES[k].formato(c.valor)} / ref. {CAPACIDADES[k].formato(c.referencia)}</span>
                        </div>
                        <div style={{ position: 'relative', height: 10, background: '#f0f2f5', borderRadius: 5, marginTop: 4 }}>
                            <div style={{ width: `${(Math.min(p, 1.5) / 1.5) * 100}%`, height: '100%', background: color, borderRadius: 5 }} />
                            <div style={{ position: 'absolute', left: `${100 / 1.5}%`, top: -3, bottom: -3, width: 2, background: '#2c3e50' }} />
                        </div>
                    </div>
                );
            })}
            {perfil.avisos?.map((a, i) => <p key={i} style={{ ...st.texto, fontSize: '0.8rem', color: '#7f8c8d', marginTop: 8 }}>ℹ️ {a}</p>)}
        </Tarjeta>
    );
}

// ───────────────────────────── Sesión ─────────────────────────────

const OPCIONES_RES = [['todo', 'Todo'], ['casi', 'Casi (fallé algo)'], ['no', 'No pude']];

function VistaSesion({ plan, sesion, onVolver }) {
    const registro = plan.registros?.[sesion.id];
    const [estadoHoy, setEstadoHoy] = useState(null);
    const [resumen, setResumen] = useState(null);
    const titulo = `${TIPOS_SESION[sesion.tipo]} · semana ${sesion.semana}`;

    if (resumen) {
        return (
            <Marco titulo="Sesión guardada" onVolver={onVolver}>
                <div style={st.columna}>
                    <Tarjeta>
                        <h3 style={st.h3}><CheckCircle size={18} style={{ color: '#27ae60', verticalAlign: -3 }} /> ¡Bien hecho!</h3>
                        {resumen.cambios.length ? (
                            <>
                                <p style={st.texto}>Ajustes para las próximas sesiones:</p>
                                {resumen.cambios.map(c => (
                                    <div key={c.clave} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', padding: '3px 0' }}>
                                        {c.porcentaje > 0 ? <TrendingUp size={15} style={{ color: '#27ae60' }} /> : <TrendingDown size={15} style={{ color: '#e67e22' }} />}
                                        {c.nombre}: {c.porcentaje > 0 ? '+' : ''}{c.porcentaje} %
                                    </div>
                                ))}
                            </>
                        ) : <p style={st.texto}>Las cargas siguen igual: vas en el punto justo.</p>}
                        {resumen.avisos.map((a, i) => <div key={i} style={{ ...st.aviso, marginTop: 10 }}><AlertTriangle size={16} style={{ flexShrink: 0 }} /><span>{a}</span></div>)}
                        <button onClick={onVolver} style={{ ...st.btnPrincipal, marginTop: 14 }}>Volver al plan</button>
                    </Tarjeta>
                </div>
            </Marco>
        );
    }
    if (registro) return <SesionHecha titulo={titulo} registro={registro} comentario={plan.comentarios?.[sesion.id]} onVolver={onVolver} />;
    if (!estadoHoy) return <EstadoPrevio titulo={titulo} plan={plan} sesion={sesion} onVolver={onVolver} onListo={setEstadoHoy} />;
    return <SesionEnCurso titulo={titulo} plan={plan} sesion={sesion} estadoHoy={estadoHoy} onVolver={onVolver} onGuardada={setResumen} />;
}

function EstadoPrevio({ titulo, plan, sesion, onVolver, onListo }) {
    const [e, setE] = useState({ sueno: 'bien', fatiga: 'normal', molestia: 'ninguna' });
    const saltar = () => {
        if (!window.confirm('¿Saltar esta sesión? El plan sigue con la siguiente; no se acumulan.')) return;
        updateDoc(doc(db, COL_PLANES, plan.id), {
            [`registros.${sesion.id}`]: { saltada: true, fecha: new Date().toISOString() },
            updatedAt: serverTimestamp(),
        }).catch(err => console.error(err));
        onVolver();
    };
    return (
        <Marco titulo={titulo} subtitulo="¿Cómo llegas hoy?" onVolver={onVolver}>
            <div style={st.columna}>
                <Tarjeta>
                    <Opciones etiqueta="¿Qué tal has dormido?" valor={e.sueno} onChange={(v) => setE({ ...e, sueno: v })} opciones={[['bien', 'Bien'], ['regular', 'Regular'], ['mal', 'Mal']]} />
                    <Opciones etiqueta="¿Cómo de cansado estás?" valor={e.fatiga} onChange={(v) => setE({ ...e, fatiga: v })} opciones={[['fresco', 'Fresco'], ['normal', 'Normal'], ['cansado', 'Cansado']]} />
                    <Opciones etiqueta="¿Alguna molestia?" valor={e.molestia} onChange={(v) => setE({ ...e, molestia: v })} opciones={[['ninguna', 'Ninguna'], ['dedos', 'Dedos'], ['hombro', 'Hombro'], ['codo', 'Codo']]} />
                    <p style={{ ...st.texto, fontSize: '0.8rem', color: '#7f8c8d' }}>La sesión se ajusta a lo que indiques: con poco descanso baja la carga y con molestias se quitan los ejercicios que cargan esa zona.</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => onListo(e)} style={st.btnPrincipal}><Play size={16} /> Ver la sesión</button>
                        <button onClick={saltar} style={st.btnSecundario}><SkipForward size={14} /> Saltar sesión</button>
                    </div>
                </Tarjeta>
            </div>
        </Marco>
    );
}

function SesionEnCurso({ titulo, plan, sesion, estadoHoy, onVolver, onGuardada }) {
    const presc = useMemo(() => prescribirSesion(plan, sesion, estadoHoy), []); // eslint-disable-line
    const [resultados, setResultados] = useState(() => Object.fromEntries(presc.ejercicios.map(e => [e.clave, 'todo'])));
    const [rpe, setRpe] = useState(7);
    const [molestia, setMolestia] = useState({ zona: 'ninguna', nivel: 'leve' });
    const [notas, setNotas] = useState('');
    const [crono, setCrono] = useState(null); // ejercicio con el crono abierto

    const guardar = () => {
        const registro = {
            fecha: new Date().toISOString(), estadoHoy, rpe, resultados,
            molestia: molestia.zona === 'ninguna' ? null : molestia,
            notas: notas.trim().slice(0, 1000),
            prescripcion: presc.ejercicios.map(({ clave, nombre, principal, carga, porcentaje }) => ({ clave, nombre, principal, carga, porcentaje: porcentaje ?? null })),
        };
        const { ajustes, bloqueos, cambios, avisos } = aplicarRegistro(plan, sesion, registro);
        updateDoc(doc(db, COL_PLANES, plan.id), {
            [`registros.${sesion.id}`]: registro, ajustes, bloqueos, updatedAt: serverTimestamp(),
        }).catch(e => { console.error(e); alert('No se pudo guardar la sesión.'); });
        // Aviso al entrenador con lo más relevante del feedback
        const fallos = Object.values(resultados).filter(v => v !== 'todo').length;
        notificar(plan.entrenadoresUid, {
            tipo: 'entreno_sesion', autorNombre: plan.atletaNombre || 'Tu atleta', sesionNombre: titulo,
            textoPreview: [`Esfuerzo ${rpe}/10`, fallos ? `${fallos} ejercicio(s) sin completar` : 'todo completado',
                registro.molestia ? `molestias en ${registro.molestia.zona}` : null].filter(Boolean).join(' · '),
        });
        onGuardada({ cambios, avisos });
    };

    return (
        <Marco titulo={titulo} onVolver={onVolver}>
            {crono && <CronoEjercicio titulo={crono.titulo} ejercicios={crono.ejercicios} pesoCorporal={plan.test.peso} onCerrar={() => setCrono(null)} />}
            <div style={st.columna}>
                {presc.avisos.map((a, i) => <div key={i} style={st.aviso}><AlertTriangle size={16} style={{ flexShrink: 0 }} /><span>{a}</span></div>)}
                {presc.notaEntrenador && <NotaEntrenador texto={presc.notaEntrenador} />}

                <button onClick={() => setCrono({ titulo, ejercicios: presc.ejercicios.filter(e => e.crono) })}
                    style={{ ...st.btnPrincipal, background: '#2471a3', justifyContent: 'center', padding: '12px 14px', fontSize: '0.95rem' }}>
                    <Timer size={18} /> Crono de toda la sesión
                </button>

                <Tarjeta estilo={{ background: '#f8f9fa' }}>
                    <strong style={{ fontSize: '0.9rem', color: '#2c3e50' }}>Calentamiento · 15-20 min</strong>
                    <p style={{ ...st.texto, margin: '4px 0 0' }}>Movilidad general, escalada muy fácil subiendo de dificultad poco a poco y, si vas a usar la multipresa, unas suspensiones progresivas en presas grandes.</p>
                </Tarjeta>

                {presc.ejercicios.map(e => (
                    <Tarjeta key={e.clave}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <h3 style={{ ...st.h3, margin: 0 }}>{e.nombre}</h3>
                            {e.carga != null && (
                                <span style={st.carga} title="Carga añadida a tu peso corporal">
                                    {textoCarga(e.carga)}
                                    <span style={{ fontWeight: 'normal', fontSize: '0.75rem', marginLeft: 6 }}>total {Math.round((plan.test.peso + e.carga) * 2) / 2} kg</span>
                                </span>
                            )}
                        </div>
                        {e.porcentaje != null && (
                            <div style={{ fontSize: '0.8rem', color: '#2471a3', fontWeight: 600, marginTop: 4 }}>{e.porcentaje} % {e.porcentajeDe}</div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '6px 0' }}>
                            <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#2c3e50' }}>{e.principal}</div>
                            {e.crono && (
                                <button onClick={() => setCrono({ titulo: e.nombre, ejercicios: [e] })} style={{ ...st.btnPrincipal, background: '#2471a3', flexShrink: 0 }}>
                                    <Timer size={16} /> Crono
                                </button>
                            )}
                        </div>
                        <ul style={{ margin: '0 0 10px 18px', fontSize: '0.82rem', color: '#555', lineHeight: 1.5 }}>
                            {e.lineas.map((l, i) => <li key={i}>{l}</li>)}
                        </ul>
                        <GuiaDesplegable ejercicio={e} />
                        <div style={{ height: 10 }} />
                        <Opciones etiqueta="¿Lo completaste?" valor={resultados[e.clave]} onChange={(v) => setResultados({ ...resultados, [e.clave]: v })} opciones={OPCIONES_RES} />
                    </Tarjeta>
                ))}

                <Tarjeta>
                    <h3 style={st.h3}>¿Cómo ha ido?</h3>
                    <label style={st.etiqueta}>Esfuerzo percibido: <strong>{rpe}</strong> · {textoRpe(rpe)}</label>
                    <input type="range" min={1} max={10} value={rpe} onChange={(ev) => setRpe(Number(ev.target.value))} style={{ width: '100%', marginBottom: 12 }} />
                    <Opciones etiqueta="¿Has notado molestias?" valor={molestia.zona} onChange={(v) => setMolestia({ ...molestia, zona: v })}
                        opciones={[['ninguna', 'Ninguna'], ['dedos', 'Dedos'], ['hombro', 'Hombro'], ['codo', 'Codo'], ['otra', 'Otra']]} />
                    {molestia.zona !== 'ninguna' && molestia.zona !== 'otra' && (
                        <Opciones etiqueta="¿Cómo de fuerte?" valor={molestia.nivel} onChange={(v) => setMolestia({ ...molestia, nivel: v })}
                            opciones={[['leve', 'Leve'], ['fuerte', 'Fuerte o dolor']]} />
                    )}
                    <label style={st.etiqueta}>Notas</label>
                    <textarea value={notas} onChange={(ev) => setNotas(ev.target.value)} rows={2} style={{ ...st.input, resize: 'vertical' }} placeholder="Bloques que probaste, sensaciones…" />
                    <button onClick={guardar} style={{ ...st.btnPrincipal, marginTop: 12 }}><CheckCircle size={16} /> Guardar sesión</button>
                </Tarjeta>
            </div>
        </Marco>
    );
}

const NotaEntrenador = ({ texto, titulo = 'Nota de tu entrenador' }) => (
    <div style={{ display: 'flex', gap: 8, background: '#eaf2f8', border: '1px solid #aed6f1', color: '#1b4f72', borderRadius: 10, padding: '10px 12px', fontSize: '0.86rem' }}>
        <MessageSquare size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span><strong>{titulo}:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{texto}</span></span>
    </div>
);

function SesionHecha({ titulo, registro, comentario, onVolver }) {
    const fecha = new Date(registro.fecha).toLocaleDateString();
    return (
        <Marco titulo={titulo} subtitulo={registro.saltada ? `Saltada el ${fecha}` : `Hecha el ${fecha}`} onVolver={onVolver}>
            <div style={st.columna}>
                {registro.saltada ? <Tarjeta><p style={st.texto}>Esta sesión se saltó.</p></Tarjeta> : (
                    <Tarjeta>
                        {registro.prescripcion?.map(e => (
                            <div key={e.clave} style={{ padding: '6px 0', borderBottom: '1px solid #f0f2f5', fontSize: '0.88rem' }}>
                                <strong>{e.nombre}</strong>: {e.principal}{e.carga != null ? ` · ${textoCarga(e.carga)}` : ''}{e.porcentaje != null ? ` · ${e.porcentaje} %` : ''}
                                <span style={{ float: 'right', color: registro.resultados?.[e.clave] === 'todo' ? '#27ae60' : '#e67e22' }}>
                                    {OPCIONES_RES.find(([v]) => v === registro.resultados?.[e.clave])?.[1]}
                                </span>
                            </div>
                        ))}
                        <p style={{ ...st.texto, marginTop: 10 }}>Esfuerzo: {registro.rpe}/10 · {textoRpe(registro.rpe)}</p>
                        {registro.molestia && <p style={st.texto}>Molestias: {registro.molestia.zona}{registro.molestia.zona !== 'otra' ? ` (${registro.molestia.nivel})` : ''}</p>}
                        {registro.notas && <p style={{ ...st.texto, fontStyle: 'italic' }}>{registro.notas}</p>}
                        {comentario && <NotaEntrenador texto={comentario} titulo="Comentario de tu entrenador" />}
                    </Tarjeta>
                )}
            </div>
        </Marco>
    );
}

const textoRpe = (r) => r <= 3 ? 'muy fácil' : r <= 6 ? 'moderado' : r <= 8 ? 'duro' : r === 9 ? 'muy duro' : 'máximo';
