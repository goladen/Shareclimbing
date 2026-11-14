// Planes de entrenamiento de escalada: a partir de un test se calcula un perfil (capacidades
// frente a la referencia para el grado del escalador), se genera un plan por semanas y cada
// sesión registrada ajusta las siguientes (cargas, volumen, molestias, días sin entrenar).
//
// Todo es determinista: las cargas de cada sesión se calculan al abrirla con
//   test + semana del plan + ajustes acumulados + estado de hoy.
// Al registrar la sesión se guarda una copia de lo que se prescribió.

export const GRADOS_VIA = ['5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a'];
export const GRADOS_BLOQUE = ['4', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C'];
// Equivalencia aproximada: 6A de bloque ≈ 6c de vía
const DESFASE_BLOQUE = 4;

const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
const redondear = (x, paso) => Math.round(x / paso) * paso;
const DIA_MS = 86400000;

// Índice en la escala de vía (5a = 0, 7a = 9, 8a = 15) con el mejor de los dos grados
export function indiceGrado({ gradoVia, gradoBloque }) {
    const v = GRADOS_VIA.indexOf(gradoVia);
    const b = GRADOS_BLOQUE.indexOf(gradoBloque);
    const ind = Math.max(v, b >= 0 ? b + DESFASE_BLOQUE : -1);
    return ind >= 0 ? ind : 6;
}

export const textoGrado = (g) => GRADOS_VIA[Math.min(g, GRADOS_VIA.length - 1)];

// Referencias orientativas para cada grado, a partir de protocolos publicados
// (Lattice, Eva López, Hörst). Conviene que un entrenador las revise.
export const CAPACIDADES = {
    dedos: {
        nombre: 'Fuerza de dedos',
        ref: (g) => 0.9 + 0.045 * g,               // carga total / peso en regleta de 20 mm, 10 s
        formato: (v) => `${Math.round(v * 100)} % del peso`,
    },
    tiron: {
        nombre: 'Fuerza de tracción',
        ref: (g) => 4 + 0.9 * g,
        formato: (v) => `${Math.round(v)} dominadas`,
    },
    resistencia: {
        nombre: 'Resistencia de dedos',
        ref: (g) => 5 + 1.6 * g,                   // repeticiones 7/3 a peso corporal hasta el fallo
        formato: (v) => `${Math.round(v)} rep. 7/3`,
    },
    core: {
        nombre: 'Core',
        ref: (g) => 3 + g,                         // elevaciones de piernas colgado
        formato: (v) => `${Math.round(v)} elevaciones`,
    },
};

export function calcularPerfil(test) {
    const g = indiceGrado(test);
    const valores = {
        dedos: test.suspension != null && test.peso ? (test.peso + test.suspension) / test.peso : null,
        tiron: test.dominadas,
        resistencia: test.repeaters,
        core: test.core,
    };
    const capacidades = {};
    for (const [k, valor] of Object.entries(valores)) {
        if (valor == null) continue;
        const referencia = CAPACIDADES[k].ref(g);
        capacidades[k] = { valor, referencia, puntuacion: Math.round((valor / referencia) * 100) / 100 };
    }
    const debilidades = Object.keys(capacidades)
        .filter(k => capacidades[k].puntuacion < 0.9)
        .sort((a, b) => capacidades[a].puntuacion - capacidades[b].puntuacion);

    const m = test.material;
    const veterano = test.experiencia >= 2;
    const aptoDedos = !!m.multipresa && veterano && test.suspension != null;
    const aptoLastre = !!(m.barra || m.multipresa) && veterano && test.dominadaLastre != null;

    let enfoque;
    if (test.objetivo === 'bloque') enfoque = 'fuerza';
    else if (test.objetivo === 'via') enfoque = 'resistencia';
    else enfoque = debilidades[0] === 'resistencia' ? 'resistencia' : 'fuerza';

    const avisos = [];
    if (m.multipresa && !veterano) {
        avisos.push('Con menos de 2 años escalando el plan no incluye multipresa: tendones y poleas se adaptan más despacio que los músculos. La fuerza de dedos se trabaja escalando bloque.');
    }
    if (m.multipresa && veterano && test.suspension == null) {
        avisos.push('Sin el test de suspensión no se pueden calcular las cargas de multipresa, así que no se incluye.');
    }

    // Variantes exigentes, solo para escaladores con experiencia y nivel
    const aptoCampus = !!m.campus && test.experiencia >= 3 && g >= 11;                 // 7b o 6C+ de bloque
    const avanzado = test.experiencia >= 4 && g >= 13;                                  // 7c o 7A+ de bloque
    const aptoUnBrazo = aptoDedos && avanzado && test.estiloDedos !== 'largas';
    const aptoTironUnBrazo = aptoLastre && avanzado && test.dominadaLastre >= 0.4 * test.peso;
    if (m.campus && !aptoCampus) {
        avisos.push('El campus solo se incluye con 3 años o más escalando y un grado de 7b (6C+ en bloque) o superior: es muy exigente para dedos, codos y hombros.');
    }
    if (aptoUnBrazo) avisos.push('En la segunda mitad del plan, las suspensiones máximas pasan a hacerse a un brazo con contrapeso.');
    if (aptoTironUnBrazo) avisos.push('En la segunda mitad del plan, en las sesiones de fuerza las dominadas pasan a bloqueos a un brazo.');

    return { grado: g, capacidades, debilidades, enfoque, aptoDedos, aptoLastre, aptoCampus, aptoUnBrazo, aptoTironUnBrazo, avisos };
}

// Cómo se trabajan las suspensiones: 'largas' (20-45 s con poca carga, se progresa en tiempo),
// 'maximas' (10 s con la carga más alta) o 'mixto' (largas en la primera mitad y máximas después)
export const ESTILOS_DEDOS = {
    mixto: 'Mixto: largas y luego máximas (recomendado)',
    largas: 'Largas: más tiempo y menos peso',
    maximas: 'Máximas: 10 s con más peso',
};

// zonas: molestias que obligan a quitar el componente
export const COMPONENTES = {
    limite: { nombre: 'Bloque al límite', requiere: (m) => m.rocodromo, zonas: ['dedos', 'hombro'] },
    dedos: { nombre: 'Suspensiones máximas', requiere: (m, p) => p.aptoDedos, zonas: ['dedos', 'codo'] },
    dedos_largas: { nombre: 'Suspensiones largas', requiere: (m, p) => p.aptoDedos, zonas: ['dedos', 'codo'] },
    dedos_un_brazo: { nombre: 'Suspensiones a un brazo', requiere: (m, p) => !!p.aptoUnBrazo, zonas: ['dedos', 'codo', 'hombro'] },
    campus: { nombre: 'Campus', requiere: (m, p) => !!p.aptoCampus, zonas: ['dedos', 'codo', 'hombro'] },
    tiron: { nombre: 'Dominadas', requiere: (m) => m.barra || m.multipresa, zonas: ['hombro', 'codo'] },
    tiron_un_brazo: { nombre: 'Bloqueos a un brazo', requiere: (m, p) => !!p.aptoTironUnBrazo, zonas: ['hombro', 'codo'] },
    res_dedos: { nombre: 'Repeaters 7/3', requiere: (m, p) => p.aptoDedos, zonas: ['dedos', 'codo'] },
    res_pared: { nombre: '4×4 en bloque', requiere: (m) => m.rocodromo, zonas: ['dedos'] },
    arc: { nombre: 'Continuidad (ARC)', requiere: (m) => m.rocodromo, zonas: [] },
    core: { nombre: 'Core', requiere: () => true, zonas: [] },
    antag: { nombre: 'Antagonistas', requiere: () => true, zonas: ['hombro'] },
    movilidad: { nombre: 'Movilidad', requiere: () => true, zonas: [], fijo: true },
};
const SECUNDARIOS = ['core', 'antag', 'movilidad'];

export const TIPOS_SESION = {
    fuerza: 'Fuerza',
    resistencia: 'Resistencia',
    mixta: 'Fuerza-resistencia',
    base: 'Base y compensación',
};

const PLANTILLAS = {
    fuerza: {
        2: ['fuerza', 'mixta'],
        3: ['fuerza', 'mixta', 'fuerza'],
        4: ['fuerza', 'resistencia', 'fuerza', 'base'],
        5: ['fuerza', 'resistencia', 'base', 'fuerza', 'resistencia'],
    },
    resistencia: {
        2: ['mixta', 'resistencia'],
        3: ['fuerza', 'resistencia', 'resistencia'],
        4: ['fuerza', 'resistencia', 'base', 'resistencia'],
        5: ['fuerza', 'resistencia', 'base', 'fuerza', 'resistencia'],
    },
};

function componentesSesion(tipo, test, perfil) {
    const ok = (k) => COMPONENTES[k].requiere(test.material, perfil);
    const debil = (k) => perfil.debilidades.includes(k);
    let lista;
    if (tipo === 'fuerza') lista = ['limite', 'dedos', 'tiron', debil('core') && 'core'];
    else if (tipo === 'resistencia') {
        lista = ok('res_pared')
            ? ['res_pared', perfil.enfoque === 'resistencia' && debil('resistencia') && 'res_dedos', 'core']
            : ['res_dedos', 'core'];
    } else if (tipo === 'mixta') lista = ['limite', ok('res_dedos') ? 'res_dedos' : 'res_pared', debil('tiron') && 'tiron', 'core'];
    else lista = ['arc', 'core', 'antag', 'movilidad'];

    const res = [...new Set(lista.filter(Boolean).filter(ok))];
    if (!res.some(k => !SECUNDARIOS.includes(k)) && ok('tiron')) res.unshift('tiron');
    return res;
}

export function generarPlan(test, perfil) {
    const { dias, semanas } = test;
    const plantilla = PLANTILLAS[perfil.enfoque][dias];
    const estilo = test.estiloDedos || 'mixto';
    const sesiones = [];
    for (let s = 1; s <= semanas; s++) {
        const segundaMitad = s > Math.ceil(semanas / 2);
        let fuerzaSemana = 0;
        plantilla.forEach((tipo, i) => {
            let comps = componentesSesion(tipo, test, perfil);
            if (tipo === 'fuerza') fuerzaSemana++;
            // Variante de suspensiones según el estilo y el momento del plan
            const varianteDedos = estilo === 'largas' || (estilo === 'mixto' && !segundaMitad) ? 'dedos_largas'
                : perfil.aptoUnBrazo && segundaMitad ? 'dedos_un_brazo' : 'dedos';
            comps = comps.map(k => k === 'dedos' ? varianteDedos : k);
            if (tipo === 'fuerza' && segundaMitad && perfil.aptoTironUnBrazo) comps = comps.map(k => k === 'tiron' ? 'tiron_un_brazo' : k);
            // Campus en la segunda sesión de fuerza de la semana, en lugar de la multipresa
            if (tipo === 'fuerza' && fuerzaSemana === 2 && perfil.aptoCampus) {
                comps = comps.some(k => k.startsWith('dedos')) ? comps.map(k => k.startsWith('dedos') ? 'campus' : k) : [...comps, 'campus'];
            }
            sesiones.push({ id: `s${s}d${i + 1}`, semana: s, orden: i + 1, tipo, componentes: [...new Set(comps)] });
        });
    }
    return { semanas, sesiones, ajustes: {}, registros: {}, bloqueos: {} };
}

// t: progresión de 0 a 1 en las semanas de carga; la última semana es de descarga
export function fase(plan, semana) {
    const N = plan.semanas;
    const descarga = N >= 4 && semana === N;
    if (descarga) return { t: 0.5, descarga };
    return { t: N - 2 > 0 ? Math.min(1, (semana - 1) / (N - 2)) : 0, descarga };
}

export function textoCarga(kg) {
    if (kg == null) return null;
    if (Math.abs(kg) < 0.25) return 'Peso corporal';
    return kg > 0 ? `+${kg} kg` : `−${Math.abs(kg)} kg (con polea o goma)`;
}

// Carga añadida y qué porcentaje supone del máximo (peso corporal + carga máxima del test)
function conPorcentaje(carga, peso, maxTotal) {
    // Sin el dato del test (p. ej. un plan del entrenador para alguien sin test de suspensión)
    if (!maxTotal || !Number.isFinite(carga)) return { carga: null, porcentaje: null, porcentajeDe: null, sinTest: true };
    return { carga, porcentaje: Math.round(((peso + carga) / maxTotal) * 100), porcentajeDe: 'de tu máximo' };
}

// Estructura de un plan para el entrenador (sin atleta concreto): se genera con un perfil
// genérico según lo que elija y luego la edita sesión a sesión. Las cargas se calculan después
// con el test de cada atleta.
export function generarEstructura({ enfoque = 'fuerza', dias = 3, semanas = 6, material = {}, estiloDedos = 'mixto', avanzado = false }) {
    const test = { peso: 70, experiencia: avanzado ? 5 : 3, dias, semanas, estiloDedos, material, suspension: 0, dominadaLastre: 30 };
    const perfil = {
        enfoque, debilidades: [], grado: avanzado ? 14 : 9,
        aptoDedos: !!material.multipresa, aptoLastre: !!(material.barra || material.multipresa),
        aptoCampus: !!material.campus && avanzado, aptoUnBrazo: !!material.multipresa && avanzado && estiloDedos !== 'largas',
        aptoTironUnBrazo: !!(material.barra || material.multipresa) && avanzado,
    };
    return generarPlan(test, perfil);
}

// Máximo total (peso + carga) de una referencia del test, para las sesiones propias en %
export function maximoDe(test, ref) {
    if (!test?.peso) return null;
    if (ref === 'suspension' && test.suspension != null) return test.peso + test.suspension;
    if (ref === 'dominada' && test.dominadaLastre != null) return test.peso + test.dominadaLastre;
    return null;
}
export function cargaDesdePorcentaje(test, ref, pct) {
    const max = maximoDe(test, ref);
    return max == null ? null : redondear((max * pct) / 100 - test.peso, 0.5);
}

function prescribir(clave, { test, perfil, t, descarga, factor, hoy = 1 }) {
    const peso = test.peso;
    const maxDedos = test.suspension != null ? peso + test.suspension : null;
    const vol = (n, min, max) => clamp(Math.round(n * (descarga ? 0.6 : 1) * hoy), min, max);
    const suave = descarga ? 0.95 : 1;
    // Un mal día baja sobre todo el volumen; la carga solo un poco (con 0,8 → −7 %)
    const fi = factor * (1 - (1 - hoy) * 0.35);
    const fv = factor * hoy;

    switch (clave) {
        case 'dedos': {
            const series = vol(t > 0.5 ? 6 : 5, 3, 6);
            return {
                principal: `${series} × 10 s`,
                ...conPorcentaje(redondear(maxDedos * (0.80 + 0.10 * t) * suave * fi - peso, 0.5), peso, maxDedos),
                lineas: ['Regleta de 20 mm, agarre semiarqueo', 'Descanso 3 min entre series', 'Acaba cada serie con 2-3 s de margen'],
                crono: { series, trabajo: 10, descanso: 180, etiqueta: 'Cuelga' },
            };
        }
        case 'tiron': {
            if (perfil.aptoLastre) {
                const series = vol(5, 3, 5);
                return {
                    principal: `${series} × 3 dominadas`,
                    ...conPorcentaje(redondear((peso + test.dominadaLastre) * (0.85 + 0.07 * t) * suave * fi - peso, 0.5), peso, peso + test.dominadaLastre),
                    lineas: ['Descanso 3 min entre series', 'Bajada controlada, sin balanceo'],
                    crono: { series, descanso: 180, etiqueta: '3 dominadas' },
                };
            }
            const reps = Math.max(2, Math.round((test.dominadas ?? 5) * (0.5 + 0.15 * t) * factor));
            const series = vol(4, 2, 5);
            return {
                principal: `${series} × ${reps} dominadas`,
                carga: null,
                // Sin lastre: repeticiones de cada serie frente a tu máximo de dominadas seguidas
                porcentaje: test.dominadas ? Math.round((reps / test.dominadas) * 100) : null,
                porcentajeDe: 'de tus dominadas máximas',
                lineas: ['Descanso 2 min entre series', 'Si no llegas a 3 seguidas, hazlas con goma o en negativo lento'],
                crono: { series, descanso: 120, etiqueta: `${reps} dominadas` },
            };
        }
        case 'limite': {
            const n = clamp(Math.round((4 + 2 * t) * fv * (descarga ? 0.6 : 1)), 2, 8);
            return {
                principal: `${n} bloques`,
                carga: null,
                lineas: ['Bloques que encadenarías en 3-5 intentos', 'Máximo 4-5 intentos por bloque, 3 min de descanso entre intentos', 'Si la calidad de los movimientos baja, para'],
                // Cada «serie» es un intento; se para cuando se acaben los bloques
                crono: { series: n * 4, descanso: 180, etiqueta: 'Intento', abierto: true },
            };
        }
        case 'dedos_largas': {
            // Carga fija y baja; el ajuste por feedback alarga o acorta el tiempo
            const series = vol(4, 3, 5);
            const segs = clamp(Math.round(((20 + 10 * t) * factor) / 5) * 5, 15, 45);
            const ih = 1 - (1 - hoy) * 0.35;
            return {
                principal: `${series} × ${segs} s`,
                ...conPorcentaje(redondear(maxDedos * 0.65 * suave * ih - peso, 0.5), peso, maxDedos),
                lineas: ['Regleta de 20 mm, agarre semiarqueo', 'Carga baja: se progresa alargando el tiempo, no subiendo peso', 'Descanso 2:30 entre series', 'Acaba cada serie con 3-5 s de margen'],
                crono: { series, trabajo: segs, descanso: 150, etiqueta: 'Cuelga' },
            };
        }
        case 'dedos_un_brazo': {
            // Referencia: la mitad del máximo total a dos manos; normalmente con contrapeso
            const series = vol(4, 3, 5);
            const maxBrazo = maxDedos / 2;
            const total = maxBrazo * (0.80 + 0.08 * t) * suave * fi;
            const conDato = maxDedos != null && Number.isFinite(total);
            return {
                principal: `${series} × 10 s por brazo`,
                carga: conDato ? redondear(total - peso, 0.5) : null,
                porcentaje: conDato ? Math.round((redondear(total, 0.5) / maxBrazo) * 100) : null,
                porcentajeDe: conDato ? 'de tu máximo por brazo' : null,
                sinTest: !conDato,
                lineas: ['Regleta de 20 mm (o más grande si no llegas), contrapeso con polea', 'Brazo libre relajado; hombro activo, sin colgar del hombro', 'Alterna brazos con 90 s entre cada uno'],
                crono: { series: series * 2, trabajo: 10, descanso: 90, etiqueta: 'Cuelga · alterna brazo' },
            };
        }
        case 'campus': {
            const n = clamp(Math.round((4 + 2 * t) * fv * (descarga ? 0.6 : 1)), 3, 8);
            return {
                principal: `${n} series`,
                carga: null,
                lineas: ['Escaleras 1-3-5 o 1-4-7 en listones medianos; empieza por los grandes', 'Movimientos explosivos y precisos: para en cuanto pierdas velocidad', 'Nunca con los dedos cansados ni con molestias', 'Descanso 3 min entre series'],
                crono: { series: n, descanso: 180, etiqueta: 'Escalera de campus' },
            };
        }
        case 'tiron_un_brazo': {
            const series = vol(4, 3, 5);
            return {
                principal: `${series} × 3 por brazo`,
                carga: null,
                lineas: ['Bloqueos a un brazo a 90° y 120° (3-5 s cada uno) o dominadas a un brazo con goma', 'El otro brazo agarra una cinta solo lo justo para ayudarte', 'Alterna brazos con 90 s entre cada uno'],
                crono: { series: series * 2, descanso: 90, etiqueta: '3 · alterna brazo' },
            };
        }
        case 'res_dedos': {
            const series = vol(Math.round(3 + 2 * t), 2, 6);
            return {
                principal: `${series} × 6 rep. (7 s colgado / 3 s descanso)`,
                ...conPorcentaje(redondear(maxDedos * (0.72 + 0.10 * t) * suave * fi - peso, 0.5), peso, maxDedos),
                lineas: ['Regleta de 20 mm', 'Descanso 3 min entre series', 'Las últimas repeticiones deben costar, sin llegar al fallo'],
                crono: { series, reps: 6, trabajo: 7, pausa: 3, descanso: 180, etiqueta: 'Cuelga' },
            };
        }
        case 'res_pared': {
            const vueltas = clamp(Math.round((3 + t) * fv * (descarga ? 0.6 : 1)), 2, 5);
            return {
                principal: `${vueltas} vueltas de 4 bloques`,
                carga: null,
                lineas: ['Bloques 3-4 grados por debajo de tu máximo, seguidos y sin descanso entre ellos', 'Descanso 4 min entre vueltas', 'Debes acabar bombeado, pero sin caerte en el primer bloque'],
                crono: { series: vueltas, descanso: 240, etiqueta: '4 bloques seguidos' },
            };
        }
        case 'arc': {
            const min = clamp(Math.round((15 + 10 * t) * fv * (descarga ? 0.7 : 1)), 10, 30);
            return {
                principal: `2 × ${min} min`,
                carga: null,
                lineas: ['Escalada continua muy fácil (debes poder hablar)', 'Si notas bombeo, baja de grado', '5 min de descanso entre las dos tandas'],
                crono: { series: 2, trabajo: min * 60, descanso: 300, etiqueta: 'Escala' },
            };
        }
        case 'core': {
            const reps = Math.max(3, Math.round((test.core ?? 8) * (0.6 + 0.15 * t) * factor));
            const series = vol(3, 2, 4);
            return {
                principal: `${series} × ${reps} elevaciones de piernas`,
                carga: null,
                lineas: ['Colgado de una barra (o tumbado si no tienes)', 'Sin balanceo y con bajada lenta', 'Añade 2 × 30 s de plancha lateral por lado'],
                crono: { series, descanso: 90, etiqueta: `${reps} elevaciones` },
            };
        }
        case 'antag': {
            const reps = clamp(Math.round(12 * factor), 6, 25);
            const series = vol(3, 2, 3);
            return {
                principal: `${series} × ${reps} flexiones`,
                carga: null,
                lineas: ['Más 3 × 15 rotaciones externas de hombro con goma', 'Compensa la tracción y protege los hombros'],
                crono: { series, descanso: 60, etiqueta: `${reps} flexiones` },
            };
        }
        default:
            return { principal: '15 min', carga: null, lineas: ['Cadera (rana, mariposa), hombros y antebrazos'], crono: { series: 1, trabajo: 900, descanso: 0, etiqueta: 'Movilidad' } };
    }
}

export const ZONAS = { dedos: 'dedos', hombro: 'hombro', codo: 'codo' };

export function zonasBloqueadas(plan, ahora = new Date()) {
    return Object.entries(plan.bloqueos || {})
        .filter(([, b]) => new Date(b.hasta) > ahora)
        .map(([zona, b]) => ({ zona, ...b }));
}

function ultimaFecha(plan) {
    const fechas = Object.values(plan.registros || {}).filter(r => !r.saltada).map(r => r.fecha);
    return fechas.length ? fechas.sort().at(-1) : null;
}

// estadoHoy: { sueno: 'bien'|'regular'|'mal', fatiga: 'fresco'|'normal'|'cansado', molestia: 'ninguna'|zona }
export function prescribirSesion(plan, sesion, estadoHoy = null, ahora = new Date()) {
    const { t, descarga } = fase(plan, sesion.semana);
    const avisos = [];
    let general = 1;

    if (estadoHoy) {
        const malos = (estadoHoy.sueno === 'mal' ? 1 : 0) + (estadoHoy.fatiga === 'cansado' ? 1 : 0);
        if (malos) {
            general *= malos === 2 ? 0.8 : 0.9;
            avisos.push(`Llegas con poco descanso: hoy hay menos series (−${malos === 2 ? 20 : 10} %) y la carga baja un poco.`);
        }
    }
    const ult = ultimaFecha(plan);
    if (ult && (ahora - new Date(ult)) / DIA_MS > 10) {
        general *= 0.9;
        avisos.push('Llevas más de 10 días sin entrenar: se baja un 10 % para retomar.');
    }
    if (descarga) avisos.push('Semana de descarga: menos volumen e intensidad para asimilar lo entrenado.');

    const zonas = zonasBloqueadas(plan, ahora).map(b => b.zona);
    if (estadoHoy?.molestia && estadoHoy.molestia !== 'ninguna' && !zonas.includes(estadoHoy.molestia)) zonas.push(estadoHoy.molestia);

    let comps = sesion.componentes.filter(k => !COMPONENTES[k].zonas.some(z => zonas.includes(z)));
    const quitados = sesion.componentes.filter(k => !comps.includes(k));
    if (quitados.length) {
        avisos.push(`Por molestias en ${zonas.map(z => ZONAS[z] || z).join(', ')} se quita: ${quitados.map(k => COMPONENTES[k].nombre).join(', ')}.`);
        for (const k of ['core', zonas.includes('hombro') ? null : 'antag', 'movilidad']) {
            if (k && !comps.includes(k)) comps.push(k);
        }
    }

    const ejercicios = comps.map(k => {
        const factor = clamp(plan.ajustes?.[k] ?? 1, 0.7, 1.3);
        return { clave: k, nombre: COMPONENTES[k].nombre, ...prescribir(k, { test: plan.test, perfil: plan.perfil, t, descarga, factor, hoy: general }) };
    });

    // Bloques que el entrenador añadió a esta sesión (se quitan si cargan una zona con molestias)
    const quitadosExtra = [];
    (plan.extras?.[sesion.id] || []).forEach((b, i) => {
        if ((ZONAS_CATEGORIA[b.categoria] || []).some(z => zonas.includes(z))) { quitadosExtra.push(b.nombre); return; }
        ejercicios.push({ clave: `extra_${i}`, extra: true, ...aEjercicioCrono(b, plan.test) });
    });
    if (quitadosExtra.length) avisos.push(`Por molestias se quita lo que añadió tu entrenador: ${quitadosExtra.join(', ')}.`);

    // Ejercicios de avanzados en un plan hecho por un entrenador para alguien que no cumple los requisitos
    const AVANZADOS = { campus: 'aptoCampus', dedos_un_brazo: 'aptoUnBrazo', tiron_un_brazo: 'aptoTironUnBrazo' };
    const exigentes = ejercicios.filter(e => AVANZADOS[e.clave] && plan.perfil && !plan.perfil[AVANZADOS[e.clave]]).map(e => e.nombre);
    if (exigentes.length) avisos.push(`${exigentes.join(' y ')} ${exigentes.length > 1 ? 'están pensados' : 'está pensado'} para escaladores avanzados. Si no tienes experiencia con ello o notas molestias, coméntalo con tu entrenador antes de hacerlo.`);

    const sinDato = ejercicios.filter(e => e.sinTest && !e.extra).map(e => e.nombre);
    if (sinDato.length) avisos.push(`Para calcular la carga de ${sinDato.join(', ')} haz el test de suspensión: mientras, usa una carga con la que acabes con 2-3 s de margen.`);

    return { ejercicios, avisos, descarga, notaEntrenador: plan.notasEntrenador?.[sesion.id] || null };
}

// ───────────── Ejercicios definidos a mano (sesiones propias, bloques del catálogo) ─────────────
// ej = { nombre, modo: 'tiempo'|'manual', series, trabajo, reps, pausa, descanso, descansoTras,
//        intensidad: 'ninguna'|'kg'|'suspension'|'dominada', valor, nota, categoria? }

export const CATEGORIAS = {
    dedos: 'Dedos', traccion: 'Tracción', resistencia: 'Resistencia', potencia: 'Potencia',
    core: 'Core', antagonistas: 'Antagonistas', movilidad: 'Movilidad', tecnica: 'Técnica', otro: 'Otro',
};
// Qué zonas carga cada categoría, para quitarla si hay molestias
export const ZONAS_CATEGORIA = {
    dedos: ['dedos', 'codo'], traccion: ['hombro', 'codo'], resistencia: ['dedos'], potencia: ['dedos', 'hombro'], antagonistas: ['hombro'],
};

const REFERENCIA_PCT = { suspension: 'de tu suspensión máxima', dominada: 'de tu dominada lastrada máxima' };
export const textoTiempo = (s) => s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` : `${s} s`;

// Convierte un ejercicio definido a mano al formato del crono, con la carga según el test de quien lo hace
export function aEjercicioCrono(ej, test) {
    const enPct = ej.intensidad === 'suspension' || ej.intensidad === 'dominada';
    const carga = ej.intensidad === 'kg' ? Number(ej.valor) || 0 : enPct ? cargaDesdePorcentaje(test, ej.intensidad, ej.valor) : null;
    const principal = ej.modo === 'tiempo'
        ? (ej.reps > 1 ? `${ej.series} × ${ej.reps} rep. (${ej.trabajo} s / ${ej.pausa} s)` : `${ej.series} × ${textoTiempo(ej.trabajo)}`)
        : `${ej.series} series${ej.nota ? ` · ${ej.nota}` : ''}`;
    return {
        nombre: ej.nombre || 'Ejercicio',
        principal,
        carga,
        porcentaje: enPct ? ej.valor : null,
        porcentajeDe: enPct ? REFERENCIA_PCT[ej.intensidad] : null,
        sinTest: enPct && carga == null,
        nota: ej.nota || '',
        lineas: [ej.nota, ej.descripcion].filter(Boolean),
        crono: {
            series: ej.series,
            trabajo: ej.modo === 'tiempo' ? ej.trabajo : 0,
            reps: ej.modo === 'tiempo' ? ej.reps : 1,
            pausa: ej.pausa,
            descanso: ej.descanso,
            descansoTras: ej.descansoTras,
            etiqueta: ej.nombre || 'Ejercicio',
        },
    };
}

// Ajuste rápido del entrenador: multiplica el factor de un componente (o de todos)
export function ajustarFactores(ajustes, claves, pct) {
    const nuevos = { ...(ajustes || {}) };
    for (const k of claves) {
        nuevos[k] = pct === null ? 1 : Math.round(clamp((nuevos[k] ?? 1) * (1 + pct / 100), 0.7, 1.3) * 1000) / 1000;
    }
    return nuevos;
}

// Componentes que aparecen en el plan, para el panel del entrenador
export const componentesDelPlan = (plan) => [...new Set(plan.sesiones.flatMap(s => s.componentes))].filter(k => !COMPONENTES[k].fijo);

// resultados: { [clave]: 'todo' | 'casi' | 'no' }; rpe: 1-10; molestia: { zona, nivel: 'leve'|'fuerte' } | null
export function aplicarRegistro(plan, sesion, registro) {
    const ajustes = { ...(plan.ajustes || {}) };
    const bloqueos = { ...(plan.bloqueos || {}) };
    const cambios = [];
    const rpe = registro.rpe;

    for (const [k, res] of Object.entries(registro.resultados || {})) {
        if (!COMPONENTES[k] || COMPONENTES[k].fijo) continue;   // los bloques del entrenador no se autoajustan
        let d = res === 'todo' ? (rpe <= 6 ? 0.05 : rpe <= 8 ? 0.01 : 0) : res === 'casi' ? -0.03 : -0.07;
        if (rpe >= 9 && res !== 'todo') d -= 0.02;
        // Las cargas sobre el peso total progresan más despacio (un 5 % del total son varios kg)
        if (['dedos', 'dedos_largas', 'dedos_un_brazo', 'res_dedos', 'campus'].includes(k) || (k === 'tiron' && plan.perfil?.aptoLastre)) d *= 0.5;
        const antes = ajustes[k] ?? 1;
        ajustes[k] = Math.round(clamp(antes * (1 + d), 0.7, 1.3) * 1000) / 1000;
        if (ajustes[k] !== antes) cambios.push({ clave: k, nombre: COMPONENTES[k].nombre, porcentaje: Math.round((ajustes[k] / antes - 1) * 100) });
    }

    const avisos = [];
    const m = registro.molestia;
    if (m?.zona && m.zona !== 'otra') {
        const dias = m.nivel === 'fuerte' ? 14 : 7;
        bloqueos[m.zona] = { hasta: new Date(new Date(registro.fecha).getTime() + dias * DIA_MS).toISOString(), nivel: m.nivel };
        // Al volver, se empieza un 10 % por debajo
        for (const [k, c] of Object.entries(COMPONENTES)) {
            if (c.zonas.includes(m.zona)) ajustes[k] = Math.round(clamp((ajustes[k] ?? 1) * 0.9, 0.7, 1.3) * 1000) / 1000;
        }
        avisos.push(`Durante ${dias} días no se incluirán ejercicios que carguen ${ZONAS[m.zona]}, y al volver empezarás algo más suave.`);
        if (m.nivel === 'fuerte') avisos.push('Si el dolor es agudo, notaste un chasquido o no mejora en unos días, para y consulta a un fisioterapeuta.');
    } else if (m?.zona === 'otra') {
        avisos.push('Anota en las notas qué molestia era. Si persiste, consulta a un fisioterapeuta.');
    }

    return { ajustes, bloqueos, cambios, avisos };
}

export const siguienteSesion = (plan) => plan.sesiones.find(s => !plan.registros?.[s.id]) || null;
export const sesionesHechas = (plan) => Object.keys(plan.registros || {}).length;
