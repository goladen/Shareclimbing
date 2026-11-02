import { useEffect } from 'react';

// Chrome/Android ofrece la instalación con este evento; se guarda para lanzarla desde un botón
let promptInstalacion = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptInstalacion = e;
});
window.addEventListener('appinstalled', () => { promptInstalacion = null; });

export const puedeInstalar = () => Boolean(promptInstalacion);

export async function instalar() {
    if (!promptInstalacion) return false;
    const evento = promptInstalacion;
    promptInstalacion = null;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    return outcome === 'accepted';
}

let urlManifiestoAnterior = null;

// El manifiesto se genera para la página actual: el acceso directo que se cree desde
// aquí abrirá esta misma parte de la app (un rocódromo, una escuela, la lista…).
export function actualizarAccesoDirecto(nombre) {
    const origen = `${window.location.origin}/`;
    const iconos = [
        { src: `${origen}icono-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${origen}icono-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${origen}icono-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ];
    const url = window.location.href;
    const manifiesto = {
        id: url,
        name: nombre === 'TopoClimbing' ? nombre : `${nombre} · TopoClimbing`,
        short_name: nombre.length <= 12 ? nombre : `${nombre.slice(0, 11)}…`,
        start_url: url,
        scope: origen,
        display: 'standalone',
        background_color: '#2c3e50',
        theme_color: '#2c3e50',
        icons: iconos,
        shortcuts: [
            { name: 'Rocódromos', url: `${origen}#/rocodromos`, icons: iconos.slice(0, 1) },
            { name: 'Escuelas', url: `${origen}#/escuelas`, icons: iconos.slice(0, 1) },
            { name: 'Juegos', url: `${origen}#/juegos`, icons: iconos.slice(0, 1) },
            { name: 'Croquis', url: origen, icons: iconos.slice(0, 1) },
        ],
    };
    let enlace = document.querySelector('link[rel="manifest"]');
    if (!enlace) {
        enlace = document.createElement('link');
        enlace.rel = 'manifest';
        document.head.appendChild(enlace);
    }
    const urlManifiesto = URL.createObjectURL(new Blob([JSON.stringify(manifiesto)], { type: 'application/manifest+json' }));
    enlace.href = urlManifiesto;
    if (urlManifiestoAnterior) URL.revokeObjectURL(urlManifiestoAnterior);
    urlManifiestoAnterior = urlManifiesto;

    document.title = manifiesto.name;
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', manifiesto.short_name);
}

// Mantiene el manifiesto al día mientras la página está a la vista
export function useAccesoDirecto(nombre) {
    useEffect(() => {
        if (nombre) actualizarAccesoDirecto(nombre);
    }, [nombre, window.location.hash]); // eslint-disable-line
}
