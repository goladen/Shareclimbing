import React, { useState } from 'react';
import { Check, Edit, Trash2, SlidersHorizontal, Star, X } from 'lucide-react';

export const GRADOS_BLOQUE = ['3', '4a', '4b', '4c', '5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c'];

const indiceGrado = (g) => GRADOS_BLOQUE.indexOf((g || '').trim().toLowerCase());

export const valoracionesDe = (b) => Object.values(b.valoraciones || {}).filter(Boolean);

export function resumenBloque(b) {
    const vals = valoracionesDe(b);
    const conEstrellas = vals.filter(v => v.estrellas);
    const media = conEstrellas.length ? conEstrellas.reduce((s, v) => s + v.estrellas, 0) / conEstrellas.length : null;
    // Grado que más se repite entre las propuestas
    const votos = {};
    vals.forEach(v => { if (v.grado) votos[v.grado] = (votos[v.grado] || 0) + 1; });
    const [gradoPropuesto, numVotos] = Object.entries(votos).sort((a, b) => b[1] - a[1])[0] || [];
    return { media, numValoraciones: conEstrellas.length, gradoPropuesto, numVotos, ascensos: (b.encadenadoPor || []).length };
}

const FILTROS_INICIALES = { estado: 'todos', desde: '', hasta: '', creador: '', ascensos: '', orden: 'grado' };

const ORDENES = {
    grado: (a, b) => indiceGrado(a.grado) - indiceGrado(b.grado),
    gradoDesc: (a, b) => indiceGrado(b.grado) - indiceGrado(a.grado),
    ascensos: (a, b) => resumenBloque(b).ascensos - resumenBloque(a).ascensos,
    estrellas: (a, b) => (resumenBloque(b).media || 0) - (resumenBloque(a).media || 0),
    recientes: (a, b) => (b.createdAt?.seconds ?? Infinity) - (a.createdAt?.seconds ?? Infinity),
};

export function Estrellas({ valor, tam = 14 }) {
    return (
        <span style={{ display: 'inline-flex', gap: 1, verticalAlign: '-2px' }} aria-label={`${valor} de 5 estrellas`}>
            {[1, 2, 3, 4, 5].map(n => (
                <Star key={n} size={tam} fill={n <= Math.round(valor) ? '#f1c40f' : 'none'} color={n <= Math.round(valor) ? '#f1c40f' : '#bdc3c7'} />
            ))}
        </span>
    );
}

