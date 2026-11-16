import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Edit, Plus, X, EyeOff, Upload, Trash2, MapPin } from 'lucide-react';
import { parsearBloqueVias, cargarViasDeEquipador, guardarViasDeEquipador, clavesEnCroquis, claveVia } from '../utils/viasEquipador';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    esDeEquipador, fotosDeCroquis, nombreEquipador, esMiEquipador, esAdmin, puedeVerEquipador,
    puedeEditarCroquis, cambiarViaComoEquipador, solicitarVinculo, cancelarSolicitudVinculo,
    responderVinculo, guardarPreferenciasEquipador, desvincularEquipador,
} from '../utils/equipadores';
import { normalizarNombre } from '../utils/escuelas';
import { useAccesoDirecto } from '../utils/accesoDirecto';
import BotonAccesoDirecto from '../components/BotonAccesoDirecto';
import { GradeSelector } from '../CroquisEscalada';
import SelectorRegion from '../components/SelectorRegion';
import LocationPicker from '../components/LocationPicker';
import { PROVINCIAS_ES } from '../utils/regiones';

const ubicacion = (c) => [c.infoCroquis?.escuela, c.infoCroquis?.sector].filter(Boolean).join(' · ') || 'Sin ubicación';

// Agrupa las vías por escuela y sector. Se juntan nombres que solo difieren en mayúsculas o espacios.
// vias: [{ via, croquis }] de los croquis; sinCroquis: vías subidas en bloque aún sin croquis.
function agruparPorLugar(vias, sinCroquis) {
    const escuelas = new Map();
    const meter = (escuela, sector, item) => {
        const ke = normalizarNombre(escuela) || '~';
        if (!escuelas.has(ke)) escuelas.set(ke, { clave: ke.replace(/[^a-z0-9]+/gi, '-'), nombre: escuela?.trim() || 'Sin escuela', sectores: new Map(), total: 0 });
        const e = escuelas.get(ke);
        const ks = normalizarNombre(sector) || '~';
        if (!e.sectores.has(ks)) e.sectores.set(ks, { clave: ks, nombre: sector?.trim() || 'Sin sector', items: [] });
        e.sectores.get(ks).items.push(item);
        e.total++;
    };
    vias.forEach(item => meter(item.croquis.infoCroquis?.escuela, item.croquis.infoCroquis?.sector, item));
    sinCroquis.forEach(v => meter(v.escuela, v.sector, { subida: v }));
    // Alfabético, con «Sin escuela» / «Sin sector» al final
    const orden = (a, b) => (a.clave === '~') - (b.clave === '~') || a.nombre.localeCompare(b.nombre, 'es');
    return [...escuelas.entries()]
        .map(([k, e]) => ({ ...e, clave: k === '~' ? '~' : e.clave, sectores: [...e.sectores.values()].sort(orden) }))
        .sort(orden)
        .map(e => ({ ...e, clave: e.clave === '~' ? 'sin-escuela' : e.clave }));
}

