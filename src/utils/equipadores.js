import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizarNombre } from './escuelas';

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

// Asigna a cada vía la ficha de su equipador, creándola si aún no existe
export async function resolverEquipadores(vias, uid) {
    const pendientes = vias.filter(v => v.info?.equipador?.trim() && !v.info.equipadorId);
    if (pendientes.length === 0) return vias;
    const existentes = await cargarEquipadores({ refrescar: true });
    const porNombre = new Map(existentes.map(e => [normalizarNombre(e.nombre), e.id]));
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
    return Boolean(info?.equipador) && normalizarNombre(info.equipador) === normalizarNombre(equipador.nombre);
}

export const fotosDeCroquis = (c) => c.fotos?.length > 0
    ? c.fotos
    : [{ id: 'f0', imagenUrl: c.imagenUrl, vias: c.vias || [], formas: c.formas || [] }];
