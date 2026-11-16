import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

// Animaciones de técnica: un muñeco de perfil (mirando a la derecha) que pasa por posturas clave.
// Cada postura fija cabeza, hombro, cadera, manos y pies; codos y rodillas se calculan con
// cinemática inversa para que brazos y piernas mantengan siempre su longitud.

const L = { brazo: 25, antebrazo: 25, muslo: 33, pierna: 32 };
const COLOR = { cuerpo: '#2c3e50', error: '#c0392b', marca: '#f39c12', escena: '#95a5a6', madera: '#c8a27a' };

// Articulación intermedia de dos segmentos (codo o rodilla). dir elige hacia qué lado se dobla.
function articulacion(a, b, l1, l2, dir) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.max(0.001, Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01));
    const ux = dx / Math.hypot(dx, dy || 0.001), uy = dy / Math.hypot(dx, dy || 0.001);
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    return [a[0] + ux * x - uy * h * dir, a[1] + uy * x + ux * h * dir];
}
// Si el punto está fuera de alcance, se dibuja el segmento estirado en esa dirección
function alcance(a, b, largo) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return d <= largo ? b : [a[0] + (b[0] - a[0]) * largo / d, a[1] + (b[1] - a[1]) * largo / d];
}

// ───────────────────────────── Posturas ─────────────────────────────

const P = {
    // Colgado de la regleta o barra (manos a la altura y = 32)
    colgadoActivo: { cab: [93, 66], hom: [99, 80], cad: [97, 130], mA: [107, 32], mB: [104, 32], pA: [99, 196], pB: [96, 195] },
    colgadoPasivo: { cab: [95, 74], hom: [100, 84], cad: [98, 134], mA: [107, 32], mB: [104, 32], pA: [99, 199], pB: [96, 198] },
    piesEnCaja: { cab: [93, 69], hom: [99, 83], cad: [96, 133], mA: [107, 32], mB: [104, 32], pA: [108, 178], pB: [104, 178] },
    // Dominada arriba
    dominadaArriba: { cab: [92, 27], hom: [96, 45], cad: [91, 95], mA: [107, 32], mB: [104, 32], pA: [95, 160], pB: [92, 159] },
    // Un brazo: la mano libre cuelga junto al cuerpo
    unBrazo: { cab: [93, 67], hom: [101, 80], cad: [98, 130], mA: [106, 32], mB: [99, 129], pA: [99, 196], pB: [96, 195] },
    unBrazoMal: { cab: [92, 75], hom: [102, 84], cad: [100, 134], mA: [106, 32], mB: [98, 133], pA: [101, 199], pB: [98, 198] },
    // Bloqueos a un brazo (la mano libre en una cinta)
    bloqueo90: { cab: [89, 46], hom: [94, 60], cad: [90, 110], mA: [107, 32], mB: [120, 76], pA: [92, 174], pB: [89, 173] },
    bloqueo120: { cab: [90, 55], hom: [95, 69], cad: [91, 119], mA: [107, 32], mB: [120, 84], pA: [94, 183], pB: [91, 182] },
    // Core colgado
    piernasArriba: { cab: [92, 66], hom: [98, 80], cad: [95, 130], mA: [107, 32], mB: [104, 32], pA: [160, 126], pB: [158, 129] },
    rodillasPecho: { cab: [92, 66], hom: [98, 80], cad: [95, 129], mA: [107, 32], mB: [104, 32], pA: [116, 152], pB: [113, 154] },
    // Flexiones (de lado, en el suelo)
    flexionArriba: { cab: [143, 164], hom: [130, 170], cad: [80, 178], mA: [132, 221], mB: [129, 221], pA: [30, 220], pB: [33, 220], brazoDir: 1, piernaDir: 1 },
    flexionAbajo: { cab: [142, 199], hom: [128, 204], cad: [78, 207], mA: [132, 221], mB: [129, 221], pA: [30, 220], pB: [33, 220], brazoDir: 1, piernaDir: 1 },
    flexionCadera: { cab: [143, 166], hom: [130, 172], cad: [82, 196], mA: [132, 221], mB: [129, 221], pA: [30, 220], pB: [33, 220], brazoDir: 1, piernaDir: 1 },
    // Movilidad: de pie y en sentadilla profunda
    dePie: { cab: [101, 91], hom: [100, 105], cad: [100, 155], mA: [104, 152], mB: [98, 152], pA: [102, 220], pB: [98, 220] },
    sentadilla: { cab: [111, 139], hom: [104, 152], cad: [90, 196], mA: [118, 186], mB: [115, 188], pA: [111, 220], pB: [107, 220] },
};

