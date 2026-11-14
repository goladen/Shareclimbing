import React from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { TIPOS_SESION, CAPACIDADES, prescribirSesion, textoCarga, textoGrado, fase } from '../utils/entrenamiento';

// Plan completo en formato para imprimir (o guardar como PDF desde el diálogo de impresión).
// Las sesiones hechas muestran lo que se hizo; las pendientes, la carga calculada hoy.
export default function ImprimirPlan({ plan, test, onVolver }) {
    const peso = plan.test.peso;
    const semanas = {};
    plan.sesiones.forEach(s => { (semanas[s.semana] ||= []).push(s); });
    const fechaTest = test?.fecha ? new Date(test.fecha).toLocaleDateString() : null;

    const cargaTxt = (e) => [
        e.carga != null ? `${textoCarga(e.carga)} (total ${Math.round((peso + e.carga) * 2) / 2} kg)` : null,
        e.porcentaje != null ? `${e.porcentaje} %` : null,
    ].filter(Boolean).join(' · ');

    return (
        <div className="imprimir-plan" style={{ background: 'white', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif", color: '#222' }}>
            <div className="no-imprimir" style={{ position: 'sticky', top: 0, background: '#2c3e50', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 5 }}>
                <button onClick={onVolver} style={st.btnHeader}><ArrowLeft size={22} /></button>
                <div style={{ flex: 1, color: 'white', fontWeight: 'bold' }}>Imprimir plan</div>
                <button onClick={() => window.print()} style={st.btnImprimir}><Printer size={16} /> Imprimir o guardar PDF</button>
            </div>

            <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
                <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px' }}>Plan de entrenamiento · {plan.semanas} semanas</h1>
                <div style={{ fontSize: '0.88rem', color: '#555' }}>
                    Enfoque {plan.perfil.enfoque} · {plan.test.dias} días por semana · referencia para {textoGrado(plan.perfil.grado)} · peso {peso} kg
                    {fechaTest && ` · test del ${fechaTest}`}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', margin: '10px 0 6px', fontSize: '0.85rem' }}>
                    {Object.entries(plan.perfil.capacidades || {}).map(([k, c]) => (
                        <span key={k}><strong>{CAPACIDADES[k].nombre}:</strong> {CAPACIDADES[k].formato(c.valor)} ({Math.round(c.puntuacion * 100)} % de la ref.)</span>
                    ))}
                </div>
                <p style={{ fontSize: '0.78rem', color: '#666', margin: '6px 0 16px' }}>
                    Calienta 15-20 min antes de cada sesión. Las cargas de las sesiones pendientes son las de hoy: la app las ajusta según cómo vayan las anteriores,
                    así que consulta la sesión en la app antes de entrenar. Para ante cualquier dolor.
                </p>

                {Object.entries(semanas).map(([n, sesiones]) => {
                    const { descarga } = fase(plan, Number(n));
                    return (
                        <section key={n} style={{ marginBottom: 18, breakInside: 'avoid-page' }}>
                            <h2 style={{ fontSize: '1.1rem', borderBottom: '2px solid #2c3e50', paddingBottom: 3, margin: '0 0 8px' }}>
                                Semana {n}{descarga ? ' · descarga' : ''}
                            </h2>
                            {sesiones.map(s => {
                                const r = plan.registros?.[s.id];
                                const ejercicios = r?.prescripcion || prescribirSesion(plan, s).ejercicios;
                                return (
                                    <div key={s.id} style={{ border: '1px solid #ccc', borderRadius: 6, padding: '8px 10px', marginBottom: 8, breakInside: 'avoid' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.92rem', marginBottom: 4 }}>
                                            <strong>Día {s.orden} · {TIPOS_SESION[s.tipo]}</strong>
                                            <span style={{ fontSize: '0.8rem', color: '#555' }}>
                                                {r ? (r.saltada ? 'Saltada' : `Hecha el ${new Date(r.fecha).toLocaleDateString()} · esfuerzo ${r.rpe}/10`) : 'Fecha: ____________'}
                                            </span>
                                        </div>
                                        {r?.saltada ? null : (
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                <tbody>
                                                    {ejercicios.map(e => (
                                                        <tr key={e.clave}>
                                                            <td style={{ ...st.td, width: '28%', fontWeight: 600 }}>{e.nombre}</td>
                                                            <td style={st.td}>{e.principal}</td>
                                                            <td style={{ ...st.td, whiteSpace: 'nowrap' }}>{cargaTxt(e)}</td>
                                                            <td style={{ ...st.td, width: 70, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                                {r ? ({ todo: '✓', casi: '≈', no: '✗' }[r.resultados?.[e.clave]] || '') : '☐'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                        {!r && <div style={{ fontSize: '0.78rem', color: '#555', marginTop: 4 }}>Esfuerzo (1-10): ____ &nbsp;&nbsp; Molestias: ______________ &nbsp;&nbsp; Notas: ______________________</div>}
                                        {r?.notas && <div style={{ fontSize: '0.78rem', color: '#555', marginTop: 4, fontStyle: 'italic' }}>{r.notas}</div>}
                                    </div>
                                );
                            })}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

const st = {
    btnHeader: { background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4, display: 'flex' },
    btnImprimir: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.88rem' },
    td: { borderTop: '1px solid #eee', padding: '4px 6px', verticalAlign: 'top' },
};