export default function EquipadorPagina({ equipadorId, onVolver, onVerCroquis }) {
    const { usuario, setModalAuth } = useAuth();
    const [equipador, setEquipador] = useState(null);
    const [croquis, setCroquis] = useState([]);
    const [pendientes, setPendientes] = useState(new Set()); // viaIds con propuesta mía pendiente
    const [cargando, setCargando] = useState(true);
    const [editando, setEditando] = useState(null); // { via, croquis }
    const [anadiendo, setAnadiendo] = useState(false);
    const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'error', texto }

    const cargar = useCallback(async () => {
        try {
            const snap = await getDoc(doc(db, 'equipadores', equipadorId));
            if (!snap.exists()) { setEquipador(null); return; }
            setEquipador({ id: snap.id, ...snap.data() });
            const snapCroquis = await getDocs(collection(db, 'croquis_escalada'));
            setCroquis(snapCroquis.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.visibilidad || c.visibilidad === 'publico'));
        } catch (e) { console.error(e); }
        finally { setCargando(false); }
    }, [equipadorId]);

    useEffect(() => { cargar(); }, [cargar]);

    const mia = esMiEquipador(equipador, usuario);

    const cargarPendientes = useCallback(async () => {
        if (!usuario || !mia) return;
        try {
            const snap = await getDocs(query(collection(db, 'propuestas_via'), where('autorUid', '==', usuario.uid)));
            setPendientes(new Set(snap.docs.map(d => d.data()).filter(p => p.estado === 'pendiente' && p.equipadorId === equipadorId).map(p => `${p.croquisId}/${p.viaId}`)));
        } catch (e) { console.error(e); }
    }, [usuario, mia, equipadorId]);

    useEffect(() => { cargarPendientes(); }, [cargarPendientes]);

    useAccesoDirecto(equipador && puedeVerEquipador(equipador, usuario) ? nombreEquipador(equipador) : null);

    const vias = croquis.flatMap(c => fotosDeCroquis(c).flatMap(f => (f.vias || [])
        .filter(v => esDeEquipador(v.info, equipador || {}))
        .map(v => ({ via: v, croquis: c }))));

    // Vías subidas en bloque que aún no están en ningún croquis
    const [subidas, setSubidas] = useState(null);
    useEffect(() => { cargarViasDeEquipador(equipadorId).then(setSubidas).catch(() => setSubidas([])); }, [equipadorId]);
    const enCroquis = clavesEnCroquis(croquis);
    const sinCroquis = (subidas || []).filter(v => !enCroquis.has(claveVia(v.escuela, v.nombre)));
    const lugares = agruparPorLugar(vias, sinCroquis);
    const total = vias.length + sinCroquis.length;

    const accion = async (fn, textoOk) => {
        setAviso(null);
        try {
            await fn();
            if (textoOk) setAviso({ tipo: 'ok', texto: textoOk });
            await cargar();
        } catch (e) { setAviso({ tipo: 'error', texto: 'No se pudo completar: ' + e.message }); }
    };

    const cambiarVia = async (item, cambiosInfo) => {
        const r = await cambiarViaComoEquipador({ equipador, usuario, croquis: item.croquis, via: item.via, cambiosInfo });
        setAviso({ tipo: 'ok', texto: r === 'aplicado' ? 'Vía actualizada.' : 'Propuesta enviada a quien creó el croquis. Se aplicará cuando la acepte.' });
        await Promise.all([cargar(), cargarPendientes()]);
    };

    if (cargando) return <div style={st.mensaje}>Cargando…</div>;
    if (!equipador || !puedeVerEquipador(equipador, usuario)) {
        return (
            <div style={st.mensaje}>
                <p>{equipador ? 'Este equipador ha ocultado su ficha.' : 'Este equipador no existe.'}</p>
                <button onClick={onVolver} style={st.btnVolver}>Volver</button>
            </div>
        );
    }

    const solicitud = equipador.vinculoPendiente ? equipador.solicitudVinculo : null;
    const nombre = nombreEquipador(equipador);

    return (
        <div style={st.app}>
            <div style={st.topbar}>
                <button onClick={onVolver} style={st.btnIcono} title="Volver"><ArrowLeft size={20} /></button>
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'white', fontWeight: 'bold', overflowWrap: 'anywhere' }}>
                        🔩 {nombre}
                        {equipador.usuarioUid && <span title="Ficha gestionada por el propio equipador" style={st.verificado}>✔</span>}
                        {equipador.oculto && <span style={st.etiquetaOculta}><EyeOff size={12} /> Oculta</span>}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>
                        {total} {total === 1 ? 'vía equipada' : 'vías equipadas'}
                        {lugares.length > 0 && ` · ${lugares.length} ${lugares.length === 1 ? 'escuela' : 'escuelas'}`}
                    </div>
                </div>
                <div style={{ flex: 1 }} />
                {!equipador.oculto && <BotonAccesoDirecto nombre={nombre} estilo={st.btnIcono} />}
            </div>
            <div style={st.scroll}>
                <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {aviso && <div style={aviso.tipo === 'ok' ? st.ok : st.error}>{aviso.texto}</div>}

                    {mia && <PanelMiFicha equipador={equipador}
                        onGuardar={(prefs) => accion(() => guardarPreferenciasEquipador(equipador, prefs), 'Preferencias guardadas.')}
                        onDesvincular={() => window.confirm('¿Dejar de gestionar esta ficha? Las vías seguirán asociadas a ella.')
                            && accion(() => desvincularEquipador(equipador), 'Has dejado de gestionar esta ficha.')} />}

                    {!equipador.usuarioUid && (
                        <PanelVinculo equipador={equipador} usuario={usuario} solicitud={solicitud}
                            onPedirLogin={() => setModalAuth(true)}
                            onSolicitar={() => accion(() => solicitarVinculo(equipador, usuario), 'Solicitud enviada. Te avisaremos cuando se revise.')}
                            onCancelar={() => accion(() => cancelarSolicitudVinculo(equipador), 'Solicitud cancelada.')}
                            onResponder={(aceptar) => accion(() => responderVinculo(equipador, aceptar, usuario), aceptar ? 'Ficha vinculada al usuario.' : 'Solicitud rechazada.')} />
                    )}

                    {mia && <PanelViasEnBloque equipador={equipador} croquis={croquis} subidas={subidas} setSubidas={setSubidas} />}

                    {lugares.length > 0 && (
                        <div style={st.panel}>
                            <div style={st.panelTitulo}><MapPin size={15} style={{ verticalAlign: -2 }} /> Lugares donde ha equipado</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                {lugares.map((l, i) => (
                                    <button key={l.clave} style={st.chipLugar}
                                        onClick={() => document.getElementById(`escuela-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                                        <strong>{l.nombre}</strong>
                                        <span style={{ color: '#7f8c8d', fontSize: '0.76rem' }}>
                                            {l.total} {l.total === 1 ? 'vía' : 'vías'} · {l.sectores.length} {l.sectores.length === 1 ? 'sector' : 'sectores'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {mia && (
                        <button onClick={() => setAnadiendo(true)} style={st.btnAnadir}><Plus size={16} /> Añadir una vía que equipé</button>
                    )}
                    {total === 0 && <div style={{ ...st.lista, color: '#7f8c8d', fontStyle: 'italic', textAlign: 'center', padding: 24 }}>Aún no hay vías públicas de este equipador.</div>}

                    {lugares.map((l, i) => (
                        <div key={l.clave} id={`escuela-${i}`} style={{ ...st.lista, padding: 0, overflow: 'hidden', scrollMarginTop: 12 }}>
                            <div style={st.cabeceraEscuela}>
                                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>🏔️ {l.nombre}</span>
                                <span style={st.contador}>{l.total}</span>
                            </div>
                            {l.sectores.map(s => (
                                <div key={s.clave}>
                                    <div style={st.cabeceraSector}>
                                        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{s.nombre}</span>
                                        <span style={{ fontWeight: 'normal' }}>{s.items.length}</span>
                                    </div>
                                    <div style={{ padding: '0 8px' }}>
                                        {s.items.map(item => item.subida ? (
                                            <div key={`s-${item.subida.nombre}`} style={st.fila}>
                                                <div style={{ ...st.filaPrincipal, cursor: 'default' }}>
                                                    <span style={{ ...st.grado, background: '#95a5a6' }}>{item.subida.grado || '?'}</span>
                                                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                                        <strong style={{ overflowWrap: 'anywhere' }}>{item.subida.nombre}</strong>
                                                        {(item.subida.anio || item.subida.info) && (
                                                            <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d', overflowWrap: 'anywhere' }}>
                                                                {[item.subida.anio, item.subida.info].filter(Boolean).join(' · ')}
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                <span style={st.sinCroquis}>Sin croquis</span>
                                            </div>
                                        ) : (
                                            <div key={`${item.croquis.id}-${item.via.id}`} style={st.fila}>
                                                <button onClick={() => onVerCroquis(item.croquis)} style={st.filaPrincipal}>
                                                    <span style={{ ...st.grado, background: item.via.color || '#2c3e50' }}>{item.via.info?.grado || '?'}</span>
                                                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                                        <strong style={{ overflowWrap: 'anywhere' }}>{item.via.info?.nombre}</strong>
                                                        {item.via.info?.anio && <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d' }}>{item.via.info.anio}</span>}
                                                    </span>
                                                </button>
                                                {pendientes.has(`${item.croquis.id}/${item.via.id}`) && <span style={st.pendiente}>Propuesta pendiente</span>}
                                                {mia && (
                                                    <button onClick={() => setEditando(item)} style={st.btnEditar} title="Editar vía"><Edit size={15} /></button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {editando && (
                <EditarViaModal item={editando} directo={puedeEditarCroquis(editando.croquis, usuario)}
                    onClose={() => setEditando(null)}
                    onGuardar={async (cambios) => { await cambiarVia(editando, cambios); setEditando(null); }} />
            )}
            {anadiendo && (
                <AnadirViaModal equipador={equipador} croquis={croquis} usuario={usuario} pendientes={pendientes}
                    subidas={subidas} setSubidas={setSubidas}
                    onClose={() => setAnadiendo(false)}
                    onAnadir={(item, cambios) => cambiarVia(item, cambios)} />
            )}
        </div>
    );
}

// Lo que decide el equipador sobre su propia ficha
function PanelMiFicha({ equipador, onGuardar, onDesvincular }) {
    const [nombreVisible, setNombreVisible] = useState(equipador.nombreVisible || '');
    const [oculto, setOculto] = useState(Boolean(equipador.oculto));
    const [guardando, setGuardando] = useState(false);
    const cambiado = nombreVisible.trim() !== (equipador.nombreVisible || '') || oculto !== Boolean(equipador.oculto);

    const guardar = async () => {
        setGuardando(true);
        await onGuardar({ nombreVisible, oculto });
        setGuardando(false);
    };

    return (
        <div style={st.panel}>
            <div style={st.panelTitulo}>Tu ficha de equipador</div>
            <label style={st.label}>Nombre con el que apareces</label>
            <input value={nombreVisible} onChange={e => setNombreVisible(e.target.value)} maxLength={60}
                placeholder={equipador.nombre} style={st.input} />
            <p style={st.ayuda}>Si lo dejas vacío aparecerás como «{equipador.nombre}».</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontSize: '0.9rem', color: '#2c3e50' }}>
                <input type="checkbox" checked={oculto} onChange={e => setOculto(e.target.checked)} />
                Ocultar mi ficha
            </label>
            <p style={st.ayuda}>Oculta, tu ficha no aparece en la lista de equipadores y nadie más puede abrirla. En las vías se mostrará el nombre sin enlace.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={guardar} disabled={!cambiado || guardando} style={{ ...st.btnPrimario, opacity: cambiado ? 1 : 0.5 }}>
                    {guardando ? 'Guardando…' : 'Guardar'}
                </button>
                <button onClick={onDesvincular} style={st.btnSecundario}>Dejar de gestionar la ficha</button>
            </div>
        </div>
    );
}

const EJEMPLO_BLOQUE = `Bentué de Rasal; La Raya
La Esquina; 7b; 2015
Sesión Loskot; 8a; 2016

Otra vía; 6c+; 2019; Rodellar; El Pilar`;

// Subir de golpe las vías equipadas que aún no están en ningún croquis. Aparecen como
// sugerencias al poner nombre a una vía cuando alguien crea un croquis.
function PanelViasEnBloque({ equipador, croquis, subidas, setSubidas }) {
    const [abierto, setAbierto] = useState(false);
    const [texto, setTexto] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState(null);

    const enCroquis = clavesEnCroquis(croquis);
    const yaSubidas = new Set((subidas || []).map(v => claveVia(v.escuela, v.nombre)));
    const { vias, errores } = parsearBloqueVias(texto);
    const nuevas = [];
    const repetidas = [];
    vias.forEach(v => {
        const k = claveVia(v.escuela, v.nombre);
        if (enCroquis.has(k) || yaSubidas.has(k) || nuevas.some(n => claveVia(n.escuela, n.nombre) === k)) repetidas.push(v);
        else nuevas.push(v);
    });

    const guardar = async (lista, textoOk) => {
        setGuardando(true);
        setAviso(null);
        try {
            await guardarViasDeEquipador(equipador.id, nombreEquipador(equipador), lista);
            setSubidas(lista);
            setAviso({ tipo: 'ok', texto: textoOk });
            return true;
        } catch (e) {
            setAviso({ tipo: 'error', texto: 'No se pudo guardar: ' + e.message });
            return false;
        } finally { setGuardando(false); }
    };

    const subir = async () => {
        if (await guardar([...(subidas || []), ...nuevas], `${nuevas.length} vías subidas.`)) setTexto('');
    };

    const quitar = (idx) => {
        if (!window.confirm('¿Quitar esta vía de tu lista?')) return;
        guardar(subidas.filter((_, i) => i !== idx), 'Vía quitada.');
    };

    const pendientesCroquis = (subidas || []).map((v, idx) => ({ v, idx })).filter(({ v }) => !enCroquis.has(claveVia(v.escuela, v.nombre)));

    return (
        <div style={st.panel}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ ...st.panelTitulo, flex: 1 }}>Vías sin croquis {subidas ? `(${pendientesCroquis.length})` : ''}</div>
                <button onClick={() => setAbierto(a => !a)} style={{ ...st.btnPrimario, padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {abierto ? <X size={14} /> : <Upload size={14} />} {abierto ? 'Cerrar' : 'Subir en bloque'}
                </button>
            </div>
            <p style={st.ayuda}>Las vías que subas aquí se sugerirán a quien cree el croquis de su sector, con tu nombre como equipador.</p>
            {aviso && <div style={aviso.tipo === 'ok' ? st.ok : st.error}>{aviso.texto}</div>}

            {abierto && (
                <div style={{ marginTop: 8 }}>
                    <label style={st.label}>Vías, una por línea</label>
                    <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={9} placeholder={EJEMPLO_BLOQUE}
                        style={{ ...st.input, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.88rem' }} />
                    <div style={{ ...st.ayuda, lineHeight: 1.6 }}>
                        <b>Formato 1:</b> arriba <code>escuela; sector</code> y debajo <code>nombre; grado; año</code><br />
                        <b>Formato 2:</b> <code>nombre; grado; año; escuela; sector</code><br />
                        El año es opcional. Puedes poner varias cabeceras para cambiar de sector.
                    </div>

                    {texto.trim() && (
                        <div style={{ marginTop: 8, border: '1px solid #ecf0f1', borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
                            {nuevas.map((v, i) => (
                                <div key={'n' + i} style={{ ...st.fila, padding: '6px 8px', fontSize: '0.85rem' }}>
                                    <span style={{ ...st.grado, background: '#27ae60', padding: '3px 6px' }}>{v.grado || '?'}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}><strong>{v.nombre}</strong> <span style={{ color: '#7f8c8d' }}>· {[v.escuela, v.sector, v.anio].filter(Boolean).join(' · ')}</span></span>
                                </div>
                            ))}
                            {repetidas.map((v, i) => (
                                <div key={'r' + i} style={{ ...st.fila, padding: '6px 8px', fontSize: '0.85rem', opacity: 0.6 }}>
                                    <span style={{ ...st.grado, background: '#95a5a6', padding: '3px 6px' }}>{v.grado || '?'}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}><strong>{v.nombre}</strong> <span style={{ color: '#7f8c8d' }}>· ya existe, se omite</span></span>
                                </div>
                            ))}
                            {errores.map(e => (
                                <div key={'e' + e.linea} style={{ ...st.fila, padding: '6px 8px', fontSize: '0.82rem', color: '#c0392b' }}>
                                    Línea {e.linea}: {e.motivo} — «{e.texto}»
                                </div>
                            ))}
                        </div>
                    )}
                    <button onClick={subir} disabled={guardando || nuevas.length === 0}
                        style={{ ...st.btnPrimario, width: '100%', marginTop: 10, opacity: nuevas.length ? 1 : 0.5 }}>
                        {guardando ? 'Guardando…' : `Subir ${nuevas.length} ${nuevas.length === 1 ? 'vía' : 'vías'}`}
                    </button>
                </div>
            )}

            {pendientesCroquis.length > 0 && (
                <div style={{ marginTop: 10, maxHeight: 300, overflowY: 'auto' }}>
                    {pendientesCroquis.map(({ v, idx }) => (
                        <div key={idx} style={{ ...st.fila, padding: '6px 4px', fontSize: '0.88rem' }}>
                            <span style={{ ...st.grado, padding: '3px 6px', background: '#7f8c8d' }}>{v.grado || '?'}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <strong style={{ overflowWrap: 'anywhere' }}>{v.nombre}</strong>
                                <span style={{ display: 'block', fontSize: '0.76rem', color: '#7f8c8d' }}>{[v.escuela, v.sector, v.anio].filter(Boolean).join(' · ')}</span>
                            </span>
                            <button onClick={() => quitar(idx)} disabled={guardando} title="Quitar" style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', display: 'flex' }}><Trash2 size={15} /></button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Asociar la ficha a un usuario: el usuario lo solicita y la administración lo aprueba
function PanelVinculo({ equipador, usuario, solicitud, onPedirLogin, onSolicitar, onCancelar, onResponder }) {
    if (solicitud && esAdmin(usuario)) {
        return (
            <div style={{ ...st.panel, background: '#fff8e1' }}>
                <div style={st.panelTitulo}>Solicitud de vinculación</div>
                <p style={{ margin: '4px 0 10px', fontSize: '0.9rem' }}>
                    <strong>{solicitud.nombre || solicitud.email}</strong>{solicitud.nombre && solicitud.email ? ` (${solicitud.email})` : ''} dice ser «{equipador.nombre}».
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => onResponder(false)} style={st.btnSecundario}>Rechazar</button>
                    <button onClick={() => onResponder(true)} style={st.btnPrimario}>Aprobar</button>
                </div>
            </div>
        );
    }
    if (solicitud && solicitud.uid === usuario?.uid) {
        return (
            <div style={st.panel}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Has solicitado gestionar esta ficha. Te avisaremos cuando se revise.</p>
                <button onClick={onCancelar} style={{ ...st.btnSecundario, marginTop: 10 }}>Cancelar solicitud</button>
            </div>
        );
    }
    if (solicitud) return null;
    return (
        <div style={st.panel}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
                ¿Eres {equipador.nombre}? Vincula esta ficha a tu cuenta para elegir cómo apareces, ocultarla y mantener al día tus vías.
            </p>
            <button onClick={usuario ? onSolicitar : onPedirLogin} style={{ ...st.btnPrimario, marginTop: 10 }}>
                {usuario ? 'Soy yo, solicitar gestionarla' : 'Inicia sesión para reclamarla'}
            </button>
        </div>
    );
}

function EditarViaModal({ item, directo, onClose, onGuardar }) {
    const info = item.via.info || {};
    const [nombre, setNombre] = useState(info.nombre || '');
    const [grado, setGrado] = useState(info.grado || '');
    const [numero, setNumero] = useState(info.numero || '');
    const [anio, setAnio] = useState(info.anio || '');
    const [infoExtra, setInfoExtra] = useState(info.info || '');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    const guardar = async () => {
        if (!nombre.trim()) { setError('La vía necesita un nombre.'); return; }
        setGuardando(true);
        setError('');
        try {
            await onGuardar({ nombre: nombre.trim(), grado, numero: numero.trim(), anio: String(anio).trim(), info: infoExtra.trim() });
        } catch (e) {
            setError('No se pudo guardar: ' + e.message);
            setGuardando(false);
        }
    };

    return (
        <Modal titulo="Editar vía" onClose={onClose}>
            <p style={st.ayuda}>{ubicacion(item.croquis)}</p>
            {error && <div style={st.error}>{error}</div>}
            <label style={st.label}>Nombre de la vía</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} style={st.input} />
            <label style={st.label}>Grado</label>
            <GradeSelector value={grado} onChange={setGrado} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                    <label style={st.label}>Número en la pared</label>
                    <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ej: 7a" style={st.input} />
                </div>
                <div>
                    <label style={st.label}>Año</label>
                    <input type="number" value={anio} onChange={e => setAnio(e.target.value)} placeholder="Ej: 2018" style={st.input} />
                </div>
            </div>
            <label style={st.label}>Información adicional</label>
            <textarea value={infoExtra} onChange={e => setInfoExtra(e.target.value)} rows={3} style={{ ...st.input, resize: 'vertical', fontFamily: 'inherit' }} />
            <p style={st.ayuda}>{directo ? 'Puedes editar este croquis: el cambio se aplica al momento.' : 'El croquis es de otra persona: le llegará como propuesta y se aplicará cuando la acepte.'}</p>
            <button onClick={guardar} disabled={guardando} style={{ ...st.btnPrimario, width: '100%', marginTop: 6 }}>
                {guardando ? 'Guardando…' : directo ? 'Guardar' : 'Enviar propuesta'}
            </button>
        </Modal>
    );
}

// Comparación tolerante: sin mayúsculas, tildes ni espacios sobrantes
const sinTildes = (s) => normalizarNombre(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const parecido = (a, b) => {
    const x = sinTildes(a), y = sinTildes(b);
    return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
};

// Añadir una vía equipada: se piden sus datos y, mientras se escriben, se avisa si la escuela
// ya existe o si hay vías con un nombre parecido. El equipador decide si es una de ellas (y se
// propone a quien creó el croquis ponerle como equipador) o si crea una vía nueva sin croquis.
function AnadirViaModal({ equipador, croquis, usuario, pendientes, subidas, setSubidas, onClose, onAnadir }) {
    const [form, setForm] = useState({ escuela: '', sector: '', nombre: '', grado: '', anio: '', comentarios: '' });
    const [escuelasCreadas, setEscuelasCreadas] = useState([]);
    const [procesando, setProcesando] = useState(null);
    const [hechas, setHechas] = useState(new Set());
    const [error, setError] = useState('');
    const [creada, setCreada] = useState(false);
    const set = (k) => (v) => { setForm(f => ({ ...f, [k]: v })); setCreada(false); };

    useEffect(() => {
        getDocs(collection(db, 'escuelas'))
            .then(snap => setEscuelasCreadas(snap.docs.map(d => d.data()).filter(e => e.nombre?.trim())))
            .catch(() => {});
    }, []);

    // Escuelas conocidas: las creadas y las que aparecen en algún croquis
    const nombresEscuela = [...new Map([...escuelasCreadas.map(e => e.nombre.trim()), ...croquis.map(c => c.infoCroquis?.escuela?.trim())]
        .filter(Boolean).map(n => [sinTildes(n), n])).values()].sort((a, b) => a.localeCompare(b, 'es'));
    const escuelaExacta = nombresEscuela.find(n => sinTildes(n) === sinTildes(form.escuela));
    const escuelasParecidas = escuelaExacta ? [] : nombresEscuela.filter(n => parecido(n, form.escuela)).slice(0, 5);
    const sectoresEscuela = [...new Set(croquis
        .filter(c => sinTildes(c.infoCroquis?.escuela) === sinTildes(form.escuela))
        .map(c => c.infoCroquis?.sector?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const sectorExacto = sectoresEscuela.find(n => sinTildes(n) === sinTildes(form.sector));

    // Escuela o sector que aún no existen: hay que decir dónde están. Si el equipador ya subió
    // otra vía en ese mismo lugar nuevo, se reutiliza su ubicación.
    const lugarPrevio = (subidas || []).find(v => v.lat && v.provincia
        && sinTildes(v.escuela) === sinTildes(form.escuela) && sinTildes(v.sector) === sinTildes(form.sector));
    const lugarNuevo = Boolean(form.escuela.trim() && form.sector.trim() && (!escuelaExacta || !sectorExacto) && !lugarPrevio);
    const [lugar, setLugar] = useState({ pais: 'España', comunidad: '', provincia: '', lat: '', lng: '' });
    const setL = (campos) => { setLugar(l => ({ ...l, ...campos })); setCreada(false); };

    // Región conocida de la escuela (ficha de la escuela o sus croquis), para no pedirla otra vez
    useEffect(() => {
        if (!escuelaExacta) return;
        const e = escuelasCreadas.find(x => sinTildes(x.nombre) === sinTildes(escuelaExacta));
        const c = croquis.find(x => sinTildes(x.infoCroquis?.escuela) === sinTildes(escuelaExacta) && x.infoCroquis?.pais);
        const pais = e?.pais || c?.infoCroquis?.pais;
        if (pais) setLugar(l => ({ ...l, pais, comunidad: e?.comunidad || c?.infoCroquis?.comunidad || '', provincia: e?.provincia || c?.infoCroquis?.provincia || l.provincia }));
    }, [escuelaExacta]); // eslint-disable-line
    const provinciasSugeridas = lugar.pais === 'España' ? (PROVINCIAS_ES[lugar.comunidad] || Object.values(PROVINCIAS_ES).flat()) : [];

    // Vías de los croquis con un nombre parecido; primero las de la misma escuela
    const mismaEscuela = (c) => sinTildes(c.infoCroquis?.escuela) === sinTildes(form.escuela);
    const parecidas = croquis
        .flatMap(c => fotosDeCroquis(c).flatMap(f => (f.vias || []).map(v => ({ via: v, croquis: c }))))
        .filter(({ via }) => via.info?.nombre && parecido(via.info.nombre, form.nombre))
        .sort((a, b) => mismaEscuela(b.croquis) - mismaEscuela(a.croquis))
        .slice(0, 15);
    const yaSubida = (subidas || []).find(v => sinTildes(v.nombre) === sinTildes(form.nombre) && sinTildes(v.escuela) === sinTildes(form.escuela));

    const asignarme = async (item) => {
        const clave = `${item.croquis.id}/${item.via.id}`;
        setProcesando(clave);
        setError('');
        try {
            // Si la vía no tiene año y se ha indicado, se propone también
            await onAnadir(item, form.anio && !item.via.info?.anio ? { anio: String(form.anio).trim() } : {});
            setHechas(prev => new Set(prev).add(clave));
        } catch (e) { setError('No se pudo completar: ' + e.message); }
        setProcesando(null);
    };

    const faltan = [
        ...['escuela', 'sector', 'nombre'].filter(k => !form[k].trim()),
        ...(lugarNuevo ? [!lugar.provincia.trim() && 'provincia', !(lugar.lat && lugar.lng) && 'ubicación en el mapa'].filter(Boolean) : []),
    ];
    const crearNueva = async () => {
        if (faltan.length) { setError(`Falta: ${faltan.join(', ')}.`); return; }
        setProcesando('nueva');
        setError('');
        try {
            const nueva = {
                nombre: form.nombre.trim().slice(0, 120),
                grado: form.grado,
                anio: String(form.anio).trim(),
                escuela: (escuelaExacta || form.escuela.trim()).slice(0, 120),
                sector: form.sector.trim().slice(0, 120),
                info: form.comentarios.trim().slice(0, 1000),
                ...(lugarNuevo ? {
                    pais: lugar.pais.trim().slice(0, 60),
                    comunidad: lugar.comunidad.trim().slice(0, 80),
                    provincia: lugar.provincia.trim().slice(0, 80),
                    lat: String(lugar.lat), lng: String(lugar.lng),
                } : lugarPrevio ? {
                    pais: lugarPrevio.pais || '', comunidad: lugarPrevio.comunidad || '', provincia: lugarPrevio.provincia,
                    lat: lugarPrevio.lat, lng: lugarPrevio.lng,
                } : {}),
            };
            const lista = [...(subidas || []), nueva];
            await guardarViasDeEquipador(equipador.id, nombreEquipador(equipador), lista);
            setSubidas(lista);
            setCreada(true);
            setForm(f => ({ ...f, nombre: '', grado: '', anio: '', comentarios: '' }));
        } catch (e) { setError('No se pudo guardar: ' + e.message); }
        setProcesando(null);
    };

    return (
        <Modal titulo="Añadir una vía que equipé" onClose={onClose}>
            {error && <div style={st.error}>{error}</div>}
            {creada && <div style={st.ok}>Vía creada. Aparecerá en tu ficha y se sugerirá a quien haga el croquis de ese sector. Puedes añadir otra.</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                    <label style={st.label}>Escuela *</label>
                    <input value={form.escuela} onChange={e => set('escuela')(e.target.value)} list="lista-escuelas" placeholder="Ej: Rodellar" style={st.input} />
                    <datalist id="lista-escuelas">{nombresEscuela.map(n => <option key={n} value={n} />)}</datalist>
                </div>
                <div>
                    <label style={st.label}>Sector *</label>
                    <input value={form.sector} onChange={e => set('sector')(e.target.value)} list="lista-sectores" placeholder="Ej: Las Ventanas" style={st.input} />
                    <datalist id="lista-sectores">{sectoresEscuela.map(n => <option key={n} value={n} />)}</datalist>
                </div>
            </div>
            {form.escuela.trim() && (
                escuelaExacta
                    ? <div style={st.avisoInfo}>✔ «{escuelaExacta}» ya existe en TopoClimbing{escuelasCreadas.some(e => sinTildes(e.nombre) === sinTildes(escuelaExacta)) ? ' como escuela' : ''}. La vía se asociará a ella.</div>
                    : escuelasParecidas.length > 0
                        ? <div style={st.avisoAtencion}>
                            ¿Te refieres a {escuelasParecidas.map((n, i) => (
                                <React.Fragment key={n}>{i > 0 && ', '}<button onClick={() => set('escuela')(n)} style={st.enlace}>{n}</button></React.Fragment>
                            ))}?
                        </div>
                        : <div style={st.avisoInfo}>Escuela nueva: aún no existe en TopoClimbing.</div>
            )}
            {escuelaExacta && form.sector.trim() && (
                sectorExacto
                    ? <div style={st.avisoInfo}>✔ El sector «{sectorExacto}» ya existe en esta escuela.</div>
                    : <div style={st.avisoInfo}>Sector nuevo en {escuelaExacta}.</div>
            )}
            {lugarPrevio && (!escuelaExacta || !sectorExacto) && (
                <div style={st.avisoInfo}>📍 Se usará la ubicación que diste para este sector: {[lugarPrevio.provincia, lugarPrevio.comunidad].filter(Boolean).join(', ')}.</div>
            )}

            {lugarNuevo && (
                <div style={st.cajaLugar}>
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                        <MapPin size={15} style={{ verticalAlign: -2 }} /> {!escuelaExacta ? 'Escuela y sector nuevos' : 'Sector nuevo'}: ¿dónde están?
                    </div>
                    <SelectorRegion pais={lugar.pais} comunidad={lugar.comunidad}
                        onChange={r => setL({ ...r, provincia: r.comunidad === lugar.comunidad ? lugar.provincia : '' })}
                        inputStyle={st.input} labelStyle={st.label} />
                    <label style={{ ...st.label, marginTop: 0 }}>Provincia *</label>
                    <input value={lugar.provincia} onChange={e => setL({ provincia: e.target.value })} list="lista-provincias"
                        placeholder={lugar.pais === 'España' ? 'Ej: Huesca' : 'Provincia o departamento'} style={st.input} />
                    <datalist id="lista-provincias">{provinciasSugeridas.map(n => <option key={n} value={n} />)}</datalist>
                    <label style={st.label}>Ubicación del sector *</label>
                    <LocationPicker lat={lugar.lat} lng={lugar.lng} onChange={(la, ln) => setL({ lat: la, lng: ln })} />
                    {!(lugar.lat && lugar.lng) && <p style={st.ayuda}>Busca el lugar o toca el mapa para marcar dónde está el sector.</p>}
                </div>
            )}

            <label style={st.label}>Nombre de la vía *</label>
            <input value={form.nombre} onChange={e => set('nombre')(e.target.value)} placeholder="Ej: La Esquina" style={st.input} />

            {yaSubida && <div style={st.avisoAtencion}>Ya tienes subida «{yaSubida.nombre}» en {yaSubida.escuela}{yaSubida.sector ? ` · ${yaSubida.sector}` : ''}.</div>}

            {parecidas.length > 0 && (
                <div style={{ ...st.avisoAtencion, padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', fontWeight: 'bold' }}>
                        ⚠️ Hay {parecidas.length === 15 ? 'muchas' : parecidas.length} {parecidas.length === 1 ? 'vía con un nombre parecido' : 'vías con nombres parecidos'}. ¿Es alguna de estas?
                    </div>
                    <div style={{ background: 'white', maxHeight: 220, overflowY: 'auto' }}>
                        {parecidas.map(item => {
                            const { via, croquis: c } = item;
                            const clave = `${c.id}/${via.id}`;
                            const directo = puedeEditarCroquis(c, usuario);
                            const estado = esDeEquipador(via.info, equipador) ? 'Ya es tuya'
                                : hechas.has(clave) ? (directo ? 'Añadida' : 'Sugerencia enviada')
                                : pendientes.has(clave) ? 'Sugerencia pendiente' : null;
                            return (
                                <div key={clave} style={{ ...st.fila, padding: '8px 10px' }}>
                                    <span style={{ ...st.grado, background: via.color || '#2c3e50' }}>{via.info?.grado || '?'}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <strong style={{ overflowWrap: 'anywhere' }}>{via.info.nombre}</strong>
                                        <span style={{ display: 'block', fontSize: '0.76rem', color: '#7f8c8d' }}>
                                            {ubicacion(c)}{via.info?.anio ? ` · ${via.info.anio}` : ''}{via.info?.equipador ? ` · 🔩 ${via.info.equipador}` : ''}
                                        </span>
                                    </span>
                                    {estado
                                        ? <span style={st.pendiente}>{estado}</span>
                                        : <button onClick={() => asignarme(item)} disabled={procesando === clave}
                                            title={directo ? 'Te pone como equipador de esta vía' : 'Quien creó el croquis recibirá la sugerencia de ponerte como equipador'}
                                            style={{ ...st.btnPrimario, padding: '6px 10px', fontSize: '0.78rem', flexShrink: 0 }}>
                                            {procesando === clave ? '…' : directo ? 'Es esta' : 'Es esta: sugerir'}
                                        </button>}
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ padding: '6px 12px', fontSize: '0.76rem' }}>
                        Si el croquis es de otra persona, recibirá la sugerencia de ponerte como equipador.
                    </div>
                </div>
            )}

            <label style={st.label}>Grado</label>
            <GradeSelector value={form.grado} onChange={set('grado')} />
            <label style={st.label}>Año</label>
            <input type="number" value={form.anio} onChange={e => set('anio')(e.target.value)} placeholder="Ej: 2018" style={st.input} />
            <label style={st.label}>Comentarios</label>
            <textarea value={form.comentarios} onChange={e => set('comentarios')(e.target.value)} rows={3} maxLength={1000}
                placeholder="Ej: 12 chapas, reunión con cadena. Paso clave en el desplome." style={{ ...st.input, resize: 'vertical', fontFamily: 'inherit' }} />

            <button onClick={crearNueva} disabled={procesando === 'nueva' || faltan.length > 0}
                style={{ ...st.btnPrimario, width: '100%', marginTop: 14, opacity: faltan.length ? 0.5 : 1 }}>
                {procesando === 'nueva' ? 'Guardando…' : parecidas.length > 0 ? 'No es ninguna: crear vía nueva' : 'Crear vía'}
            </button>
            <p style={st.ayuda}>La vía nueva queda en tu ficha como «Sin croquis» y se sugerirá a quien cree el croquis de ese sector.</p>
        </Modal>
    );
}

function Modal({ titulo, onClose, children }) {
    return (
        <div style={st.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={st.modal}>
                <div style={st.modalHeader}>
                    <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '1.05rem' }}>{titulo}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer' }}><X size={20} /></button>
                </div>
                <div style={{ padding: 18, overflowY: 'auto' }}>{children}</div>
            </div>
        </div>
    );
}

const st = {
    app: { display: 'flex', flexDirection: 'column', height: '100dvh', fontFamily: "'Segoe UI', Tahoma, sans-serif", background: '#f4f6f8' },
    mensaje: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontFamily: 'sans-serif', color: '#7f8c8d', padding: 20, textAlign: 'center' },
    btnVolver: { marginTop: 12, padding: '9px 16px', background: '#2c3e50', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
    topbar: { background: '#2c3e50', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
    btnIcono: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex' },
    verificado: { marginLeft: 6, color: '#2ecc71', fontSize: '0.9rem' },
    etiquetaOculta: { marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 6, padding: '1px 6px', fontSize: '0.72rem', fontWeight: 'normal' },
    scroll: { flex: 1, overflowY: 'auto', padding: 16 },
    lista: { background: 'white', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
    panel: { background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', color: '#2c3e50' },
    panelTitulo: { fontWeight: 'bold', fontSize: '0.95rem', marginBottom: 4 },
    fila: { display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #ecf0f1', color: '#2c3e50' },
    filaPrincipal: { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, padding: '10px 8px', background: 'none', border: 'none', color: '#2c3e50', cursor: 'pointer', fontSize: '0.95rem' },
    grado: { color: 'white', borderRadius: 7, padding: '5px 8px', fontWeight: 'bold', fontSize: '0.85rem', flexShrink: 0, minWidth: 38, textAlign: 'center' },
    cajaLugar: { background: '#f8f9fa', border: '2px solid #3498db', borderRadius: 10, padding: 12, marginTop: 10, color: '#2c3e50', fontSize: '0.9rem' },
    avisoInfo: { background: '#eaf2fb', color: '#1f618d', padding: '7px 12px', borderRadius: 8, fontSize: '0.82rem', marginTop: 8 },
    avisoAtencion: { background: '#fff8e1', color: '#8a6d00', border: '1px solid #f5d76e', padding: '7px 12px', borderRadius: 8, fontSize: '0.84rem', marginTop: 8 },
    enlace: { background: 'none', border: 'none', padding: 0, color: '#2980b9', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' },
    chipLugar: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: '7px 12px', background: '#f4f6f8', border: '1px solid #dfe6e9', borderRadius: 10, cursor: 'pointer', color: '#2c3e50', fontSize: '0.88rem', textAlign: 'left' },
    cabeceraEscuela: { display: 'flex', alignItems: 'center', gap: 8, background: '#2c3e50', color: 'white', padding: '10px 14px', fontWeight: 'bold', fontSize: '1rem' },
    contador: { background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '1px 9px', fontSize: '0.8rem' },
    cabeceraSector: { display: 'flex', alignItems: 'center', gap: 8, background: '#ecf0f1', color: '#34495e', padding: '6px 14px', fontWeight: 'bold', fontSize: '0.85rem', borderBottom: '1px solid #dfe6e9' },
    sinCroquis: { background: '#ecf0f1', color: '#7f8c8d', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', fontWeight: 'bold', flexShrink: 0, marginRight: 4 },
    pendiente: { background: '#fff3cd', color: '#8a6d00', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', fontWeight: 'bold', flexShrink: 0 },
    btnEditar: { background: '#f39c12', color: 'white', border: 'none', borderRadius: 7, padding: '7px 9px', cursor: 'pointer', display: 'flex', flexShrink: 0, marginRight: 4 },
    btnAnadir: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: 10, marginBottom: 6, background: '#eafaf1', color: '#1e8449', border: '2px dashed #27ae60', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' },
    btnPrimario: { padding: '9px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
    btnSecundario: { padding: '9px 16px', background: '#f0f0f0', color: '#c0392b', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
    label: { display: 'block', fontWeight: 'bold', color: '#34495e', margin: '12px 0 6px', fontSize: '0.88rem' },
    input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '2px solid #bdc3c7', borderRadius: 8, fontSize: '1rem', color: '#2c3e50', outline: 'none' },
    ayuda: { color: '#7f8c8d', fontSize: '0.78rem', margin: '6px 0' },
    ok: { background: '#eafaf1', color: '#1e8449', padding: '9px 12px', borderRadius: 8, fontSize: '0.88rem' },
    error: { background: '#fdecea', color: '#c0392b', padding: '9px 12px', borderRadius: 8, fontSize: '0.88rem' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 },
    modal: { background: 'white', width: '100%', maxWidth: 560, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' },
    modalHeader: { background: '#f8f9fa', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ecf0f1', flexShrink: 0 },
};