// Campus: listones en una tabla algo desplomada
const TABLA_X = (y) => 104 + (y - 10) * 20 / 280;
const LISTON = (n) => { const y = 150 - (n - 1) * 22; return [TABLA_X(y) - 4, y]; };
const campus = (bajo, alto, subida) => {
    const yb = LISTON(bajo)[1];
    return {
        cab: [104, yb + 30 - subida], hom: [100, yb + 44 - subida], cad: [95, yb + 94 - subida],
        mA: LISTON(alto), mB: LISTON(bajo), pA: [100, yb + 150 - subida], pB: [96, yb + 151 - subida],
    };
};
P.campus1 = campus(1, 1, 0);
P.campus13 = campus(1, 3, 22);
P.campus35 = { ...campus(3, 5, 22), mA: LISTON(3), mB: LISTON(5) };

// Pared de escalada (presas en x = 146)
const pared = (sube, mano) => ({
    cab: [134, 64 - sube], hom: [127, 78 - sube], cad: [120, 128 - sube],
    mA: [146, 50 - (mano === 'A' ? 25 : 0)], mB: [146, 95 - sube - (mano === 'B' ? 0 : 0)],
    pA: [146, 185 - sube], pB: [146, 160 - sube],
});
P.pared1 = pared(0);
P.pared2 = { ...pared(25), mA: [146, 50], mB: [146, 95] };
P.pared3 = { ...pared(25), mA: [146, 50], mB: [146, 25] };

// ───────────────────────────── Animaciones ─────────────────────────────
// t: ms de transición hasta la postura; h: ms que se mantiene. error: postura incorrecta.

