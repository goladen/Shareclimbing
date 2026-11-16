import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Entrenadores: el atleta añade el email de su entrenador al plan (entrenadoresEmail). Al abrir el
// panel, el entrenador apunta su uid en el plan (entrenadoresUid) para poder recibir avisos.
// El entrenador puede cambiar ajustes, bloqueos, bloques extra, notas y comentarios, pero no las
// sesiones ni los registros del atleta.
//
// Catálogo: bloques_entrenamiento/{id} = { autorUid, autorNombre, nombre, categoria, descripcion,
//   ejercicio, estado: 'pendiente'|'aprobado'|'rechazado', motivo?, createdAt, revisadoAt? }
// Los entrenadores proponen bloques y la administración los aprueba.

export const COL_PLANES = 'planes_entrenamiento';
export const COL_BLOQUES = 'bloques_entrenamiento';


// Avisos en la campana. tipo: entreno_sesion | entreno_entrenador | bloque_aprobado | bloque_rechazado
export function notificar(uids, datos) {
    const destinos = [...new Set((uids || []).filter(Boolean))];
    if (!destinos.length) return Promise.resolve();
    const lote = writeBatch(db);
    // Las reglas limitan la longitud de los textos de los avisos
    const textos = Object.fromEntries(Object.entries(datos).map(([k, v]) =>
        [k, typeof v === 'string' ? v.slice(0, k === 'textoPreview' ? 500 : 80) : v]));
    destinos.forEach(uid => lote.set(doc(collection(db, 'notificaciones', uid, 'items')), {
        ...textos, leido: false, createdAt: serverTimestamp(),
    }));
    return lote.commit().catch(e => console.error(e));
}

export const TIPOS_NOTIF_ENTRENO = {
    entreno_sesion: '#/entrenamiento/entrenador',
    entreno_invitacion: '#/entrenamiento',
    entreno_aceptado: '#/entrenamiento/entrenador',
    entreno_entrenador: '#/entrenamiento',
    bloque_aprobado: '#/entrenamiento/catalogo',
    bloque_rechazado: '#/entrenamiento/catalogo',
};

export const nombreDe = (usuario) => usuario?.displayName || usuario?.email?.split('@')[0] || 'Alguien';

// Resumen del estado de un atleta para la lista del entrenador
export function resumenAtleta(plan, uidEntrenador) {
    const registros = Object.entries(plan.registros || {}).map(([id, r]) => ({ id, ...r })).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const hechos = registros.filter(r => !r.saltada);
    const visto = plan.vistoPorEntrenador?.[uidEntrenador] || '';
    const nuevos = registros.filter(r => (r.fecha || '') > visto).length;
    const ultimo = hechos[0] || null;
    const alertas = [];
    const recientes = hechos.slice(0, 3);
    if (recientes.some(r => r.molestia)) alertas.push('molestias');
    if (recientes.some(r => r.rpe >= 9)) alertas.push('esfuerzo muy alto');
    if (recientes.some(r => Object.values(r.resultados || {}).includes('no'))) alertas.push('ejercicios sin completar');
    const diasSin = ultimo ? Math.floor((Date.now() - new Date(ultimo.fecha)) / 86400000) : null;
    if (diasSin != null && diasSin > 10) alertas.push(`${diasSin} días sin entrenar`);
    return { registros, nuevos, ultimo, alertas, diasSin };
}

// ───────────── Planes del entrenador (plantillas) e invitaciones ─────────────
// planes_entrenador/{id} = { entrenadorUid, entrenadorEmail, entrenadorNombre, nombre, descripcion,
//   semanas, sesiones: [{ id, semana, orden, tipo, componentes, extras: [bloque], nota }], mensaje, createdAt, updatedAt }
// invitaciones_plan/{id} = { entrenadorUid, entrenadorEmail, entrenadorNombre, atletaEmail, plantillaId,
//   plan: { nombre, semanas, sesiones, mensaje }, estado: 'pendiente'|'aceptada'|'rechazada', planId?, createdAt }
// Al aceptar, el atleta crea su propio plan (su copia) con las cargas calculadas con su test.
export const COL_PLANTILLAS = 'planes_entrenador';
export const COL_INVITACIONES = 'invitaciones_plan';

// Copia limpia de la plantilla para guardarla en una invitación
export const resumenPlantilla = (p) => ({
    nombre: p.nombre, semanas: p.semanas, mensaje: p.mensaje || '',
    sesiones: p.sesiones.map(s => ({ id: s.id, semana: s.semana, orden: s.orden, tipo: s.tipo, componentes: s.componentes, extras: s.extras || [], nota: s.nota || '' })),
});

// Separa las sesiones de la plantilla en lo que guarda el plan del atleta
function partes(sesionesPlantilla) {
    const sesiones = [], extras = {}, notasEntrenador = {};
    for (const s of sesionesPlantilla) {
        sesiones.push({ id: s.id, semana: s.semana, orden: s.orden, tipo: s.tipo, componentes: s.componentes });
        if (s.extras?.length) extras[s.id] = s.extras;
        if (s.nota) notasEntrenador[s.id] = s.nota;
    }
    return { sesiones, extras, notasEntrenador };
}

// Plan del atleta a partir de una invitación aceptada
export function planDesdeInvitacion(inv, { uid, test, testId, perfil, atletaNombre, atletaEmail }) {
    const { sesiones, extras, notasEntrenador } = partes(inv.plan.sesiones);
    return {
        creadoPor: uid, testId: testId || null, test, perfil,
        semanas: inv.plan.semanas, sesiones, extras, notasEntrenador, mensajeEntrenador: inv.plan.mensaje || '',
        ajustes: {}, registros: {}, bloqueos: {}, comentarios: {}, estado: 'activo',
        atletaNombre, atletaEmail,
        entrenadoresEmail: [inv.entrenadorEmail], entrenadoresUid: [inv.entrenadorUid],
        plantillaId: inv.plantillaId, plantillaNombre: inv.plan.nombre, invitacionId: inv.id,
    };
}

// Cambios de la plantilla aplicados al plan de un atleta, sin tocar las sesiones ya hechas
export function cambiosDePlantilla(plan, plantilla) {
    const hecha = (id) => !!plan.registros?.[id];
    const nuevas = partes(plantilla.sesiones);
    const porId = Object.fromEntries(plan.sesiones.map(s => [s.id, s]));
    const sesiones = nuevas.sesiones.map(s => hecha(s.id) ? porId[s.id] : s);
    // Las hechas que ya no estén en la plantilla se conservan para no perder el feedback
    plan.sesiones.filter(s => hecha(s.id) && !sesiones.some(x => x.id === s.id)).forEach(s => sesiones.push(s));
    sesiones.sort((a, b) => a.semana - b.semana || a.orden - b.orden);
    const extras = {}, notasEntrenador = {};
    for (const s of sesiones) {
        const origen = hecha(s.id) ? { extras: plan.extras?.[s.id], nota: plan.notasEntrenador?.[s.id] } : { extras: nuevas.extras[s.id], nota: nuevas.notasEntrenador[s.id] };
        if (origen.extras?.length) extras[s.id] = origen.extras;
        if (origen.nota) notasEntrenador[s.id] = origen.nota;
    }
    return { sesiones, semanas: plantilla.semanas, extras, notasEntrenador, mensajeEntrenador: plantilla.mensaje || '', plantillaNombre: plantilla.nombre };
}
