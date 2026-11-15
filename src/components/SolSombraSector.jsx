import React, { useEffect, useMemo } from 'react';
import { Sun, Link2, Link2Off, Copy } from 'lucide-react';
import {
    FECHAS_REFERENCIA, franjasSol, cardinal, textoInclinacion, formatoHora,
    paredDeFoto, ubicacionSol, resumenSector, nombreFoto,
} from '../utils/solar';

const ORIENTACIONES = [['N', 0], ['E', 90], ['S', 180], ['O', 270]];
const INCLINACIONES = [['Placa', 70], ['Vertical', 90], ['Desplome', 110], ['Techo', 140]];

export { ORIENTACION_INICIAL, INCLINACION_INICIAL } from '../utils/solar';

// Horario de sol y sombra del sector. Con la vinculación automática, el texto se calcula a
// partir de la ubicación del mapa y de la orientación e inclinación de la pared de cada foto.
//  info: infoCroquis; onChange recibe los campos del sector que cambian.
//  fotos: [{ foto, idx }] fotos del sector; onCambiarFoto(idx, campos) cambia una de ellas.
//  seleccion / onSeleccion: índice de la foto cuya pared se está ajustando (también en el mapa).
export default function SolSombraSector({ info, onChange, fotos = [], onCambiarFoto, seleccion, onSeleccion, inputStyle, labelStyle }) {
    const auto = Boolean(info.horarioSolAuto);
    const ubicacion = ubicacionSol(info);
    const actual = fotos.find(f => f.idx === seleccion) || fotos[0] || null;
    const pared = paredDeFoto(actual?.foto, info);
    const params = ubicacion ? { ...ubicacion, ...pared } : null;

    // Clave con todo lo que influye en el texto, para recalcularlo solo cuando cambia
    const clave = JSON.stringify([info.lat, info.lng, info.orientacion, info.inclinacion,
        fotos.map(f => [f.foto.nombre, f.foto.orientacion, f.foto.inclinacion])]);
    const resumen = useMemo(() => auto ? resumenSector(info, fotos.map(f => f.foto)) : null, [auto, clave]); // eslint-disable-line

    // Mantiene el texto al día mientras la vinculación esté activa
    useEffect(() => {
        if (resumen && resumen !== info.horarioSol) onChange({ horarioSol: resumen });
    }, [resumen]); // eslint-disable-line

    const activar = () => onChange(auto ? { horarioSolAuto: false } : { horarioSolAuto: true });

    // Sin fotos todavía, la pared se guarda en el sector
    const cambiarPared = (campos) => actual ? onCambiarFoto(actual.idx, campos) : onChange(campos);
    const aplicarATodas = () => {
        fotos.forEach(f => onCambiarFoto(f.idx, pared));
        onChange(pared);
    };

    return (
        <div style={{ marginBottom: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <label style={{ ...labelStyle, margin: 0 }}>Horario sol/sombra</label>
                <button onClick={activar} style={{ ...st.btnAuto, background: auto ? '#f39c12' : 'white', color: auto ? 'white' : '#d68910' }}
                    title="Calcular el horario con la ubicación, la orientación y la inclinación de cada pared">
                    {auto ? <Link2 size={14} /> : <Link2Off size={14} />} Vinculación automática
                </button>
            </div>
            {auto ? (
                <textarea value={info.horarioSol || ''} readOnly rows={Math.min(5, 1 + (info.horarioSol || '').split(' | ').length)}
                    style={{ ...inputStyle, background: '#fef9e7', resize: 'none', fontFamily: 'inherit', fontSize: '0.85rem' }} />
            ) : (
                <input value={info.horarioSol || ''} onChange={e => onChange({ horarioSol: e.target.value })}
                    placeholder="Ej: Sombra todo el año" style={inputStyle} />
            )}

            {auto && (
                <div style={st.panel}>
                    {!ubicacion && <p style={st.aviso}>Fija la ubicación del sector en el mapa para calcular el sol.</p>}

                    {fotos.length > 1 && (
                        <>
                            <div style={st.pestanas}>
                                {fotos.map(f => {
                                    const p = paredDeFoto(f.foto, info);
                                    const activa = f.idx === actual?.idx;
                                    return (
                                        <button key={f.idx} onClick={() => onSeleccion?.(f.idx)} style={{ ...st.pestana, ...(activa ? st.pestanaActiva : {}) }}>
                                            {nombreFoto(f.foto, f.idx)}
                                            <span style={{ fontWeight: 'normal', opacity: 0.8 }}> · {cardinal(p.orientacion)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p style={{ ...st.ayuda, marginTop: 0 }}>Cada foto puede ser una pared distinta. Ajusta la de <strong>{nombreFoto(actual?.foto, actual?.idx)}</strong>:</p>
                        </>
                    )}

                    <div style={st.fila}>
                        <span style={st.etiqueta}>Mira hacia</span>
                        <strong style={{ color: '#d68910' }}>{cardinal(pared.orientacion)} ({pared.orientacion}°)</strong>
                    </div>
                    <input type="range" min={0} max={355} step={5} value={pared.orientacion}
                        onChange={e => cambiarPared({ orientacion: Number(e.target.value) })} style={st.slider} />
                    <div style={st.presets}>
                        {ORIENTACIONES.map(([t, v]) => (
                            <button key={t} onClick={() => cambiarPared({ orientacion: v })} style={{ ...st.preset, ...(pared.orientacion === v ? st.presetActivo : {}) }}>{t}</button>
                        ))}
                    </div>

                    <div style={{ ...st.fila, marginTop: 10 }}>
                        <span style={st.etiqueta}>Inclinación</span>
                        <strong style={{ color: '#d68910' }}>{textoInclinacion(pared.inclinacion)}</strong>
                    </div>
                    <input type="range" min={45} max={150} step={5} value={pared.inclinacion}
                        onChange={e => cambiarPared({ inclinacion: Number(e.target.value) })} style={st.slider} />
                    <div style={st.presets}>
                        {INCLINACIONES.map(([t, v]) => (
                            <button key={t} onClick={() => cambiarPared({ inclinacion: v })} style={{ ...st.preset, ...(pared.inclinacion === v ? st.presetActivo : {}) }}>{t}</button>
                        ))}
                    </div>

                    {fotos.length > 1 && (
                        <button onClick={aplicarATodas} style={st.btnTodas}><Copy size={13} /> Aplicar esta pared a todas las fotos</button>
                    )}

                    {params && (
                        <div style={{ marginTop: 12 }}>
                            {FECHAS_REFERENCIA.map(f => <BarraDia key={f.id} fecha={f} params={params} />)}
                            <div style={st.leyenda}>
                                <span><i style={{ ...st.cuadro, background: '#f39c12' }} /> Sol directo</span>
                                <span><i style={{ ...st.cuadro, background: '#5dade2' }} /> Sombra</span>
                                <span><i style={{ ...st.cuadro, background: '#2c3e50' }} /> Noche</span>
                            </div>
                            {!Number.isFinite(params.lng) && <p style={st.aviso}>Sin longitud: las horas son solares, no del reloj.</p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const COLOR_TRAMO = { sol: '#f39c12', sombra: '#5dade2', noche: '#2c3e50' };

// Franja de 24 h de un día: sol, sombra y noche cada 15 minutos
export function BarraDia({ fecha, params }) {
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
    pestanas: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 },
    pestana: { flexShrink: 0, padding: '5px 10px', background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e0c48a', borderRadius: 14, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 'bold', color: '#7e5109', whiteSpace: 'nowrap' },
    pestanaActiva: { background: '#e67e22', borderColor: '#e67e22', color: 'white' },
    ayuda: { fontSize: '0.78rem', color: '#7f8c8d', margin: '0 0 8px' },
    fila: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' },
    etiqueta: { color: '#34495e', fontWeight: 'bold' },
    slider: { width: '100%', accentColor: '#f39c12' },
    presets: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    preset: { flex: '1 1 0', padding: '5px 6px', background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e0c48a', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', color: '#7e5109' },
    presetActivo: { background: '#f39c12', borderColor: '#f39c12', color: 'white' },
    btnTodas: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', marginTop: 10, padding: 7, background: 'white', color: '#7e5109', border: '1px dashed #e0c48a', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 'bold' },
    leyenda: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.72rem', color: '#7f8c8d', marginTop: 4 },
    cuadro: { display: 'inline-block', width: 10, height: 10, borderRadius: 2, verticalAlign: 'middle', marginRight: 3 },
    aviso: { fontSize: '0.78rem', color: '#a04000', margin: '0 0 8px' },
};
