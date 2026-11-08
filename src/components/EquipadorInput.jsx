import React, { useState, useEffect } from 'react';
import { cargarEquipadores, coincideNombre, nombreEquipador, useEquipadores } from '../utils/equipadores';
import { normalizarNombre } from '../utils/escuelas';

// Campo de equipador con sugerencias de las fichas existentes.
// onChange(nombre, equipadorId): el id es null si el nombre no corresponde a ninguna ficha.
export default function EquipadorInput({ nombre = '', onChange, inputStyle, placeholder = 'Nombre de quien equipó' }) {
    const [equipadores, setEquipadores] = useState([]);
    const [abierto, setAbierto] = useState(false);

    useEffect(() => { cargarEquipadores().then(setEquipadores); }, []);

    // Las fichas ocultas no se sugieren, pero un nombre exacto sigue enlazando con ellas para no duplicarlas
    const escribir = (texto) => {
        const exacto = equipadores.find(e => coincideNombre(e, texto));
        onChange(texto, exacto?.id || null);
    };

    const sugerencias = equipadores
        .filter(e => !e.oculto)
        .filter(e => normalizarNombre(nombreEquipador(e)).includes(normalizarNombre(nombre)) && !coincideNombre(e, nombre))
        .slice(0, 8);

    return (
        <div style={{ position: 'relative' }}>
            <input value={nombre} onChange={e => escribir(e.target.value)} placeholder={placeholder}
                onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
                style={inputStyle} />
            {abierto && sugerencias.length > 0 && (
                <div style={st.lista}>
                    {sugerencias.map(e => (
                        <div key={e.id} onMouseDown={() => { onChange(nombreEquipador(e), e.id); setAbierto(false); }} style={st.opcion}>
                            🔩 {nombreEquipador(e)}{e.usuarioUid ? ' ✔' : ''}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Línea de equipador (enlazada a su ficha) y colaboradores, para los detalles de una vía.
// Se muestra el nombre que haya elegido el equipador; si ocultó su ficha, no se enlaza.
export function EquipadorYColaboradores({ info, onVerEquipador }) {
    const equipadores = useEquipadores();
    const ficha = info?.equipadorId ? equipadores?.find(e => e.id === info.equipadorId) : null;
    const nombre = (ficha && !ficha.oculto ? nombreEquipador(ficha) : '') || info?.equipador;
    return (
        <>
            <p><strong>Equipador:</strong>{' '}
                {info?.equipadorId && onVerEquipador && !ficha?.oculto
                    ? <button onClick={() => onVerEquipador(info.equipadorId)} style={st.enlace}>{nombre}</button>
                    : nombre || 'Desconocido'}
            </p>
            {info?.colaboradores?.length > 0 && <p><strong>Colaboradores:</strong> {info.colaboradores.join(', ')}</p>}
        </>
    );
}

const st = {
    lista: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '2px solid #3498db', borderRadius: '0 0 8px 8px', boxShadow: '0 6px 16px rgba(0,0,0,0.15)', maxHeight: 180, overflowY: 'auto' },
    opcion: { padding: '9px 12px', cursor: 'pointer', fontSize: '0.92rem', borderBottom: '1px solid #f0f0f0', color: '#2c3e50' },
    enlace: { background: 'none', border: 'none', padding: 0, color: '#3498db', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' },
};
