import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizarNombre } from './escuelas';
import { fotosDeCroquis } from './equipadores';

// Vías que un equipador sube en bloque antes de que estén dibujadas en un croquis.
// Un documento por equipador: vias_equipador/{equipadorId} = { vias: [{ nombre, grado, escuela, sector }] }

export const claveVia = (escuela, nombre) => `${normalizarNombre(escuela)}|${normalizarNombre(nombre)}`;

// 7B → 7b; los grados romanos (V+, IV) se dejan en mayúsculas
const limpiarGrado = (g) => {
    const s = (g || '').replace(/\s+/g, '');
    return /^[ivx]+[+-]?$/i.test(s) ? s.toUpperCase() : s.toLowerCase();
};

const esAnio = (s) => /^(1[89]|20)\d{2}$/.test(s);
// 6a, 7b+, 6c/6c+, V+, IV… o «?» si no se sabe
const esGrado = (s) => /^([3-9][abc]?\+?(\/[3-9]?[abc]?\+?)?|[ivx]+[+-]?|\?)$/i.test(s.replace(/\s+/g, ''));

// Interpreta el texto pegado. Formatos admitidos, que se pueden mezclar:
//   Escuela; Sector                         → cabecera: escuela y sector de las líneas siguientes
//   Nombre; grado; año                      → vía de la cabecera actual (el año es opcional)
//   Nombre; grado; año; escuela; sector     → vía con su propia escuela y sector
export function parsearBloqueVias(texto) {
    let escuela = '';
    let sector = '';
    const vias = [];
    const errores = [];
    texto.split(/\r?\n/).forEach((linea, i) => {
        const l = linea.trim();
        if (!l || l.startsWith('#')) return;
        const campos = l.split(';').map(c => c.trim());
        while (campos.length && !campos[campos.length - 1]) campos.pop();
        if (campos.length === 0) return;
        const error = (motivo) => errores.push({ linea: i + 1, texto: l, motivo });

        // Cabecera: dos campos sin grado ni año
        if (campos.length === 2 && !esGrado(campos[1]) && !esAnio(campos[1])) {
            [escuela, sector] = campos;
            return;
        }
        if (campos.length === 1) { error('Usa «Escuela; Sector» para la cabecera o «nombre; grado; año» para una vía'); return; }

        // El año puede ir en cualquier posición a partir del grado
        const posAnio = campos.findIndex((c, k) => k >= 2 && esAnio(c));
        const anio = posAnio >= 0 ? campos[posAnio] : '';
        const resto = campos.filter((_, k) => k !== posAnio);
        const [nombre, grado] = resto;
        const lugar = resto.length >= 4 ? { escuela: resto[2], sector: resto[3] } : { escuela, sector };

        if (!nombre) { error('Falta el nombre'); return; }
        if (resto.length === 3) { error('Sobra un campo: usa «nombre; grado; año» o «nombre; grado; año; escuela; sector»'); return; }
        if (!lugar.escuela || !lugar.sector) { error('Falta la cabecera «Escuela; Sector» encima'); return; }
        vias.push({
            nombre: nombre.slice(0, 120),
            grado: limpiarGrado(grado).slice(0, 20),
            anio,
            escuela: lugar.escuela.slice(0, 120),
            sector: lugar.sector.slice(0, 120),
        });
    });
    return { vias, errores };
}

export async function cargarViasDeEquipador(equipadorId) {
    const snap = await getDoc(doc(db, 'vias_equipador', equipadorId));
    return snap.exists() ? (snap.data().vias || []) : [];
}

export async function guardarViasDeEquipador(equipadorId, equipadorNombre, vias) {
    await setDoc(doc(db, 'vias_equipador', equipadorId), { vias, equipadorNombre, updatedAt: serverTimestamp() });
    cache = null;
}

// Claves escuela|nombre de todas las vías ya dibujadas en algún croquis
export const clavesEnCroquis = (croquis) => new Set(croquis.flatMap(c =>
    fotosDeCroquis(c).flatMap(f => (f.vias || []).filter(v => v.info?.nombre).map(v => claveVia(c.infoCroquis?.escuela, v.info.nombre)))));

let cache = null;

// Vías subidas por los equipadores que aún no aparecen en ningún croquis
export function cargarViasSugeridas() {
    if (!cache) {
        cache = Promise.all([getDocs(collection(db, 'vias_equipador')), getDocs(collection(db, 'croquis_escalada'))])
            .then(([snapVias, snapCroquis]) => {
                const existentes = clavesEnCroquis(snapCroquis.docs.map(d => d.data()));
                return snapVias.docs.flatMap(d => (d.data().vias || []).map(v => ({
                    ...v, equipadorId: d.id, equipadorNombre: d.data().equipadorNombre || '',
                }))).filter(v => !existentes.has(claveVia(v.escuela, v.nombre)));
            })
            .catch(e => { console.error(e); cache = null; return []; });
    }
    return cache;
}