const ANIMACIONES = {
    suspension: {
        escena: 'multipresa', vista: '0 0 200 230',
        pasos: [
            { p: 'piesEnCaja', t: 700, h: 1200, nota: 'Agarra en semiarqueo, con los pies apoyados' },
            { p: 'colgadoActivo', t: 800, h: 2600, nota: 'Hombros activos: escápulas abajo y atrás, codos casi estirados', marca: 'hom' },
            { p: 'colgadoPasivo', t: 600, h: 1800, nota: 'Evita: colgar pasivo, con los hombros en las orejas', error: true, marca: 'hom' },
            { p: 'colgadoActivo', t: 600, h: 1800, nota: 'Core firme y cuerpo quieto, sin balanceo', marca: 'cad' },
            { p: 'piesEnCaja', t: 800, h: 1200, nota: 'Baja apoyando los pies: nunca te sueltes de golpe' },
        ],
    },
    repeaters: {
        escena: 'multipresa', vista: '0 0 200 230',
        pasos: [
            { p: 'piesEnCaja', t: 500, h: 700, nota: '3 s de descanso: apoya los pies o suelta' },
            { p: 'colgadoActivo', t: 500, h: 1800, nota: '7 s colgado, con hombros activos y el mismo agarre', marca: 'hom' },
            { p: 'piesEnCaja', t: 500, h: 700, nota: '3 s de descanso' },
            { p: 'colgadoActivo', t: 500, h: 1800, nota: 'Mantén el semiarqueo aunque llegue el cansancio' },
            { p: 'colgadoPasivo', t: 500, h: 1500, nota: 'Evita: que los hombros se vayan subiendo al cansarte', error: true, marca: 'hom' },
        ],
    },
    unbrazo: {
        escena: 'multipresa', vista: '0 0 200 230', polea: true,
        pasos: [
            { p: 'colgadoActivo', t: 700, h: 1200, nota: 'Cuélgate a dos manos con el contrapeso puesto' },
            { p: 'unBrazo', t: 700, h: 2600, nota: 'Suelta una mano: hombro activo y codo algo flexionado', marca: 'hom' },
            { p: 'unBrazoMal', t: 600, h: 1800, nota: 'Evita: dejar caer el hombro o que el cuerpo gire', error: true, marca: 'hom' },
            { p: 'unBrazo', t: 600, h: 1600, nota: 'Brazo libre relajado, sin agarrarte a nada' },
            { p: 'colgadoActivo', t: 700, h: 1000, nota: 'Vuelve a dos manos antes de bajar; alterna brazos' },
        ],
    },
    dominada: {
        escena: 'barra', vista: '0 0 200 230',
        pasos: [
            { p: 'colgadoActivo', t: 600, h: 1200, nota: 'Empieza activando las escápulas, sin doblar aún los codos', marca: 'hom' },
            { p: 'dominadaArriba', t: 1000, h: 800, nota: 'Lleva el pecho a la barra, con los codos hacia abajo' },
            { p: 'colgadoActivo', t: 2000, h: 900, nota: 'Baja controlando en 2-3 s, hasta casi estirar' },
            { p: 'colgadoPasivo', t: 500, h: 1500, nota: 'Evita: acabar abajo con los hombros sueltos', error: true, marca: 'hom' },
        ],
    },
    bloqueo: {
        escena: 'barra', vista: '0 0 200 230', cinta: true,
        pasos: [
            { p: 'dominadaArriba', t: 900, h: 700, nota: 'Sube con los dos brazos' },
            { p: 'bloqueo90', t: 700, h: 2000, nota: 'Bloquea a 90° con un brazo: hombro y escápula firmes', marca: 'hom' },
            { p: 'bloqueo120', t: 800, h: 2000, nota: 'Baja a 120° y aguanta: la cinta ayuda solo lo justo' },
            { p: 'colgadoActivo', t: 1500, h: 1000, nota: 'Baja controlado y alterna el brazo' },
        ],
    },
    campus: {
        escena: 'campus', vista: '0 0 200 300',
        pasos: [
            { p: 'campus1', t: 700, h: 1200, nota: 'Las dos manos en el listón 1, en semiarqueo o extendido' },
            { p: 'campus13', t: 450, h: 900, nota: 'Impulso explosivo: atrapa el 3 con el brazo algo flexionado', marca: 'mA' },
            { p: 'campus35', t: 450, h: 1400, nota: 'Sigue la escalera con la otra mano hasta el 5', marca: 'mB' },
            { p: 'campus1', t: 1200, h: 900, nota: 'Desciende o baja a los pies; nunca saltes al suelo desde arriba' },
        ],
    },
    core: {
        escena: 'barra', vista: '0 0 200 230',
        pasos: [
            { p: 'colgadoActivo', t: 600, h: 1000, nota: 'Colgado activo, sin balanceo', marca: 'hom' },
            { p: 'piernasArriba', t: 1100, h: 700, nota: 'Sube las piernas rectas hasta la horizontal', marca: 'cad' },
            { p: 'colgadoActivo', t: 1800, h: 900, nota: 'Baja lento (2-3 s), sin arquear la zona lumbar' },
            { p: 'rodillasPecho', t: 900, h: 1300, nota: 'Si aún no llegas: rodillas al pecho' },
            { p: 'colgadoActivo', t: 1300, h: 700, nota: 'Mantén las escápulas activas todo el rato' },
        ],
    },
    flexion: {
        escena: 'suelo', vista: '0 0 200 230',
        pasos: [
            { p: 'flexionArriba', t: 600, h: 1000, nota: 'Cuerpo en línea de la cabeza a los talones', marca: 'cad' },
            { p: 'flexionAbajo', t: 1300, h: 500, nota: 'Baja con los codos a unos 45° del cuerpo, no abiertos', marca: 'hom' },
            { p: 'flexionArriba', t: 900, h: 800, nota: 'Empuja hasta estirar, sin bloquear los codos' },
            { p: 'flexionCadera', t: 600, h: 1600, nota: 'Evita: hundir la cadera o sacar el culo', error: true, marca: 'cad' },
        ],
    },
    pared: {
        escena: 'pared', vista: '0 0 200 230',
        pasos: [
            { p: 'pared1', t: 800, h: 1000, nota: 'Cadera cerca de la pared, brazos lo más estirados posible', marca: 'cad' },
            { p: 'pared2', t: 1000, h: 800, nota: 'Sube los pies con precisión: empuja con las piernas' },
            { p: 'pared3', t: 900, h: 1200, nota: 'Alcanza con el brazo y agarra solo lo necesario', marca: 'mB' },
            { p: 'pared1', t: 1600, h: 900, nota: 'Respira y suelta los brazos cuando puedas' },
        ],
    },
    movilidad: {
        escena: 'suelo', vista: '0 0 200 230',
        pasos: [
            { p: 'dePie', t: 700, h: 900, nota: 'Pies a la anchura de la cadera, puntas algo abiertas' },
            { p: 'sentadilla', t: 1500, h: 2500, nota: 'Sentadilla profunda: talones en el suelo y espalda larga', marca: 'cad' },
            { p: 'dePie', t: 1500, h: 900, nota: 'Mantén 30-60 s respirando, sin rebotes' },
        ],
    },
};

