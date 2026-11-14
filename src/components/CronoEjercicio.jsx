import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Pause, Play, SkipForward, Volume2, VolumeX, Check, Plus } from 'lucide-react';
import { textoCarga } from '../utils/entrenamiento';

// Crono a pantalla completa para uno o varios ejercicios seguidos.
// ejercicio = { nombre, principal, carga?, porcentaje?, porcentajeDe?, nota?, crono }
// crono = { series, trabajo?, reps?, pausa?, descanso, descansoTras?, etiqueta, abierto? }
//   con trabajo: fases con cuenta atrás (suspensiones, repeaters, ARC)
//   sin trabajo: la serie la marca el usuario («Hecho») y empieza el descanso
// Pita 3-2-1 al final de cada fase, al cambiar de fase y a 10 s del final de los descansos.

const DESCANSO_ENTRE_EJERCICIOS = 180;

function construirFases(ejercicios) {
    const fases = [];
    ejercicios.forEach((e, ej) => {
        const c = e.crono;
        if (!c) return;
        const series = Math.max(1, c.series || 1);
        for (let s = 1; s <= series; s++) {
            if (c.trabajo) {
                const reps = Math.max(1, c.reps || 1);
                for (let r = 1; r <= reps; r++) {
                    fases.push({ tipo: 'trabajo', dur: c.trabajo, serie: s, rep: reps > 1 ? r : null, ej });
                    if (r < reps && c.pausa) fases.push({ tipo: 'pausa', dur: c.pausa, serie: s, rep: r, ej });
                }
            } else {
                fases.push({ tipo: 'manual', serie: s, ej });
            }
            if (s < series && c.descanso) fases.push({ tipo: 'descanso', dur: c.descanso, serie: s, ej });
        }
        // Descanso antes del siguiente ejercicio
        if (ej < ejercicios.length - 1) {
            const d = c.descansoTras ?? DESCANSO_ENTRE_EJERCICIOS;
            if (d > 0) fases.push({ tipo: 'descanso', dur: d, ej, entre: true });
        }
    });
    if (fases[0]?.tipo === 'trabajo') fases.unshift({ tipo: 'prep', dur: 5, ej: fases[0].ej });
    return fases;
}

const FONDO = { inicio: '#2c3e50', prep: '#8e44ad', trabajo: '#27ae60', pausa: '#e67e22', descanso: '#2471a3', manual: '#2c3e50', fin: '#2c3e50' };

const mmss = (s) => {
    const m = Math.floor(s / 60);
    return m ? `${m}:${String(s % 60).padStart(2, '0')}` : String(s);
};

const textoPorcentaje = (e) => e.porcentaje != null ? `${e.porcentaje} % ${e.porcentajeDe || 'de tu máximo'}` : null;

