import { addDoc, collection, doc, getDocs, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { normalizarNombre } from './escuelas';

export const ADMIN_EMAIL = 'goladen@gmail.com';

let cache = null;

// Lista de equipadores, compartida entre todos los campos de la sesión
export function cargarEquipadores({ refrescar = false } = {}) {
    if (!cache || refrescar) {
        cache = getDocs(collection(db, 'equipadores'))
            .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
            .catch(e => { console.error(e); cache = null; return []; });
    }
    return cache;
}

export const invalidarEquipadores = () => { cache = null; };

export function useEquipadores() {
    const [lista, setLista] = useState(null);
    useEffect(() => { cargarEquipadores().then(setLista); }, []);
    return lista;
}

// Nombre con el que se muestra: el que elige el propio equipador o el de la ficha
export const nombreEquipador = (e) => e?.nombreVisible?.trim() || e?.nombre || '';

// Nombres por los que se reconoce una ficha al escribirla en una vía
const clavesEquipador = (e) => [e.nombre, e.nombreVisible].filter(Boolean).map(normalizarNombre);
export const coincideNombre = (e, texto) => clavesEquipador(e).includes(normalizarNombre(texto));

export const esAdmin = (usuario) => usuario?.email === ADMIN_EMAIL;
export const esMiEquipador = (e, usuario) => Boolean(usuario && e?.usuarioUid === usuario.uid);
export const puedeVerEquipador = (e, usuario) => !e?.oculto || esMiEquipador(e, usuario) || esAdmin(usuario);

export const puedeEditarCroquis = (c, usuario) => Boolean(usuario && (
    c.creadoPor === usuario.uid
    || (c.editores || []).includes(usuario.uid)
    || (c.editoresEmail || []).includes(usuario.email)));

// Asigna a cada vía la ficha de su equipador, creándola si aún no existe
export async function resolverEquipadores(vias, uid) {
    const pendientes = vias.filter(v => v.info?.equipador?.trim() && !v.info.equipadorId);
    if (pendientes.length === 0) return vias;
    const existentes = await cargarEquipadores({ refrescar: true });
    const porNombre = new Map(existentes.flatMap(e => clavesEquipador(e).map(k => [k, e.id])));
    for (const v of pendientes) {
        const clave = normalizarNombre(v.info.equipador);
        if (!porNombre.has(clave)) {
            const ref = await addDoc(collection(db, 'equipadores'), { nombre: v.info.equipador.trim(), creadoPor: uid, createdAt: serverTimestamp() });
            porNombre.set(clave, ref.id);
        }
    }
    cache = null;
    return vias.map(v => v.info?.equipador?.trim() && !v.info.equipadorId
        ? { ...v, info: { ...v.info, equipadorId: porNombre.get(normalizarNombre(v.info.equipador)) } }
        : v);
}

// Vías de un equipador. Las vías guardadas antes de existir las fichas solo tienen el nombre.
export function esDeEquipador(info, equipador) {
    if (info?.equipadorId) return info.equipadorId === equipador.id;
    return Boolean(info?.equipador) && coincideNombre(equipador, info.equipador);
}

export const fotosDeCroquis = (c) => c.fotos?.length > 0
    ? c.fotos
    : [{ id: 'f0', imagenUrl: c.imagenUrl, vias: c.vias || [], formas: c.formas || [] }];

// Aplica unos cambios a una vía. colaborador: nombre que se añade a sus colaboradores, o null.
export const aplicarAVia = (via, cambios, colaborador) => {
    const colaboradores = via.info?.colaboradores || [];
    const info = {
        ...via.info,
        ...cambios.info,
        colaboradores: !colaborador || colaboradores.includes(colaborador) ? colaboradores : [...colaboradores, colaborador],
    };
    return {
        ...via,
        ...(cambios.trazado || {}),
        info,
        textos: (via.textos || []).map(t => t.type === 'grado' ? { ...t, text: info.grado } : t),
    };
};

// Cambia una vía de un croquis. Se relee el croquis para no pisar cambios hechos mientras tanto en otras vías.
export async function modificarVia(croquisId, viaId, transformar) {
    const ref = doc(db, 'croquis_escalada', croquisId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('El croquis ya no existe.');
        let encontrada = false;
        const fotos = fotosDeCroquis(snap.data()).map(f => ({
            ...f,
            vias: (f.vias || []).map(v => {
                if (v.id !== viaId) return v;
                encontrada = true;
                return transformar(v);
            }),
        }));
        if (!encontrada) throw new Error('La vía ya no existe en el croquis.');
        tx.update(ref, { fotos, vias: fotos[0]?.vias || [], updatedAt: serverTimestamp() });
    });
}

// Vía nueva a partir de un cambio de tipo 'nueva' de una propuesta de croquis
export const viaDeCambioNuevo = (c, id, colaborador) => aplicarAVia(
    { id, inicio: null, fin: null, intermedios: [], textos: [], color: c.color || '#e74c3c', grosor: 4, info: {} },
    c, colaborador);