// ───────────────────────────── Guía de técnica ─────────────────────────────

const ALARMA_DEDOS = [
    'Dolor punzante en la base de un dedo o un chasquido: para y no vuelvas a cargar hasta que lo valore un fisioterapeuta',
    'Molestia en el codo que va a más durante la sesión',
];

export const TECNICA = {
    suspension: {
        como: ['Calienta 15-20 min y haz 2-3 suspensiones progresivas antes de las series', 'Agarre semiarqueo: segunda falange a unos 90° y pulgar sin bloquear', 'Hombros activos: escápulas abajo y atrás, codos casi estirados (no bloqueados)', 'Core firme y cuerpo quieto; sube y baja apoyando los pies'],
        errores: ['Colgar pasivo, con los hombros en las orejas', 'Arqueo completo o pulgar encima del índice: es la máxima carga para las poleas', 'Colgarte o soltarte de golpe', 'Seguir cuando el agarre se abre o pierdes la posición'],
        alarma: ALARMA_DEDOS,
    },
    largas: {
        como: ['Carga baja: se progresa alargando el tiempo, no añadiendo peso', 'Agarre semiarqueo y hombros activos de principio a fin', 'Respira con calma y termina con 3-5 s de margen', 'Sube y baja apoyando los pies'],
        errores: ['Llegar al fallo en cada serie', 'Dejar que los hombros se suelten al final de la serie', 'Arqueo completo con el pulgar encima'],
        alarma: ALARMA_DEDOS,
    },
    repeaters: {
        como: ['7 s colgado y 3 s de descanso (suelta o apoya los pies)', 'El mismo agarre y la misma posición de hombros en todas las repeticiones', 'Las últimas deben costar, sin llegar al fallo total'],
        errores: ['Que el semiarqueo se abra o se cierre al cansarte', 'Que los hombros se vayan subiendo', 'Acortar los descansos'],
        alarma: ALARMA_DEDOS,
    },
    unbrazo: {
        como: ['Solo con años de multipresa y sin ninguna molestia', 'Contrapeso con polea hasta la carga indicada', 'Hombro activo y codo algo flexionado (10-20°)', 'Brazo libre relajado; alterna brazos con 90 s de descanso'],
        errores: ['Dejar caer el hombro o que el cuerpo gire', 'Codo totalmente bloqueado', 'Usar una regleta más pequeña que a dos manos'],
        alarma: [...ALARMA_DEDOS, 'Dolor en la parte delantera del hombro'],
    },
    campus: {
        como: ['Solo con experiencia, sin molestias y muy bien calentado', 'Empieza por listones grandes y escaleras cortas (1-2-3)', 'Movimiento explosivo: tira con la espalda y atrapa el listón con el brazo algo flexionado', 'Agarre semiarqueo o extendido; nunca arqueo completo'],
        errores: ['Hacerlo cansado o al final de la sesión', 'Caer a peso muerto sobre un brazo estirado', 'Saltar al suelo desde arriba: baja a los pies o desciende la escalera', 'Seguir cuando pierdes velocidad o precisión'],
        alarma: [...ALARMA_DEDOS, 'Dolor en el hombro al atrapar el listón'],
    },
    dominada: {
        como: ['Empieza colgado activo: escápulas abajo antes de doblar los codos', 'Sube llevando el pecho a la barra, con los codos hacia abajo y algo adelante', 'Baja controlando en 2-3 s, hasta casi estirar', 'Con lastre: cinturón ajustado y el peso sin balancearse'],
        errores: ['Balanceo o patadas para subir', 'Medias repeticiones: bajar solo hasta la mitad', 'Encoger los hombros o adelantar la cabeza para llegar'],
        alarma: ['Dolor en la parte delantera del hombro o en el codo'],
    },
    bloqueo: {
        como: ['Sube con dos brazos y suelta uno arriba', 'Aguanta 3-5 s a 90° y a 120° con hombro y escápula firmes', 'El otro brazo, en una cinta, ayuda solo lo justo', 'Alterna brazos'],
        errores: ['Girar el tronco o dejar caer el hombro', 'Bajar sin control', 'Tirones bruscos'],
        alarma: ['Dolor en el hombro, el codo o el bíceps'],
    },
    core: {
        como: ['Colgado activo, sin balanceo', 'Sube las piernas rectas hasta la horizontal (o las rodillas al pecho)', 'Baja lento, en 2-3 s', 'Escápulas activas todo el rato'],
        errores: ['Balancearte para subir las piernas', 'Hombros pasivos', 'Arquear la zona lumbar al bajar'],
        alarma: ['Dolor lumbar'],
    },
    flexion: {
        como: ['Manos bajo los hombros y cuerpo en línea de la cabeza a los talones', 'Codos a unos 45° del cuerpo', 'Baja hasta casi tocar el suelo con el pecho', 'Rotaciones externas con goma: codo pegado al costado a 90°, gira el antebrazo hacia fuera despacio'],
        errores: ['Hundir la cadera o sacar el culo', 'Codos abiertos a 90°', 'Rango corto'],
        alarma: ['Dolor en la parte delantera del hombro o en la muñeca'],
    },
    pared: {
        como: ['Calienta subiendo el grado poco a poco', 'Pies precisos y cadera cerca de la pared', 'Brazos estirados cuando puedas; empuja con las piernas', 'Al límite: bloques de 3-5 intentos, con 3 min de descanso'],
        errores: ['Intentar al límite sin calentar', 'Repetir muchas veces un movimiento que te carga un dedo (bidedos, regletas mínimas)', 'Caer con los brazos estirados: cae con los pies y rueda hacia atrás'],
        alarma: ['Chasquido o dolor agudo en un dedo o en el hombro'],
    },
    movilidad: {
        como: ['Sentadilla profunda con los talones en el suelo', 'Apertura de cadera (rana, mariposa) y hombros con una pica o goma', 'Mantén 30-60 s respirando'],
        errores: ['Rebotes', 'Forzar con dolor'],
        alarma: ['Dolor punzante o en una articulación (no el estiramiento muscular)'],
    },
};