export default function CronoEjercicio({ titulo, ejercicios, pesoCorporal, onCerrar }) {
    const fases = useMemo(() => construirFases(ejercicios), [ejercicios]);
    const [idx, setIdx] = useState(-1);              // -1 = aún sin empezar
    const [finEn, setFinEn] = useState(null);        // ms en que acaba la fase con cuenta atrás
    const [pausadoMs, setPausadoMs] = useState(null); // ms restantes si está en pausa
    const [ahora, setAhora] = useState(Date.now());
    const [sonido, setSonido] = useState(true);
    const audio = useRef(null);
    const ultimoSeg = useRef(null);
    const sonidoRef = useRef(sonido);
    sonidoRef.current = sonido;

    const fase = idx < 0 ? { tipo: 'inicio', ej: 0 } : idx >= fases.length ? { tipo: 'fin' } : fases[idx];
    const ejercicio = fase.ej != null ? ejercicios[fase.ej] : null;
    const c = ejercicio?.crono || {};
    const restanteMs = pausadoMs ?? (finEn ? finEn - ahora : null);
    const seg = restanteMs != null ? Math.max(0, Math.ceil(restanteMs / 1000)) : null;

    const pitar = (freq, dur = 0.15, veces = 1) => {
        if (!sonidoRef.current || !audio.current) return;
        const ctx = audio.current;
        for (let i = 0; i < veces; i++) {
            const t0 = ctx.currentTime + i * (dur + 0.08);
            const osc = ctx.createOscillator();
            const gan = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            gan.gain.setValueAtTime(0.18, t0);
            gan.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            osc.connect(gan).connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + dur + 0.02);
        }
    };
    const vibrar = (patron) => { try { navigator.vibrate?.(patron); } catch { /* sin vibración */ } };

    const irAFase = (i) => {
        ultimoSeg.current = null;
        setPausadoMs(null);
        setIdx(i);
        if (i >= fases.length) {
            setFinEn(null);
            pitar(1320, 0.25, 3);
            vibrar([300, 100, 300, 100, 300]);
            return;
        }
        const f = fases[i];
        setFinEn(f.dur ? Date.now() + f.dur * 1000 : null);
        setAhora(Date.now());
        if (f.tipo === 'trabajo' || (f.tipo === 'manual' && i > 0)) { pitar(1320, 0.45); vibrar(400); }
        else if (f.tipo === 'pausa' || f.tipo === 'descanso') { pitar(520, 0.35); vibrar(200); }
    };

    const empezar = () => {
        // El audio solo puede arrancar tras un toque del usuario
        if (!audio.current) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audio.current = new Ctx();
        }
        audio.current?.resume?.();
        irAFase(0);
    };

    // Reloj: se calcula con la hora real, así no se desfasa si el navegador ralentiza el intervalo
    useEffect(() => {
        if (!finEn || pausadoMs != null) return;
        const id = setInterval(() => setAhora(Date.now()), 200);
        return () => clearInterval(id);
    }, [finEn, pausadoMs]);

    useEffect(() => {
        if (seg == null || pausadoMs != null || !finEn) return;
        if (seg !== ultimoSeg.current) {
            ultimoSeg.current = seg;
            if (seg >= 1 && seg <= 3) pitar(880, 0.12);
            else if (fase.tipo === 'descanso' && seg === 10 && fase.dur >= 30) pitar(660, 0.15, 2);
        }
        if (restanteMs <= 0) irAFase(idx + 1);
    }, [ahora]); // eslint-disable-line

    // Mantener la pantalla encendida mientras el crono está abierto
    useEffect(() => {
        let bloqueo = null;
        const pedir = async () => {
            try { bloqueo = await navigator.wakeLock?.request('screen'); } catch { /* no disponible */ }
        };
        const alVolver = () => { if (document.visibilityState === 'visible') pedir(); };
        pedir();
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            document.removeEventListener('visibilitychange', alVolver);
            bloqueo?.release?.().catch(() => {});
            audio.current?.close?.().catch(() => {});
        };
    }, []);

    const pausar = () => {
        if (pausadoMs != null) { setFinEn(Date.now() + pausadoMs); setAhora(Date.now()); setPausadoMs(null); }
        else if (finEn) setPausadoMs(Math.max(0, finEn - Date.now()));
    };
    const sumar = (s) => {
        if (pausadoMs != null) setPausadoMs(pausadoMs + s * 1000);
        else if (finEn) setFinEn(finEn + s * 1000);
    };
    // Terminar el ejercicio actual (bloques al límite): salta al descanso o al siguiente ejercicio
    const terminarEjercicio = () => {
        const sig = fases.findIndex((f, i) => i > idx && (f.ej !== fase.ej || f.entre));
        irAFase(sig < 0 ? fases.length : sig);
    };

    const varios = ejercicios.length > 1;
    const siguiente = fases[idx + 1];
    let textoSiguiente = 'Fin';
    if (siguiente) {
        const sc = ejercicios[siguiente.ej].crono;
        if (siguiente.ej !== fase.ej) textoSiguiente = `${ejercicios[siguiente.ej].nombre}`;
        else if (siguiente.tipo === 'descanso') textoSiguiente = siguiente.entre && varios ? `Descanso ${mmss(siguiente.dur)} · luego ${ejercicios[siguiente.ej + 1]?.nombre}` : `Descanso ${mmss(siguiente.dur)}`;
        else if (siguiente.tipo === 'pausa') textoSiguiente = `Suelta ${siguiente.dur} s`;
        else if (siguiente.tipo === 'manual') textoSiguiente = sc.abierto ? `${sc.etiqueta} ${siguiente.serie}` : `Serie ${siguiente.serie}`;
        else textoSiguiente = `${sc.etiqueta} ${siguiente.dur >= 60 ? mmss(siguiente.dur) : `${siguiente.dur} s`}`;
    }

    let tituloFase;
    if (fase.tipo === 'inicio') tituloFase = titulo || ejercicios[0]?.nombre;
    else if (fase.tipo === 'fin') tituloFase = '¡Terminado!';
    else if (fase.tipo === 'prep') tituloFase = 'Prepárate';
    else if (fase.tipo === 'pausa') tituloFase = 'Suelta';
    else if (fase.tipo === 'descanso') tituloFase = 'Descanso';
    else if (fase.tipo === 'manual' && c.abierto) tituloFase = '¡A por él!';
    else tituloFase = c.etiqueta || ejercicio?.nombre;

    const enCurso = fase.tipo !== 'inicio' && fase.tipo !== 'fin';
    const serieTxt = !enCurso || !fase.serie || fase.entre ? ''
        : c.abierto ? `${c.etiqueta} ${fase.serie}` : `Serie ${fase.serie} de ${c.series}`;
    const repTxt = fase.rep ? ` · Rep. ${fase.rep} de ${c.reps}` : '';
    const cargaTxt = ejercicio?.carga != null ? textoCarga(ejercicio.carga) : null;
    const pctTxt = ejercicio ? textoPorcentaje(ejercicio) : null;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: FONDO[fase.tipo], color: 'white', display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', sans-serif", transition: 'background 0.25s', userSelect: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', gap: 8 }}>
                <div style={{ fontSize: '0.9rem', opacity: 0.85, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {enCurso && ejercicio ? (
                        <>
                            {varios && `${fase.ej + 1}/${ejercicios.length} · `}{ejercicio.nombre}
                            {cargaTxt ? ` · ${cargaTxt}` : ''}{pctTxt ? ` · ${ejercicio.porcentaje} %` : ''}
                        </>
                    ) : (titulo || '')}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setSonido(!sonido)} style={st.icono} title={sonido ? 'Silenciar' : 'Activar sonido'}>{sonido ? <Volume2 size={22} /> : <VolumeX size={22} />}</button>
                    <button onClick={onCerrar} style={st.icono} title="Cerrar"><X size={24} /></button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center', gap: 6, overflowY: 'auto' }}>
                <div style={{ fontSize: 'clamp(1.6rem, 8vw, 3rem)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{tituloFase}</div>
                {enCurso && <div style={{ fontSize: '1.1rem', opacity: 0.9 }}>{serieTxt}{repTxt}</div>}

                {fase.tipo === 'inicio' ? (
                    <>
                        <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420, width: '100%' }}>
                            {ejercicios.map((e, i) => (
                                <div key={i} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', textAlign: 'left' }}>
                                    <strong>{e.nombre}</strong> · {e.principal}
                                    {(e.carga != null || e.porcentaje != null) && (
                                        <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>
                                            {e.carga != null && `${textoCarga(e.carga)} · total ${Math.round((pesoCorporal + e.carga) * 2) / 2} kg`}
                                            {e.carga != null && e.porcentaje != null && ' · '}
                                            {textoPorcentaje(e)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button onClick={empezar} disabled={!fases.length} style={{ ...st.grande, marginTop: 14 }}><Play size={28} /> Empezar</button>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 10, maxWidth: 320 }}>
                            Sube el volumen. Pitará 3-2-1 antes de cada cambio y mantendrá la pantalla encendida.
                        </div>
                    </>
                ) : fase.tipo === 'fin' ? (
                    <>
                        <Check size={90} />
                        <button onClick={onCerrar} style={{ ...st.grande, marginTop: 20 }}>Cerrar</button>
                    </>
                ) : fase.tipo === 'manual' ? (
                    <>
                        {(cargaTxt || pctTxt) && <div style={st.carga}>{[cargaTxt, pctTxt].filter(Boolean).join(' · ')}</div>}
                        {ejercicio?.nota && <div style={{ fontSize: '0.95rem', opacity: 0.85 }}>{ejercicio.nota}</div>}
                        <div style={{ fontSize: '1rem', opacity: 0.8, margin: '8px 0 18px' }}>Pulsa cuando termines y empezará el descanso</div>
                        <button onClick={() => irAFase(idx + 1)} style={st.grande}><Check size={30} /> Hecho</button>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: 'clamp(6rem, 38vw, 16rem)', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', opacity: pausadoMs != null ? 0.5 : 1 }}>
                            {mmss(seg ?? 0)}
                        </div>
                        {(fase.tipo === 'trabajo' || fase.tipo === 'prep') && (cargaTxt || pctTxt) && (
                            <div style={st.carga}>{[cargaTxt, pctTxt].filter(Boolean).join(' · ')}</div>
                        )}
                    </>
                )}

                {enCurso && <div style={{ fontSize: '0.95rem', opacity: 0.75, marginTop: 12 }}>Después: {textoSiguiente}</div>}
            </div>

            {enCurso && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '14px 14px 28px', flexWrap: 'wrap' }}>
                    {fase.dur ? (
                        <button onClick={pausar} style={st.control}>{pausadoMs != null ? <><Play size={18} /> Seguir</> : <><Pause size={18} /> Pausa</>}</button>
                    ) : null}
                    {fase.tipo === 'descanso' && <button onClick={() => sumar(30)} style={st.control}><Plus size={18} /> 30 s</button>}
                    {fase.tipo !== 'manual' && <button onClick={() => irAFase(idx + 1)} style={st.control}><SkipForward size={18} /> Saltar</button>}
                    {c.abierto && !fase.entre && <button onClick={terminarEjercicio} style={st.control}><Check size={18} /> Terminar ejercicio</button>}
                </div>
            )}
        </div>
    );
}

const st = {
    icono: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 10, padding: 8, cursor: 'pointer', display: 'flex' },
    grande: { display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 34px', background: 'white', color: '#2c3e50', border: 'none', borderRadius: 40, fontWeight: 800, fontSize: '1.3rem', cursor: 'pointer' },
    control: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 18px', background: 'rgba(255,255,255,0.18)', color: 'white', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 30, fontWeight: 700, fontSize: '1rem', cursor: 'pointer' },
    carga: { background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '6px 14px', fontSize: '1.05rem', fontWeight: 700, marginTop: 8 },
};
