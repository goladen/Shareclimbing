import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const normalizarNombre = (s) => (s || '').trim().toLowerCase();

// Los croquis de una escuela con el mismo nombre de sector forman un solo sector
export const contarSectores = (croquis) => {
    const nombres = new Set();
    let sinNombre = 0;
    croquis.forEach(c => {
        const sector = normalizarNombre(c.infoCroquis?.sector);
        if (sector) nombres.add(sector); else sinNombre++;
    });
    return nombres.size + sinNombre;
};

export const nombreCroquis = (infoCroquis) => infoCroquis?.sector?.trim() || 'Croquis sin nombre';

// Avisa a quien creó la escuela de que se le ha añadido un croquis. Un fallo aquí
// no debe deshacer la asociación, que ya está guardada.
export async function notificarAsociacion({ escuela, croquisId, infoCroquis, usuario }) {
    if (!escuela.creadoPor || escuela.creadoPor === usuario.uid) return;
    try {
        await addDoc(collection(db, 'notificaciones', escuela.creadoPor, 'items'), {
            tipo: 'croquis_asociado',
            croquisId,
            croquisNombre: nombreCroquis(infoCroquis),
            escuelaId: escuela.id,
            escuelaNombre: escuela.nombre,
            autorNombre: usuario.displayName || usuario.email.split('@')[0],
            textoPreview: '',
            leido: false,
            createdAt: serverTimestamp(),
        });
    } catch (e) { console.error(e); }
}
