import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { AuthProvider } from './contexts/AuthContext';
import AuthModal from './components/AuthModal';
import HomePage from './pages/HomePage';
import CroquisEscalada from './CroquisEscalada';
import CroquisViewer from './pages/CroquisViewer';
import ProfilePage from './pages/ProfilePage';
import EscuelaPagina from './pages/EscuelaPagina';
import RocodromoPagina from './pages/RocodromoPagina';
import TarjetaViaPagina from './pages/TarjetaViaPagina';
import EquipadorPagina from './pages/EquipadorPagina';
import JuegoPikt from './pages/JuegoPikt';

const VISTAS_INICIO = ['croquis', 'escuelas', 'rocodromos', 'equipadores', 'juegos'];

function leerHash() {
    const hash = window.location.hash;
    const mi = hash.match(/^#\/([a-z]+)$/);
    if (mi && VISTAS_INICIO.includes(mi[1])) return { tipo: 'inicio', vista: mi[1] };
    const mc = hash.match(/^#\/croquis\/(.+)$/);
    if (mc) return { tipo: 'croquis', id: mc[1] };
    const mj = hash.match(/^#\/juegos\/([a-z]+)$/);
    if (mj) return { tipo: 'juego', path: mj[1] };
    const mq = hash.match(/^#\/equipador\/(.+)$/);
    if (mq) return { tipo: 'equipador', id: mq[1] };
    const mv = hash.match(/^#\/via\/(.+)$/);
    if (mv) return { tipo: 'via', token: mv[1] };
    const mr = hash.match(/^#\/rocodromo\/(.+)$/);
    if (mr) return { tipo: 'rocodromo', id: mr[1] };
    const me = hash.match(/^#\/escuela\/([^/]+)(?:\/sector\/(.+))?$/);
    if (me) return { tipo: 'escuela', id: me[1], sector: me[2] ? decodeURIComponent(me[2]) : null };
    return null;
}

async function resolverHash() {
    const enlace = leerHash();
    if (!enlace) return { name: 'home' };
    if (enlace.tipo === 'croquis') {
        try {
            const snap = await getDoc(doc(db, 'croquis_escalada', enlace.id));
            if (snap.exists()) return { name: 'viewer', croquis: { id: snap.id, ...snap.data() } };
        } catch (e) { /* sin acceso o red — ir a home */ }
        return { name: 'home' };
    }
    if (enlace.tipo === 'juego') return { name: 'juego', path: enlace.path };
    if (enlace.tipo === 'inicio') return { name: 'home', vista: enlace.vista };
    if (enlace.tipo === 'equipador') return { name: 'equipador', id: enlace.id };
    if (enlace.tipo === 'via') return { name: 'tarjetaVia', token: enlace.token };
    if (enlace.tipo === 'rocodromo') return { name: 'rocodromo', id: enlace.id };
    if (enlace.tipo === 'escuela') {
        return { name: 'escuela', id: enlace.id, sector: enlace.sector };
    }
    return { name: 'home' };
}

export default function App() {
    // null = resolviendo deep link inicial
    const [pantalla, setPantalla] = useState(null);
    const guardaSalida = useRef(null); // el editor indica aquí si tiene cambios sin guardar

    useEffect(() => {
        resolverHash().then(p => setPantalla(p));

        const handlePop = () => {
            // El editor con cambios sin guardar puede impedir que el botón atrás lo cierre
            if (guardaSalida.current?.() && !window.confirm('Hay cambios sin guardar en el croquis. ¿Salir sin guardar?')) {
                window.history.pushState(null, '', `${window.location.pathname}#/editor`);
                return;
            }
            resolverHash().then(p => setPantalla(p));
        };
        window.addEventListener('popstate', handlePop);
        return () => window.removeEventListener('popstate', handlePop);
    }, []);

    const irAHome = (vista = null) => {
        window.history.pushState(null, '', window.location.pathname);
        setPantalla({ name: 'home', vista });
    };
    const irAJuego = (path) => {
        window.history.pushState(null, '', `${window.location.pathname}#/juegos/${path}`);
        setPantalla({ name: 'juego', path });
    };
    const irAEquipador = (id) => {
        window.history.pushState(null, '', `${window.location.pathname}#/equipador/${id}`);
        setPantalla({ name: 'equipador', id });
    };
    const irARocodromo = (id) => {
        window.history.pushState(null, '', `${window.location.pathname}#/rocodromo/${id}`);
        setPantalla({ name: 'rocodromo', id });
    };
    // croquis = null → nuevo; { escuelaInicial } → nuevo pre-relleno; {...datos} → editar existente
    const irAEditor = (croquis = null) => {
        window.history.pushState(null, '', `${window.location.pathname}#/editor`);
        setPantalla({ name: 'editor', croquis });
    };
    // volverA: página de escuela/sector desde la que se abrió el croquis
    const irAViewer = (croquis, volverA = null) => {
        if (croquis?.id) window.history.pushState(null, '', `${window.location.pathname}#/croquis/${croquis.id}`);
        setPantalla({ name: 'viewer', croquis, volverA });
    };
    const irAEscuela = (id, sector = null) => {
        const ruta = sector ? `#/escuela/${id}/sector/${encodeURIComponent(sector)}` : `#/escuela/${id}`;
        window.history.pushState(null, '', `${window.location.pathname}${ruta}`);
        setPantalla({ name: 'escuela', id, sector });
    };
    const irAPerfil = () => setPantalla({ name: 'profile' });

    if (!pantalla) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#7f8c8d', fontSize: '1.1rem' }}>
                Cargando…
            </div>
        );
    }

    return (
        <AuthProvider>
            <AuthModal />
            {pantalla.name === 'home' && (
                <HomePage
                    onCrearCroquis={(escuelaInicial) => irAEditor(typeof escuelaInicial === 'string' && escuelaInicial ? { escuelaInicial } : null)}
                    onVerCroquis={irAViewer}
                    onVerPerfil={irAPerfil}
                    onVerEscuela={irAEscuela}
                    onVerRocodromo={irARocodromo}
                    onVerEquipador={irAEquipador}
                    onAbrirJuego={irAJuego}
                    vistaInicial={pantalla.vista}
                    key={pantalla.vista || 'croquis'}
                />
            )}
            {pantalla.name === 'editor' && (
                <CroquisEscalada
                    croquisInicial={pantalla.croquis}
                    onExit={() => irAHome()}
                    registrarSalida={(fn) => { guardaSalida.current = fn; }}
                />
            )}
            {pantalla.name === 'viewer' && (
                <CroquisViewer
                    croquis={pantalla.croquis}
                    onVolver={pantalla.volverA ? () => irAEscuela(pantalla.volverA.id, pantalla.volverA.sector) : () => irAHome()}
                    onEditar={(c) => irAEditor(c)}
                    onVerEquipador={irAEquipador}
                />
            )}
            {pantalla.name === 'juego' && (
                <JuegoPikt key={pantalla.path} path={pantalla.path} onVolver={() => irAHome('juegos')} />
            )}
            {pantalla.name === 'equipador' && (
                <EquipadorPagina key={pantalla.id} equipadorId={pantalla.id} onVolver={() => irAHome('equipadores')} onVerCroquis={(c) => irAViewer(c)} />
            )}
            {pantalla.name === 'tarjetaVia' && (
                <TarjetaViaPagina key={pantalla.token} token={pantalla.token} onSalir={() => irAHome()} />
            )}
            {pantalla.name === 'rocodromo' && (
                <RocodromoPagina key={pantalla.id} rocodromoId={pantalla.id} onVolver={() => irAHome('rocodromos')} />
            )}
            {pantalla.name === 'escuela' && (
                <EscuelaPagina
                    key={`${pantalla.id}/${pantalla.sector || ''}`}
                    escuelaId={pantalla.id}
                    sector={pantalla.sector}
                    onVolver={pantalla.sector ? () => irAEscuela(pantalla.id) : () => irAHome()}
                    onVerSector={(sector) => irAEscuela(pantalla.id, sector)}
                    onVerCroquis={(c) => irAViewer(c, { id: pantalla.id, sector: pantalla.sector })}
                    onVerEquipador={irAEquipador}
                />
            )}
            {pantalla.name === 'profile' && (
                <ProfilePage
                    onVolver={() => irAHome()}
                    onVerCroquis={irAViewer}
                    onEditarCroquis={irAEditor}
                    onCrearCroquis={(escuelaInicial) => irAEditor(typeof escuelaInicial === 'string' && escuelaInicial ? { escuelaInicial } : null)}
                />
            )}
        </AuthProvider>
    );
}