const POR_CLAVE = {
    dedos: 'suspension', dedos_largas: 'largas', res_dedos: 'repeaters', dedos_un_brazo: 'unbrazo', campus: 'campus',
    tiron: 'dominada', tiron_un_brazo: 'bloqueo', limite: 'pared', res_pared: 'pared', arc: 'pared',
    core: 'core', antag: 'flexion', movilidad: 'movilidad',
};
const ANIMACION_DE_GUIA = { largas: 'suspension' };
const GUIAS_DEDOS = ['suspension', 'largas', 'repeaters', 'unbrazo', 'campus'];

// Qué guía corresponde a un ejercicio del plan (por clave) o creado a mano (por nombre y carga)
export function guiaPara(ej) {
    if (POR_CLAVE[ej.clave]) return POR_CLAVE[ej.clave];
    const n = (ej.nombre || '').toLowerCase();
    if (/campus/.test(n)) return 'campus';
    if (/un brazo/.test(n) && /bloque|domin/.test(n)) return 'bloqueo';
    if (/un brazo/.test(n)) return 'unbrazo';
    if (/repeater|7\/3|intermit/.test(n)) return 'repeaters';
    if (/larga|densidad|tend[oó]n|suave/.test(n)) return 'largas';
    if (/suspensi|multipresa|regleta|hang/.test(n) || ej.porcentajeDe?.includes('suspensión')) return 'suspension';
    if (/domin|pull/.test(n) || ej.porcentajeDe?.includes('dominada')) return 'dominada';
    if (/core|piernas|abdom|plancha/.test(n)) return 'core';
    if (/flexi|antag|push/.test(n)) return 'flexion';
    if (/movilidad|estira|cadera/.test(n)) return 'movilidad';
    if (/bloque|v[ií]a|arc|4x4|4×4|escala|pared|travesía/.test(n)) return 'pared';
    return null;
}

// ───────────────────────────── Dibujo ─────────────────────────────

const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const suave = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const PUNTOS = ['cab', 'hom', 'cad', 'mA', 'mB', 'pA', 'pB'];

function mezclar(a, b, k) {
    const r = { brazoDir: b.brazoDir ?? 1, piernaDir: b.piernaDir ?? -1 };
    for (const p of PUNTOS) r[p] = lerp(a[p], b[p], k);
    return r;
}

