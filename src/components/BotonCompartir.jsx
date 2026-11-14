import React, { useState } from 'react';
import { Share2, Check } from 'lucide-react';

// Comparte un enlace: en el móvil abre el menú de compartir del sistema; en el ordenador,
// o si no está disponible, copia el enlace. No propaga el clic, para poder usarlo dentro de tarjetas pulsables.
export default function BotonCompartir({ titulo, url, estilo, conTexto = false }) {
    const [copiado, setCopiado] = useState(false);

    const compartir = async (e) => {
        e.stopPropagation();
        // El menú del sistema solo en pantallas táctiles; en el ordenador es más útil copiar el enlace
        if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
            try { await navigator.share({ title: titulo, url }); return; }
            catch (err) { if (err.name === 'AbortError') return; }
        }
        try {
            await navigator.clipboard.writeText(url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        } catch { window.prompt('Copia este enlace:', url); }
    };

    return (
        <button onClick={compartir} onPointerDown={e => e.stopPropagation()} style={estilo}
            title={copiado ? 'Enlace copiado' : `Compartir ${titulo}`} aria-label={`Compartir ${titulo}`}>
            {copiado ? <Check size={16} /> : <Share2 size={16} />}
            {(conTexto || copiado) && <span style={{ marginLeft: 5 }}>{copiado ? 'Copiado' : 'Compartir'}</span>}
        </button>
    );
}

export const enlaceRocodromo = (id) => `${window.location.origin}${window.location.pathname}#/rocodromo/${id}`;
