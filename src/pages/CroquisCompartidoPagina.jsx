import React, { useState, useEffect } from 'react';
import { Send, Plus, Pencil, Undo2, Check, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { aplicarCambiosCroquis, puedeEditarCroquis, resolverEquipadores } from '../utils/equipadores';
import CroquisImagen from '../components/CroquisImagen';
import {
    FormularioVia, CampoAutor, EnlaceNoDisponible, fotosDeDatos,
    valorDeVia, cambiosDeValor, errorDeValor, st as estilos,
} from './TarjetaViaPagina';

const COLORES = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e84393'];
export const MAX_CAMBIOS_CROQUIS = 100;

const mismosCambios = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Vía tal como quedaría con lo que se está proponiendo, para dibujarla sobre la foto
const viaConValor = (via, valor) => ({
    ...via,
    inicio: valor.inicio, fin: valor.fin, intermedios: valor.intermedios,
    info: { ...via.info, nombre: valor.nombre, grado: valor.grado },
    textos: [],
});

// Propuestas de cambios en todo el croquis sin registrarse: modificar cualquier vía o añadir
// vías nuevas. Todo llega en una sola propuesta. Se entra de dos formas:
//  - token: enlace de sugerencias; la propuesta va a quien creó el enlace.
//  - croquisId: croquis abierto a propuestas; la propuesta va al autor del croquis.
// Quien puede editar el croquis (autor o invitado por correo) guarda los cambios directamente.
export default function CroquisCompartidoPagina({ token = null, croquisId = null, viaInicial = null, onSalir }) {
    const { usuario } = useAuth();
    const [estado, setEstado] = useState('cargando'); // cargando | listo | invalida
    const [tarjeta, setTarjeta] = useState(null); // { croquisId, creadoPor }
    const [croquis, setCroquis] = useState(null);
    const [datosCroquis, setDatosCroquis] = useState(null);
    const [fotoIdx, setFotoIdx] = useState(0);
    // clave → { tipo: 'editar' | 'nueva', fotoId, viaId?, color, valor }
    const [ediciones, setEdiciones] = useState({});
    const [abierta, setAbierta] = useState(null); // { clave, valor } en edición
    const [autorNombre, setAutorNombre] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [mensaje, setMensaje] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                let t = null;
                if (token) {
                    const snapT = await getDoc(doc(db, 'tarjetas_croquis', token));
                    if (!snapT.exists()) { setEstado('invalida'); return; }
                    t = snapT.data();
                }
                const snap = await getDoc(doc(db, 'croquis_escalada', t?.croquisId || croquisId));
                if (!snap.exists()) { setEstado('invalida'); return; }
                const datos = snap.data();
                if (!t) {
                    t = { croquisId: snap.id, creadoPor: datos.creadoPor };
                    if (!datos.abiertoPropuestas && !puedeEditarCroquis(datos, usuario)) { setEstado('cerrado'); return; }
                }
                const fotos = fotosDeDatos(datos).filter(f => f.imagenUrl || f.soloLista);
                if (fotos.length === 0) { setEstado('invalida'); return; }
                setTarjeta(t);
                setDatosCroquis(datos);
                // Abrir directamente la vía desde la que se pidió proponer cambios
                const iv = viaInicial != null ? fotos.findIndex(f => (f.vias || []).some(v => String(v.id) === String(viaInicial))) : -1;
                if (iv >= 0) {
                    const v = fotos[iv].vias.find(x => String(x.id) === String(viaInicial));
                    setFotoIdx(iv);
                    setAbierta({ clave: `e:${v.id}`, valor: valorDeVia(v) });
                }
                setCroquis({
                    titulo: [datos.infoCroquis?.escuela, datos.infoCroquis?.sector].filter(Boolean).join(' · '),
                    fotos,
                });
                setEstado('listo');
            } catch (e) {
                console.error(e);
                setEstado('invalida');
            }
        })();
    }, [token, croquisId, usuario?.uid]); // eslint-disable-line

    if (estado === 'cargando') return <div style={estilos.pantallaMensaje}>Cargando…</div>;
    if (estado === 'invalida') return <EnlaceNoDisponible onSalir={onSalir} />;
    if (estado === 'cerrado') {
        return (
            <div style={estilos.pantallaMensaje}>
                <p>Este croquis no está abierto a propuestas.</p>
                <button onClick={onSalir} style={{ ...estilos.btnGuardar, background: '#2c3e50', marginTop: 14 }}>Ir al inicio</button>
            </div>
        );
    }

    // Autor o invitado por correo: sin validación del propietario
    const directo = puedeEditarCroquis(datosCroquis, usuario);

    const foto = croquis.fotos[fotoIdx];
    const conTrazado = Boolean(foto.imagenUrl);
    const nuevasDeFoto = Object.entries(ediciones).filter(([, e]) => e.tipo === 'nueva' && e.fotoId === foto.id);
    const numCambios = Object.keys(ediciones).length;

    // Vías de la foto con los cambios propuestos aplicados, sin la que se está editando
    const viasVisibles = [
        ...(foto.vias || []).map(v => {
            const e = ediciones[`e:${v.id}`];
            return { via: e ? viaConValor(v, e.valor) : v, clave: `e:${v.id}`, original: v };
        }),
        ...nuevasDeFoto.map(([clave, e]) => ({ via: viaConValor({ id: clave, color: e.color }, e.valor), clave })),
    ];

    const abrir = (clave) => {
        if (!clave) return;
        setMensaje(null);
        if (clave.startsWith('n:') && !ediciones[clave]) {
            setAbierta({ clave, valor: valorDeVia(null) });
        } else {
            const original = (foto.vias || []).find(v => `e:${v.id}` === clave);
            setAbierta({ clave, valor: ediciones[clave]?.valor || valorDeVia(original) });
        }
        window.scrollTo?.(0, 0);
    };

    const colorDe = (clave) => ediciones[clave]?.color
        || (foto.vias || []).find(v => `e:${v.id}` === clave)?.color
        || COLORES[viasVisibles.length % COLORES.length];

    const confirmarEdicion = () => {
        const { clave, valor } = abierta;
        const problema = errorDeValor(valor, conTrazado);
        if (problema) { setMensaje({ tipo: 'error', texto: problema }); return; }
        if (clave.startsWith('e:')) {
            const original = foto.vias.find(v => `e:${v.id}` === clave);
            if (mismosCambios(cambiosDeValor(valor, conTrazado), cambiosDeValor(valorDeVia(original), conTrazado))) {
                // Sin diferencias con lo que ya hay: no se propone nada
                setEdiciones(({ [clave]: _, ...resto }) => resto);
                setAbierta(null);
                return;
            }
            setEdiciones(es => ({ ...es, [clave]: { tipo: 'editar', fotoId: foto.id, viaId: original.id, color: original.color, valor } }));
        } else {
            if (!ediciones[clave] && numCambios >= MAX_CAMBIOS_CROQUIS) {
                setMensaje({ tipo: 'error', texto: `Como máximo ${MAX_CAMBIOS_CROQUIS} cambios por propuesta.` });
                return;
            }
            setEdiciones(es => ({ ...es, [clave]: { tipo: 'nueva', fotoId: foto.id, color: colorDe(clave), valor } }));
        }
        setAbierta(null);
    };

    const descartar = (clave) => setEdiciones(({ [clave]: _, ...resto }) => resto);

    const enviar = async () => {
        if (!directo && !autorNombre.trim()) { setMensaje({ tipo: 'error', texto: 'Escribe tu nombre para que sepan quién propone los cambios.' }); return; }
        if (numCambios === 0) { setMensaje({ tipo: 'error', texto: 'Aún no has cambiado ni añadido ninguna vía.' }); return; }
        setGuardando(true);
        setMensaje(null);
        try {
            const cambios = Object.values(ediciones).map(e => {
                const f = croquis.fotos.find(x => x.id === e.fotoId);
                return {
                    tipo: e.tipo,
                    fotoId: e.fotoId,
                    ...(e.tipo === 'editar' ? { viaId: e.viaId } : { color: e.color }),
                    ...cambiosDeValor(e.valor, Boolean(f?.imagenUrl)),
                };
            });
            if (directo) {
                const infos = await resolverEquipadores(cambios.map(c => ({ info: c.info })), usuario.uid);
                const perdidos = await aplicarCambiosCroquis(tarjeta.croquisId, cambios.map((c, i) => ({ ...c, info: infos[i].info })), null);
                setEdiciones({});
                setMensaje({ tipo: 'ok', texto: perdidos ? `Cambios guardados. ${perdidos} no se aplicaron porque la vía o la foto ya no existen.` : 'Cambios guardados en el croquis.' });
                setGuardando(false);
                return;
            }
            await addDoc(collection(db, 'propuestas_croquis'), {
                ...(token ? { token } : {}),
                croquisId: tarjeta.croquisId,
                paraUid: tarjeta.creadoPor,
                autorNombre: autorNombre.trim().slice(0, 60),
                cambios,
                estado: 'pendiente',
                createdAt: serverTimestamp(),
            });
            setEdiciones({});
            setMensaje({ tipo: 'ok', texto: 'Propuesta enviada. Los cambios se aplicarán cuando los acepten.' });
        } catch (e) {
            setMensaje({ tipo: 'error', texto: 'No se pudo enviar: ' + e.message });
        }
        setGuardando(false);
    };

    const cabecera = (
        <div style={estilos.topbar}>
            {croquisId && (
                <button onClick={() => { if (numCambios === 0 || window.confirm('Tienes cambios sin enviar. ¿Salir igualmente?')) onSalir(); }}
                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }} title="Volver al croquis">
                    <ArrowLeft size={20} />
                </button>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: 'white', fontWeight: 'bold' }}>{directo ? 'Editar vías del croquis' : 'Proponer cambios en el croquis'}</div>
                {croquis.titulo && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', overflowWrap: 'anywhere' }}>{croquis.titulo}</div>}
            </div>
            {!abierta && (
                <button onClick={enviar} disabled={guardando} style={estilos.btnGuardar}>
                    <Send size={16} /> {guardando ? (directo ? 'Guardando…' : 'Enviando…') : `${directo ? 'Guardar' : 'Enviar'}${numCambios ? ` (${numCambios})` : ''}`}
                </button>
            )}
        </div>
    );

    const avisos = mensaje && <div style={{ ...(mensaje.tipo === 'ok' ? estilos.ok : estilos.error), marginBottom: 10 }}>{mensaje.texto}</div>;

    // Edición de una vía: el mismo formulario que la tarjeta de vía
    if (abierta) {
        const esNueva = abierta.clave.startsWith('n:');
        return (
            <div style={estilos.app}>
                {cabecera}
                <div style={estilos.scroll}>
                    <div style={estilos.tarjeta}>
                        {avisos}
                        <h3 style={{ margin: '0 0 4px', color: '#2c3e50', fontSize: '1rem' }}>{esNueva ? 'Vía nueva' : `Editar ${abierta.valor.nombre || 'vía'}`}</h3>
                        <FormularioVia key={abierta.clave} foto={foto}
                            otrasVias={viasVisibles.filter(x => x.clave !== abierta.clave && x.via.inicio).map(x => x.via)}
                            color={colorDe(abierta.clave)} valor={abierta.valor}
                            onChange={v => { setAbierta(a => ({ ...a, valor: v })); setMensaje(null); }} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <button onClick={() => { setAbierta(null); setMensaje(null); }} style={{ ...s.btn, background: '#f0f0f0', color: '#2c3e50' }}>Cancelar</button>
                            <button onClick={confirmarEdicion} style={{ ...s.btn, background: '#27ae60', color: 'white' }}><Check size={16} /> Listo</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={estilos.app}>
            {cabecera}
            <div style={estilos.scroll}>
                <div style={estilos.tarjeta}>
                    {avisos}
                    {directo ? (
                        <p style={estilos.ayuda}>Puedes editar este croquis: los cambios se guardan directamente, sin revisión.</p>
                    ) : (
                        <CampoAutor valor={autorNombre} onChange={v => { setAutorNombre(v); setMensaje(null); }}
                            texto="Corrige las vías que quieras o añade vías nuevas. Todo llegará en una sola propuesta a quien gestiona el croquis; si la acepta, aparecerás como colaborador de esas vías." />
                    )}

                    {croquis.fotos.length > 1 && (
                        <div style={s.selectorFoto}>
                            <button onClick={() => setFotoIdx(i => i - 1)} disabled={fotoIdx === 0} style={estilos.btnCuadrado}><ChevronLeft size={16} /></button>
                            <span style={{ flex: 1, textAlign: 'center', fontWeight: 'bold', color: '#34495e', fontSize: '0.88rem' }}>
                                {foto.nombre || `Foto ${fotoIdx + 1}`} <span style={{ color: '#95a5a6', fontWeight: 'normal' }}>({fotoIdx + 1}/{croquis.fotos.length})</span>
                            </span>
                            <button onClick={() => setFotoIdx(i => i + 1)} disabled={fotoIdx === croquis.fotos.length - 1} style={estilos.btnCuadrado}><ChevronRight size={16} /></button>
                        </div>
                    )}

                    {conTrazado && (
                        <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden' }}>
                            <CroquisImagen foto={{ ...foto, vias: viasVisibles.map(x => x.via), combinaciones: [], formas: foto.formas || [] }}
                                onClickVia={v => abrir(viasVisibles.find(x => x.via.id === v.id)?.clave)} />
                        </div>
                    )}
                    {conTrazado && <p style={estilos.ayuda}>Toca una vía en la foto o en la lista para cambiarla.</p>}

                    <div style={{ marginTop: 10 }}>
                        {viasVisibles.length === 0 && <p style={{ color: '#7f8c8d', fontStyle: 'italic', fontSize: '0.88rem' }}>Esta foto aún no tiene vías.</p>}
                        {viasVisibles.map(({ via, clave }, i) => {
                            const e = ediciones[clave];
                            return (
                                <div key={clave} style={{ ...s.fila, background: e ? '#fff8e1' : 'white' }}>
                                    <span style={{ ...s.num, background: via.color || '#e74c3c' }}>{i + 1}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 'bold', color: '#2c3e50', overflowWrap: 'anywhere' }}>{via.info?.nombre || 'Sin nombre'}</div>
                                        <div style={{ fontSize: '0.78rem', color: '#7f8c8d' }}>
                                            {via.info?.grado || '–'}
                                            {e && <strong style={{ color: e.tipo === 'nueva' ? '#27ae60' : '#d68910', marginLeft: 8 }}>{e.tipo === 'nueva' ? 'Nueva' : 'Modificada'}</strong>}
                                        </div>
                                    </div>
                                    {e && <button onClick={() => descartar(clave)} style={estilos.btnCuadrado} title="Deshacer"><Undo2 size={15} /></button>}
                                    <button onClick={() => abrir(clave)} style={estilos.btnCuadrado} title="Editar"><Pencil size={15} /></button>
                                </div>
                            );
                        })}
                        <button onClick={() => abrir(`n:${Date.now()}`)} style={s.btnAnadir}><Plus size={16} /> Añadir vía</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const s = {
    btn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
    selectorFoto: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 },
    fila: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid #ecf0f1' },
    num: { width: 26, height: 26, borderRadius: '50%', color: 'white', fontWeight: 'bold', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    btnAnadir: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginTop: 12, padding: 10, background: 'white', color: '#27ae60', border: '2px dashed #27ae60', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
};