// Lista de bloques de una foto con filtros, pensada sobre todo para el móvil
export function ListaBloques({ bloques, usuario, esPropietario, bloqueId, onSeleccionar, onEditar, onEliminar, onValorar }) {
    const [filtros, setFiltros] = useState(FILTROS_INICIALES);
    const [mostrarFiltros, setMostrarFiltros] = useState(false);
    const cambiar = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }));
    const hecho = (b) => Boolean(usuario && (b.encadenadoPor || []).includes(usuario.uid));

    const creadores = [...new Map(bloques.map(b => [b.creadoPor, b.creadoPorNombre || 'Sin nombre'])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1]));

    const visibles = bloques.filter(b => {
        if (filtros.estado !== 'todos' && (filtros.estado === 'hechos') !== hecho(b)) return false;
        const i = indiceGrado(b.grado);
        if (filtros.desde && (i < 0 || i < indiceGrado(filtros.desde))) return false;
        if (filtros.hasta && (i < 0 || i > indiceGrado(filtros.hasta))) return false;
        if (filtros.creador && b.creadoPor !== filtros.creador) return false;
        const asc = (b.encadenadoPor || []).length;
        if (filtros.ascensos === '0' && asc !== 0) return false;
        if (filtros.ascensos && filtros.ascensos !== '0' && asc < Number(filtros.ascensos)) return false;
        return true;
    }).sort(ORDENES[filtros.orden]);

    const activos = ['desde', 'hasta', 'creador', 'ascensos'].filter(k => filtros[k]).length;

    return (
        <div>
            <div style={st.barra}>
                {usuario && (
                    <div style={st.segmentado}>
                        {[['todos', 'Todos'], ['pendientes', 'Pendientes'], ['hechos', 'Hechos']].map(([id, label]) => (
                            <button key={id} onClick={() => cambiar('estado', id)} style={{ ...st.segmento, ...(filtros.estado === id ? st.segmentoActivo : {}) }}>{label}</button>
                        ))}
                    </div>
                )}
                <button onClick={() => setMostrarFiltros(m => !m)} style={{ ...st.btnFiltros, ...(activos ? st.btnFiltrosActivo : {}) }} aria-expanded={mostrarFiltros}>
                    <SlidersHorizontal size={15} /> Filtros{activos ? ` (${activos})` : ''}
                </button>
            </div>

            {mostrarFiltros && (
                <div style={st.panel}>
                    <label style={st.campo}>Grado desde
                        <select value={filtros.desde} onChange={e => cambiar('desde', e.target.value)} style={st.select} aria-label="Grado desde">
                            <option value="">Cualquiera</option>
                            {GRADOS_BLOQUE.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </label>
                    <label style={st.campo}>Grado hasta
                        <select value={filtros.hasta} onChange={e => cambiar('hasta', e.target.value)} style={st.select} aria-label="Grado hasta">
                            <option value="">Cualquiera</option>
                            {GRADOS_BLOQUE.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </label>
                    <label style={st.campo}>Creador
                        <select value={filtros.creador} onChange={e => cambiar('creador', e.target.value)} style={st.select} aria-label="Creador">
                            <option value="">Todos</option>
                            {creadores.map(([uid, nombre]) => <option key={uid} value={uid}>{nombre}</option>)}
                        </select>
                    </label>
                    <label style={st.campo}>Ascensos
                        <select value={filtros.ascensos} onChange={e => cambiar('ascensos', e.target.value)} style={st.select} aria-label="Ascensos">
                            <option value="">Cualquiera</option>
                            <option value="0">Sin ascensos</option>
                            <option value="1">Al menos 1</option>
                            <option value="5">Al menos 5</option>
                            <option value="10">Al menos 10</option>
                        </select>
                    </label>
                    <label style={{ ...st.campo, gridColumn: '1 / -1' }}>Ordenar por
                        <select value={filtros.orden} onChange={e => cambiar('orden', e.target.value)} style={st.select} aria-label="Ordenar por">
                            <option value="grado">Grado (de fácil a difícil)</option>
                            <option value="gradoDesc">Grado (de difícil a fácil)</option>
                            <option value="ascensos">Más ascensos</option>
                            <option value="estrellas">Mejor valorados</option>
                            <option value="recientes">Más recientes</option>
                        </select>
                    </label>
                    {activos > 0 && (
                        <button onClick={() => setFiltros(f => ({ ...FILTROS_INICIALES, estado: f.estado, orden: f.orden }))} style={st.btnLimpiar}>
                            <X size={14} /> Quitar filtros
                        </button>
                    )}
                </div>
            )}

            <div style={st.contador}>{visibles.length} {visibles.length === 1 ? 'bloque' : 'bloques'}{visibles.length !== bloques.length ? ` de ${bloques.length}` : ''}</div>

            {visibles.length === 0 && <div style={st.vacio}>{bloques.length === 0 ? 'Aún no hay bloques en esta foto.' : 'Ningún bloque con estos filtros.'}</div>}
            {visibles.map(b => {
                const r = resumenBloque(b);
                const mio = usuario && b.valoraciones?.[usuario.uid];
                const puedeGestionar = usuario && (usuario.uid === b.creadoPor || esPropietario);
                return (
                    <div key={b.id} style={{ ...st.fila, borderColor: b.id === bloqueId ? '#3498db' : '#ecf0f1' }}>
                        <button onClick={() => onSeleccionar(b.id)} style={st.filaInfo}>
                            <span style={st.grado}>{b.grado}</span>
                            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                <strong style={{ color: '#2c3e50', overflowWrap: 'anywhere', display: 'block' }}>{b.nombre || 'Bloque sin nombre'}</strong>
                                <span style={st.detalle}>
                                    {r.media !== null && <><Estrellas valor={r.media} tam={12} /> {r.media.toFixed(1)} · </>}
                                    {r.ascensos} {r.ascensos === 1 ? 'ascenso' : 'ascensos'} · {b.creadoPorNombre}
                                </span>
                                {r.gradoPropuesto && r.gradoPropuesto !== b.grado && (
                                    <span style={st.detalle}>Grado propuesto: <strong>{r.gradoPropuesto}</strong> ({r.numVotos} {r.numVotos === 1 ? 'voto' : 'votos'})</span>
                                )}
                            </span>
                        </button>
                        <div style={st.acciones}>
                            <button onClick={() => onValorar(b)} aria-pressed={hecho(b)} style={{ ...st.btnHecho, ...(hecho(b) ? st.btnHechoActivo : {}) }}>
                                <Check size={14} /> {hecho(b) && mio?.estrellas ? `${mio.estrellas}★` : 'Hecho'}
                            </button>
                            {puedeGestionar && (
                                <div style={{ display: 'flex', gap: 2 }}>
                                    <button onClick={() => onEditar(b)} style={st.btnIcono} title="Editar bloque"><Edit size={14} /></button>
                                    <button onClick={() => onEliminar(b)} style={{ ...st.btnIcono, color: '#e74c3c' }} title="Eliminar bloque"><Trash2 size={14} /></button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Al marcar un bloque como hecho: estrellas obligatorias y propuesta de grado opcional
export function ValorarBloqueModal({ bloque, valoracion, yaHecho, onGuardar, onQuitar, onClose }) {
    const [estrellas, setEstrellas] = useState(valoracion?.estrellas || 0);
    const [grado, setGrado] = useState(valoracion?.grado || '');
    const [guardando, setGuardando] = useState(false);

    const ejecutar = async (accion) => {
        setGuardando(true);
        await accion();
        setGuardando(false);
    };

    return (
        <div style={st.overlay} onClick={onClose}>
            <div style={st.modal} onClick={e => e.stopPropagation()}>
                <div style={st.modalHeader}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#2c3e50', overflowWrap: 'anywhere' }}>
                        {yaHecho ? 'Tu ascenso' : '¡Hecho!'} · {bloque.nombre || 'Bloque'} ({bloque.grado})
                    </h3>
                    <button onClick={onClose} style={st.btnCerrar}><X size={20} /></button>
                </div>
                <div style={{ padding: 18 }}>
                    <div style={st.etiqueta}>¿Qué te ha parecido? *</div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '6px 0 16px' }}>
                        {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} onClick={() => setEstrellas(n)} aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} style={st.btnEstrella}>
                                <Star size={34} fill={n <= estrellas ? '#f1c40f' : 'none'} color={n <= estrellas ? '#f1c40f' : '#bdc3c7'} />
                            </button>
                        ))}
                    </div>
                    <label style={st.etiqueta}>Grado que propones (opcional)
                        <select value={grado} onChange={e => setGrado(e.target.value)} style={{ ...st.select, marginTop: 6 }} aria-label="Grado que propones">
                            <option value="">Sin propuesta</option>
                            {GRADOS_BLOQUE.map(g => <option key={g} value={g}>{g}{g === bloque.grado ? ' (el actual)' : ''}</option>)}
                        </select>
                    </label>
                    <button disabled={!estrellas || guardando} onClick={() => ejecutar(() => onGuardar({ estrellas, grado }))}
                        style={{ ...st.btnGuardar, opacity: !estrellas || guardando ? 0.5 : 1 }}>
                        {guardando ? 'Guardando…' : yaHecho ? 'Guardar cambios' : 'Marcar como hecho'}
                    </button>
                    {yaHecho && (
                        <button disabled={guardando} onClick={() => ejecutar(onQuitar)} style={st.btnQuitar}>Quitar de mis hechos</button>
                    )}
                </div>
            </div>
        </div>
    );
}

const st = {
    barra: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 },
    segmentado: { display: 'flex', flex: 1, background: '#e8ecef', borderRadius: 10, padding: 3, minWidth: 0 },
    segmento: { flex: 1, padding: '8px 4px', border: 'none', borderRadius: 8, background: 'none', color: '#566573', fontWeight: 'bold', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' },
    segmentoActivo: { background: 'white', color: '#2c3e50', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
    btnFiltros: { display: 'flex', alignItems: 'center', gap: 5, padding: '9px 12px', background: 'white', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: 10, fontWeight: 'bold', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 'auto' },
    btnFiltrosActivo: { background: '#2c3e50', color: 'white', borderColor: '#2c3e50' },
    panel: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'white', border: '1px solid #ecf0f1', borderRadius: 10, padding: 12, marginBottom: 8 },
    campo: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', fontWeight: 'bold', color: '#566573', minWidth: 0 },
    select: { width: '100%', padding: '9px 8px', border: '1px solid #bdc3c7', borderRadius: 8, fontSize: '0.92rem', color: '#2c3e50', background: 'white' },
    btnLimpiar: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 8, background: 'none', border: '1px solid #e74c3c', color: '#e74c3c', borderRadius: 8, fontWeight: 'bold', fontSize: '0.82rem', cursor: 'pointer' },
    contador: { fontSize: '0.78rem', color: '#7f8c8d', margin: '4px 2px 8px' },
    vacio: { color: '#7f8c8d', fontStyle: 'italic', textAlign: 'center', padding: 24 },
    fila: { display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '2px solid #ecf0f1', borderRadius: 12, padding: '8px 8px 8px 10px', marginBottom: 8 },
    filaInfo: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.95rem', fontFamily: 'inherit' },
    grado: { background: '#2c3e50', color: 'white', borderRadius: 8, padding: '7px 0', width: 44, textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem', flexShrink: 0 },
    detalle: { display: 'block', fontSize: '0.76rem', color: '#7f8c8d', marginTop: 2 },
    acciones: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 },
    btnHecho: { display: 'flex', alignItems: 'center', gap: 3, padding: '8px 10px', background: 'white', color: '#566573', border: '1px solid #bdc3c7', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', minWidth: 74, justifyContent: 'center' },
    btnHechoActivo: { background: '#27ae60', color: 'white', borderColor: '#27ae60' },
    btnIcono: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer', padding: 6, display: 'flex' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2500 },
    modal: { background: 'white', width: '100%', maxWidth: 440, borderRadius: '16px 16px 0 0', overflow: 'hidden', boxShadow: '0 -10px 40px rgba(0,0,0,0.3)', paddingBottom: 'env(safe-area-inset-bottom)' },
    modalHeader: { background: '#f8f9fa', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderBottom: '1px solid #ecf0f1' },
    btnCerrar: { background: 'none', border: 'none', color: '#7f8c8d', cursor: 'pointer', flexShrink: 0 },
    etiqueta: { display: 'block', fontWeight: 'bold', color: '#34495e', fontSize: '0.88rem' },
    btnEstrella: { background: 'none', border: 'none', padding: 4, cursor: 'pointer' },
    btnGuardar: { width: '100%', marginTop: 16, padding: 13, background: '#27ae60', color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' },
    btnQuitar: { width: '100%', marginTop: 8, padding: 10, background: 'none', color: '#e74c3c', border: 'none', fontWeight: 'bold', cursor: 'pointer' },
};