function Escena({ tipo, pose, polea, cinta, lastre }) {
    const g = [];
    if (tipo === 'multipresa') {
        g.push(<rect key="tabla" x="55" y="14" width="90" height="18" rx="3" fill={COLOR.madera} />);
        g.push(<line key="reg" x1="60" y1="32" x2="140" y2="32" stroke="#8d6e63" strokeWidth="3" />);
        g.push(<rect key="caja" x="82" y="178" width="40" height="44" rx="2" fill="#ecf0f1" stroke={COLOR.escena} />);
    }
    if (tipo === 'barra') g.push(<line key="barra" x1="55" y1="32" x2="145" y2="32" stroke="#7f8c8d" strokeWidth="5" strokeLinecap="round" />);
    if (tipo !== 'campus') g.push(<line key="suelo" x1="0" y1="222" x2="200" y2="222" stroke={COLOR.escena} strokeWidth="2" />);
    if (tipo === 'campus') {
        g.push(<line key="tabla" x1="124" y1="290" x2="104" y2="10" stroke={COLOR.madera} strokeWidth="8" />);
        for (let n = 1; n <= 7; n++) {
            const [x, y] = LISTON(n);
            g.push(<rect key={`l${n}`} x={x - 3} y={y - 2} width="10" height="5" rx="1" fill="#8d6e63" />);
            g.push(<text key={`t${n}`} x={x + 12} y={y + 4} fontSize="9" fill={COLOR.escena}>{n}</text>);
        }
    }
    if (tipo === 'pared') {
        g.push(<rect key="pared" x="149" y="0" width="14" height="222" fill="#dfe6e9" />);
        [[146, 25], [146, 50], [146, 70], [146, 95], [146, 135], [146, 160], [146, 185]].forEach(([x, y], i) =>
            g.push(<ellipse key={`p${i}`} cx={x + 2} cy={y + 1} rx="5" ry="3.5" fill={['#e67e22', '#27ae60', '#2980b9', '#8e44ad'][i % 4]} />));
        g.push(<rect key="colchoneta" x="60" y="212" width="100" height="10" rx="3" fill="#bdc3c7" />);
    }
    if (polea && pose) {
        const peso = 150 - (pose.cad[1] - 131) * 1.2;
        g.push(<circle key="polea" cx="168" cy="16" r="6" fill="none" stroke={COLOR.escena} strokeWidth="2" />);
        g.push(<polyline key="cuerda" points={`${pose.cad[0]},${pose.cad[1]} 168,10 174,16 174,${peso}`} fill="none" stroke={COLOR.escena} strokeWidth="1.2" />);
        g.push(<rect key="peso" x="167" y={peso} width="14" height="16" rx="2" fill="#7f8c8d" />);
    }
    if (cinta && pose) g.push(<line key="cinta" x1="120" y1="32" x2={pose.mB[0]} y2={pose.mB[1]} stroke="#e67e22" strokeWidth="1.5" />);
    if (lastre && pose) {
        g.push(<line key="cad" x1={pose.cad[0]} y1={pose.cad[1]} x2={pose.cad[0] + 3} y2={pose.cad[1] + 16} stroke="#555" strokeWidth="1.2" />);
        g.push(<rect key="disco" x={pose.cad[0] - 5} y={pose.cad[1] + 16} width="16" height="7" rx="2" fill="#555" />);
    }
    return <>{g}</>;
}

function Figura({ pose, color, marca }) {
    const bd = pose.brazoDir, pd = pose.piernaDir;
    const mA = alcance(pose.hom, pose.mA, L.brazo + L.antebrazo);
    const mB = alcance(pose.hom, pose.mB, L.brazo + L.antebrazo);
    const pA = alcance(pose.cad, pose.pA, L.muslo + L.pierna);
    const pB = alcance(pose.cad, pose.pB, L.muslo + L.pierna);
    const codoA = articulacion(pose.hom, mA, L.brazo, L.antebrazo, bd);
    const codoB = articulacion(pose.hom, mB, L.brazo, L.antebrazo, bd);
    const rodA = articulacion(pose.cad, pA, L.muslo, L.pierna, pd);
    const rodB = articulacion(pose.cad, pB, L.muslo, L.pierna, pd);
    const pts = (...p) => p.map(q => q.join(',')).join(' ');
    const trazo = { fill: 'none', stroke: color, strokeLinecap: 'round', strokeLinejoin: 'round' };
    // Cuello: del hombro hacia la cabeza, sin entrar en ella
    const dx = pose.cab[0] - pose.hom[0], dy = pose.cab[1] - pose.hom[1], d = Math.hypot(dx, dy) || 1;
    const cuello = [pose.cab[0] - dx / d * 9, pose.cab[1] - dy / d * 9];
    const marcaPt = marca && { hom: pose.hom, cad: pose.cad, mA, mB }[marca];
    return (
        <g>
            {/* Extremidades del lado lejano, más claras */}
            <g opacity="0.4">
                <polyline points={pts(pose.hom, codoB, mB)} {...trazo} strokeWidth="5" />
                <polyline points={pts(pose.cad, rodB, pB)} {...trazo} strokeWidth="6" />
            </g>
            <line x1={pose.hom[0]} y1={pose.hom[1]} x2={pose.cad[0]} y2={pose.cad[1]} {...trazo} strokeWidth="8" />
            <line x1={pose.hom[0]} y1={pose.hom[1]} x2={cuello[0]} y2={cuello[1]} {...trazo} strokeWidth="5" />
            <circle cx={pose.cab[0]} cy={pose.cab[1]} r="9" fill={color} />
            <polyline points={pts(pose.cad, rodA, pA)} {...trazo} strokeWidth="6" />
            <polyline points={pts(pose.hom, codoA, mA)} {...trazo} strokeWidth="5" />
            {marcaPt && <circle cx={marcaPt[0]} cy={marcaPt[1]} r="11" fill="none" stroke={COLOR.marca} strokeWidth="2.5" strokeDasharray="4 3" />}
        </g>
    );
}