// Aplica varios cambios de una propuesta de croquis en una sola transacción.
// cambios: [{ tipo: 'editar', fotoId, viaId, info, trazado } | { tipo: 'nueva', fotoId, color, info, trazado }]
// Devuelve cuántos no se pudieron aplicar (vía o foto eliminadas mientras tanto).
export async function aplicarCambiosCroquis(croquisId, cambios, colaborador) {
    const ref = doc(db, 'croquis_escalada', croquisId);
    let perdidos = 0;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('El croquis ya no existe.');
        perdidos = 0;
        const base = Date.now();
        const fotos = fotosDeCroquis(snap.data()).map(f => ({ ...f, vias: [...(f.vias || [])] }));
        cambios.forEach((c, n) => {
            const f = fotos.find(x => x.id === c.fotoId);
            if (!f) { perdidos++; return; }
            if (c.tipo === 'editar') {
                const i = f.vias.findIndex(v => v.id === c.viaId);
                if (i < 0) { perdidos++; return; }
                f.vias[i] = aplicarAVia(f.vias[i], c, colaborador);
                return;
            }
            const nueva = viaDeCambioNuevo(c, base + n, colaborador);
            // Se coloca según su inicio, de izquierda a derecha, sin reordenar las demás
            const pos = nueva.inicio ? f.vias.findIndex(v => v.inicio && v.inicio.x > nueva.inicio.x) : -1;
            if (pos < 0) f.vias.push(nueva); else f.vias.splice(pos, 0, nueva);
        });
        tx.update(ref, { fotos, vias: fotos[0]?.vias || [], updatedAt: serverTimestamp() });
    });
    return perdidos;
}

// Cambios de un equipador vinculado en una de sus vías. Si puede editar el croquis se aplican
// directamente; si no, llegan como propuesta a quien creó el croquis. Devuelve 'aplicado' o 'propuesto'.
export async function cambiarViaComoEquipador({ equipador, usuario, croquis, via, cambiosInfo }) {
    const { colaboradores, ...infoActual } = via.info || {};
    const info = { ...infoActual, ...cambiosInfo, equipador: nombreEquipador(equipador), equipadorId: equipador.id };
    if (puedeEditarCroquis(croquis, usuario)) {
        await modificarVia(croquis.id, via.id, v => aplicarAVia(v, { info }, null));
        return 'aplicado';
    }
    await addDoc(collection(db, 'propuestas_via'), {
        croquisId: croquis.id,
        viaId: via.id,
        paraUid: croquis.creadoPor,
        autorNombre: nombreEquipador(equipador).slice(0, 60),
        autorUid: usuario.uid,
        equipadorId: equipador.id,
        cambios: { info, trazado: null },
        estado: 'pendiente',
        createdAt: serverTimestamp(),
    });
    return 'propuesto';
}

// --- Vinculación de una ficha con un usuario ---

export async function solicitarVinculo(equipador, usuario) {
    await updateDoc(doc(db, 'equipadores', equipador.id), {
        solicitudVinculo: { uid: usuario.uid, nombre: usuario.displayName || '', email: usuario.email || '', fecha: new Date().toISOString() },
        vinculoPendiente: true,
    });
    cache = null;
}

export async function cancelarSolicitudVinculo(equipador) {
    await updateDoc(doc(db, 'equipadores', equipador.id), { solicitudVinculo: null, vinculoPendiente: false });
    cache = null;
}

// La administración acepta o rechaza la solicitud y se avisa a quien la hizo
export async function responderVinculo(equipador, aceptar, admin) {
    const sol = equipador.solicitudVinculo;
    await updateDoc(doc(db, 'equipadores', equipador.id), aceptar
        ? { usuarioUid: sol.uid, solicitudVinculo: null, vinculoPendiente: false }
        : { solicitudVinculo: null, vinculoPendiente: false });
    cache = null;
    try {
        await addDoc(collection(db, 'notificaciones', sol.uid, 'items'), {
            tipo: aceptar ? 'equipador_vinculado' : 'equipador_rechazado',
            autorNombre: admin.displayName || 'La administración',
            equipadorId: equipador.id,
            equipadorNombre: nombreEquipador(equipador),
            leido: false,
            createdAt: serverTimestamp(),
        });
    } catch (e) { console.error(e); }
}

export async function guardarPreferenciasEquipador(equipador, { nombreVisible, oculto }) {
    await updateDoc(doc(db, 'equipadores', equipador.id), { nombreVisible: nombreVisible.trim().slice(0, 60), oculto: Boolean(oculto) });
    cache = null;
}

export async function desvincularEquipador(equipador) {
    await updateDoc(doc(db, 'equipadores', equipador.id), { usuarioUid: null, nombreVisible: '', oculto: false });
    cache = null;
}
