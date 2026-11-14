// Sol y sombra en una pared según latitud, fecha, orientación e inclinación.
// Cálculo del simulador «Sol y Sombra (Paredes)» de educando, con un añadido:
// si se conoce la longitud, la hora es la del reloj (huso horario y horario de
// verano incluidos) en lugar de la hora solar.
//
// orientacion: hacia dónde mira la cara de la pared, en grados (0 = N, 90 = E, 180 = S, 270 = O)
// inclinacion: ángulo de la pared con el suelo (90 = vertical, < 90 placa, > 90 desplome)

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const diaDelAnio = (mes, dia) => DIAS_MES.slice(0, mes).reduce((a, b) => a + b, 0) + dia;

// Horas que el reloj va por delante de UTC ese día, según el huso de este navegador
const husoHorario = (mes, dia) => -new Date(new Date().getFullYear(), mes, dia, 12).getTimezoneOffset() / 60;

export function calcSolar(latitud, doy, hora, orientacion, inclinacion, correccionHora = 0) {
    // Ecuación del tiempo: de hora civil a hora solar real (minutos)
    const bEoT = (360 / 365) * (doy - 81) * D2R;
    const eot = 9.87 * Math.sin(2 * bEoT) - 7.53 * Math.cos(bEoT) - 1.5 * Math.sin(bEoT);
    const horaSolar = hora + correccionHora + eot / 60;

    const declR = 23.45 * Math.sin(D2R * (360 / 365) * (doy - 81)) * D2R;
    const latR = latitud * D2R;
    const haR = (horaSolar - 12) * 15 * D2R;

    const sinAlpha = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(haR);
    const alpha = Math.asin(Math.max(-1, Math.min(1, sinAlpha)));
    const elev = alpha * R2D;
    if (elev <= 0) return { elev, azimut: 0, deDia: false, alSol: false, incidencia: 0 };

    const y = -Math.cos(declR) * Math.sin(haR);
    const x = Math.cos(latR) * Math.sin(declR) - Math.sin(latR) * Math.cos(declR) * Math.cos(haR);
    let azimut = Math.atan2(y, x) * R2D;
    if (azimut < 0) azimut += 360;

    // Incidencia del sol sobre la normal de la pared
    const cosInc = Math.sin(alpha) * Math.cos(inclinacion * D2R)
        + Math.cos(alpha) * Math.sin(inclinacion * D2R) * Math.cos((azimut - orientacion) * D2R);

    return { elev, azimut, deDia: true, alSol: cosInc > 0, incidencia: Math.max(0, cosInc) };
}

// Franjas con sol directo un día: [{ inicio, fin }] en horas del reloj (paso de 15 min)
export function franjasSol({ lat, lng, orientacion, inclinacion, mes, dia }) {
    const doy = diaDelAnio(mes, dia);
    // Sin longitud se usa la hora solar, como el simulador original
    const correccion = Number.isFinite(lng) ? lng / 15 - husoHorario(mes, dia) : 0;
    const franjas = [];
    let inicio = null;
    let horasDia = 0;
    const tramos = []; // cada 15 min: 'sol' | 'sombra' | 'noche'
    for (let h = 0; h < 24; h += 0.25) {
        const s = calcSolar(lat, doy, h, orientacion, inclinacion, correccion);
        if (s.deDia) horasDia += 0.25;
        tramos.push(s.alSol ? 'sol' : s.deDia ? 'sombra' : 'noche');
        if (s.alSol && inicio === null) inicio = h;
        else if (!s.alSol && inicio !== null) { franjas.push({ inicio, fin: h }); inicio = null; }
    }
    if (inicio !== null) franjas.push({ inicio, fin: 24 });
    return { franjas, tramos, horasSol: franjas.reduce((a, f) => a + f.fin - f.inicio, 0), horasDia };
}

export const FECHAS_REFERENCIA = [
    { id: 'invierno', label: 'Invierno', mes: 11, dia: 21 },
    { id: 'equinoccio', label: 'Primavera/otoño', mes: 2, dia: 21 },
    { id: 'verano', label: 'Verano', mes: 5, dia: 21 },
];

export const formatoHora = (h) => {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const textoFranjas = (franjas) => franjas.length === 0
    ? 'sombra todo el día'
    : 'sol ' + franjas.map(f => `${formatoHora(f.inicio)}–${formatoHora(f.fin)}`).join(' y ');

// Texto para el campo «Horario sol/sombra» con las tres fechas de referencia
export function resumenSol(params) {
    const partes = FECHAS_REFERENCIA.map(f => ({ ...f, texto: textoFranjas(franjasSol({ ...params, mes: f.mes, dia: f.dia }).franjas) }));
    if (partes.every(p => p.texto === partes[0].texto)) return partes[0].texto[0].toUpperCase() + partes[0].texto.slice(1) + ' todo el año';
    return partes.map(p => `${p.label}: ${p.texto}`).join(' · ');
}

export const PUNTOS_CARDINALES = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export const cardinal = (deg) => PUNTOS_CARDINALES[Math.floor(((deg % 360) + 360) % 360 / 22.5 + 0.5) % 16];

export const textoInclinacion = (deg) => {
    if (deg === 90) return 'Vertical';
    if (deg < 90) return `Placa (${90 - deg}°)`;
    return `Desplome (${deg - 90}°)`;
};