// Tipos de agarre, para los ejercicios de dedos
export function DetalleAgarre() {
    const dedo = (puntos, color) => <polyline points={puntos.map(p => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />;
    const regleta = <><rect x="20" y="40" width="44" height="10" fill={COLOR.madera} /><line x1="20" y1="40" x2="64" y2="40" stroke="#8d6e63" strokeWidth="2" /></>;
    const agarres = [
        { titulo: 'Extendido', texto: 'El que menos carga las poleas', icono: '○', color: '#2980b9', dedo: [[58, 40], [66, 37], [78, 40], [88, 52], [92, 70]] },
        { titulo: 'Semiarqueo', texto: 'El recomendado para entrenar', icono: '✓', color: '#27ae60', dedo: [[58, 40], [60, 30], [72, 24], [80, 40], [84, 62]] },
        { titulo: 'Arqueo completo', texto: 'Evítalo en la multipresa', icono: '✗', color: '#c0392b', dedo: [[57, 40], [59, 33], [67, 21], [78, 30], [84, 56]], pulgar: [[88, 48], [72, 32], [61, 30]] },
    ];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {agarres.map(a => (
                <div key={a.titulo} style={{ textAlign: 'center', fontSize: '0.72rem', color: '#555' }}>
                    <svg viewBox="10 10 95 70" style={{ width: '100%', maxWidth: 110, height: 'auto' }} role="img" aria-label={`Agarre ${a.titulo}`}>
                        {regleta}
                        {dedo(a.dedo, '#2c3e50')}
                        {a.pulgar && dedo(a.pulgar, '#7f8c8d')}
                    </svg>
                    <div style={{ fontWeight: 'bold', color: a.color }}>{a.icono} {a.titulo}</div>
                    <div>{a.texto}</div>
                </div>
            ))}
        </div>
    );
}


// ───────────────────────────── Componente ─────────────────────────────

export function AnimacionEjercicio({ guia, lastre = false, alto = 220 }) {
    const anim = ANIMACIONES[ANIMACION_DE_GUIA[guia] || guia];
    const reducido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const [jugando, setJugando] = useState(!reducido);
    const [tiempo, setTiempo] = useState(0);
    const [pasoFijo, setPasoFijo] = useState(0);
    const inicio = useRef(null);

    const pasos = anim?.pasos || [];
    const total = pasos.reduce((s, p) => s + p.t + p.h, 0);

    useEffect(() => {
        if (!jugando || !anim) return;
        let id;
        const base = performance.now() - tiempo;
        inicio.current = base;
        const tick = (ahora) => { setTiempo((ahora - base) % total); id = requestAnimationFrame(tick); };
        id = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(id);
    }, [jugando, anim, total]); // eslint-disable-line

    if (!anim) return null;

    // Paso actual y postura interpolada
    let i = 0, pose;
    if (jugando) {
        let acum = 0;
        for (i = 0; i < pasos.length; i++) {
            const { t, h } = pasos[i];
            if (tiempo < acum + t + h) {
                const previo = P[pasos[(i - 1 + pasos.length) % pasos.length].p];
                const k = tiempo < acum + t ? suave((tiempo - acum) / t) : 1;
                pose = mezclar(previo, P[pasos[i].p], k);
                break;
            }
            acum += t + h;
        }
        if (!pose) { i = pasos.length - 1; pose = mezclar(P[pasos[i].p], P[pasos[i].p], 1); }
    } else {
        i = pasoFijo;
        pose = mezclar(P[pasos[i].p], P[pasos[i].p], 1);
    }
    const paso = pasos[i];
    const color = paso.error ? COLOR.error : COLOR.cuerpo;
    const irA = (n) => { setJugando(false); setPasoFijo((n + pasos.length) % pasos.length); };

    return (
        <div>
            <div style={{ background: paso.error ? '#fdf2f1' : '#f8f9fa', borderRadius: 10, transition: 'background 0.3s' }}>
                <svg viewBox={anim.vista} style={{ width: '100%', height: alto, display: 'block' }} role="img" aria-label={paso.nota}>
                    <Escena tipo={anim.escena} pose={pose} polea={anim.polea} cinta={anim.cinta} lastre={lastre && (guia === 'dominada')} />
                    <Figura pose={pose} color={color} marca={paso.marca} />
                </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <button onClick={() => irA(i - 1)} style={st.btn} title="Paso anterior"><ChevronLeft size={16} /></button>
                <button onClick={() => { if (!jugando) setTiempo(pasos.slice(0, pasoFijo).reduce((s, p) => s + p.t + p.h, 0)); setJugando(!jugando); }} style={st.btn} title={jugando ? 'Pausa' : 'Reproducir'}>
                    {jugando ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button onClick={() => irA(i + 1)} style={st.btn} title="Paso siguiente"><ChevronRight size={16} /></button>
                <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: paso.error ? COLOR.error : '#2c3e50', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {paso.error ? <XCircle size={15} style={{ flexShrink: 0 }} /> : <CheckCircle size={15} style={{ flexShrink: 0, color: '#27ae60' }} />}
                    <span>{paso.nota}</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#95a5a6', flexShrink: 0 }}>{i + 1}/{pasos.length}</span>
            </div>
        </div>
    );
}

// Animación + agarre + claves de técnica de un ejercicio
export default function GuiaEjercicio({ ejercicio }) {
    const guia = guiaPara(ejercicio);
    if (!guia) return <p style={{ fontSize: '0.82rem', color: '#7f8c8d', margin: 0 }}>No hay guía visual para este ejercicio.</p>;
    const t = TECNICA[guia];
    const lista = (items, icono, color) => (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.map((x, i) => (
                <li key={i} style={{ display: 'flex', gap: 6, fontSize: '0.82rem', color: '#444', lineHeight: 1.4 }}>
                    <span style={{ color, flexShrink: 0, marginTop: 1 }}>{icono}</span><span>{x}</span>
                </li>
            ))}
        </ul>
    );
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AnimacionEjercicio guia={guia} lastre={ejercicio.carga > 0} />
            {GUIAS_DEDOS.includes(guia) && (
                <div>
                    <div style={st.titulo}>Agarre</div>
                    <DetalleAgarre />
                </div>
            )}
            <div>
                <div style={st.titulo}>Cómo hacerlo</div>
                {lista(t.como, <CheckCircle size={14} />, '#27ae60')}
            </div>
            <div>
                <div style={st.titulo}>Errores que debes evitar</div>
                {lista(t.errores, <XCircle size={14} />, '#c0392b')}
            </div>
            <div style={{ background: '#fef5e7', border: '1px solid #f5cba7', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ ...st.titulo, color: '#935116' }}>Para si notas</div>
                {lista(t.alarma, <AlertTriangle size={14} />, '#e67e22')}
            </div>
        </div>
    );
}

const st = {
    btn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid #dfe4ea', background: 'white', borderRadius: 8, cursor: 'pointer', color: '#2c3e50', flexShrink: 0 },
    titulo: { fontSize: '0.78rem', fontWeight: 700, color: '#2c3e50', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
};

// Botón «Cómo se hace» que despliega la guía dentro de la tarjeta del ejercicio
export function GuiaDesplegable({ ejercicio }) {
    const [abierta, setAbierta] = useState(false);
    if (!guiaPara(ejercicio)) return null;
    return (
        <div style={{ marginTop: 8 }}>
            <button onClick={() => setAbierta(!abierta)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: abierta ? '#2c3e50' : 'white', color: abierta ? 'white' : '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.82rem' }}>
                <Play size={13} /> {abierta ? 'Ocultar técnica' : 'Cómo se hace'}
            </button>
            {abierta && <div style={{ marginTop: 10 }}><GuiaEjercicio ejercicio={ejercicio} /></div>}
        </div>
    );
}
