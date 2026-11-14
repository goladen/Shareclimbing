import React, { useEffect, useMemo } from 'react';
import { Sun, Link2, Link2Off } from 'lucide-react';
import { FECHAS_REFERENCIA, franjasSol, resumenSol, cardinal, textoInclinacion, formatoHora } from '../utils/solar';

const ORIENTACIONES = [['N', 0], ['E', 90], ['S', 180], ['O', 270]];
const INCLINACIONES = [['Placa', 70], ['Vertical', 90], ['Desplome', 110], ['Techo', 140]];

export const ORIENTACION_INICIAL = 180;
export const INCLINACION_INICIAL = 90;

// Horario de sol y sombra del sector. Con la vinculación automática, el texto se calcula
// a partir de la ubicación del mapa y de la orientación e inclinación de la pared.
// info: infoCroquis; onChange recibe los campos que cambian.
export default function SolSombraSector({ info, onChange, inputStyle, labelStyle }) {
    const auto = Boolean(info.horarioSolAuto);
    const lat = parseFloat(info.lat);
    const lng = parseFloat(info.lng);
    const hayUbicacion = Number.isFinite(lat);
    const orientacion = Number.isFinite(info.orientacion) ? info.orientacion : ORIENTACION_INICIAL;
    const inclinacion = Number.isFinite(info.inclinacion) ? info.inclinacion : INCLINACION_INICIAL;
    const params = { lat, lng: Number.isFinite(lng) ? lng : undefined, orientacion, inclinacion };

    const resumen = useMemo(() => auto && hayUbicacion ? resumenSol(params) : null,
        [auto, hayUbicacion, lat, lng, orientacion, inclinacion]); // eslint-disable-line

    // Mantiene el texto al día mientras la vinculación esté activa
    useEffect(() => {
        if (resumen && resumen !== info.horarioSol) onChange({ horarioSol: resumen });
    }, [resumen]); // eslint-disable-line

    const activar = () => onChange(auto
        ? { horarioSolAuto: false }
        : { horarioSolAuto: true, orientacion, inclinacion });

    return (
        <div style={{ marginBottom: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <label style={{ ...labelStyle, margin: 0 }}>Horario sol/sombra</label>
                <button onClick={activar} style={{ ...st.btnAuto, background: auto ? '#f39c12' : 'white', color: auto ? 'white' : '#d68910' }}
                    title="Calcular el horario con la ubicación, la orientación y la inclinación de la pared">
                    {auto ? <Link2 size={14} /> : <Link2Off size={14} />} Vinculación automática
                </button>
            </div>
            <input value={info.horarioSol || ''} onChange={e => onChange({ horarioSol: e.target.value })} readOnly={auto}
                placeholder="Ej: Sombra todo el año" style={{ ...inputStyle, background: auto ? '#fef9e7' : inputStyle?.background }} />

            {auto && (
                <div style={st.panel}>
                    {!hayUbicacion && <p style={st.aviso}>Fija la ubicación del sector en el mapa para calcular el sol.</p>}

                    <div style={st.fila}>
                        <span style={st.etiqueta}>Mira hacia</span>
                        <strong style={{ color: '#d68910' }}>{cardinal(orientacion)} ({orientacion}°)</strong>
                    </div>
                    <input type="range" min={0} max={355} step={5} value={orientacion}
                        onChange={e => onChange({ orientacion: Number(e.target.value) })} style={st.slider} />
                    <div style={st.presets}>
                        {ORIENTACIONES.map(([t, v]) => (
                            <button key={t} onClick={() => onChange({ orientacion: v })} style={{ ...st.preset, ...(orientacion === v ? st.presetActivo : {}) }}>{t}</button>
                        ))}
                    </div>

                    <div style={{ ...st.fila, marginTop: 10 }}>
                        <span style={st.etiqueta}>Inclinación</span>
                        <strong style={{ color: '#d68910' }}>{textoInclinacion(inclinacion)}</strong>
                    </div>
                    <input type="range" min={45} max={150} step={5} value={inclinacion}
                        onChange={e => onChange({ inclinacion: Number(e.target.value) })} style={st.slider} />
                    <div style={st.presets}>
                        {INCLINACIONES.map(([t, v]) => (
                            <button key={t} onClick={() => onChange({ inclinacion: v })} style={{ ...st.preset, ...(inclinacion === v ? st.presetActivo : {}) }}>{t}</button>
                        ))}
                    </div>

                    {hayUbicacion && (
                        <div style={{ marginTop: 12 }}>
                            {FECHAS_REFERENCIA.map(f => <BarraDia key={f.id} fecha={f} params={params} />)}
                            <div style={st.leyenda}>
                                <span><i style={{ ...st.cuadro, background: '#f39c12' }} /> Sol directo</span>
                                <span><i style={{ ...st.cuadro, background: '#5dade2' }} /> Sombra</span>
                                <span><i style={{ ...st.cuadro, background: '#2c3e50' }} /> Noche</span>
                            </div>
                            {!Number.isFinite(lng) && <p style={st.aviso}>Sin longitud: las horas son solares, no del reloj.</p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const COLOR_TRAMO = { sol: '#f39c12', sombra: '#5dade2', noche: '#2c3e50' };

// Franja de 24 h de un día: sol, sombra y noche cada 15 minutos
function BarraDia({ fecha, params }) {
    const { franjas, tramos, horasSol } = franjasSol({ ...params, mes: fecha.mes, dia: fecha.dia });
    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: '0.75rem', color: '#555', marginBottom: 2 }}>
                <span><Sun size={11} /> {fecha.label} ({fecha.dia}/{fecha.mes + 1})</span>
                <span>{horasSol.toFixed(1)} h de sol{franjas.length > 0 ? ` · ${franjas.map(f => `${formatoHora(f.inicio)}–${formatoHora(f.fin)}`).join(', ')}` : ''}</span>
            </div>
            <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden' }}>
                {tramos.map((t, i) => <div key={i} style={{ flex: 1, background: COLOR_TRAMO[t] }} />)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#95a5a6' }}>
                <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span>
            </div>
        </div>
    );
}

const st = {
    btnAuto: { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '2px solid #f39c12', borderRadius: 8, fontWeight: 'bold', fontSize: '0.78rem', cursor: 'pointer' },
    panel: { marginTop: 8, padding: 12, background: '#fdfaf3', border: '1px solid #f5e6c4', borderRadius: 10 },
    fila: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' },
    etiqueta: { color: '#34495e', fontWeight: 'bold' },
    slider: { width: '100%', accentColor: '#f39c12' },
    presets: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    preset: { flex: '1 1 0', padding: '5px 6px', background: 'white', border: '1px solid #e0c48a', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', color: '#7e5109' },
    presetActivo: { background: '#f39c12', borderColor: '#f39c12', color: 'white' },
    leyenda: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.72rem', color: '#7f8c8d', marginTop: 4 },
    cuadro: { display: 'inline-block', width: 10, height: 10, borderRadius: 2, verticalAlign: 'middle', marginRight: 3 },
    aviso: { fontSize: '0.78rem', color: '#a04000', margin: '0 0 8px' },
};
