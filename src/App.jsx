import React, { useState, useEffect } from 'react';
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

function leerHash() {
    const hash = window.location.hash;
    const mc = hash.match(/^#\/croquis\/(.+)$/);
    if (mc) return { tipo: 'croquis', id: mc[1] };
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

    useEffect(() => {
        resolverHash().then(p => setPantalla(p));

        const handlePop = () => resolverHash().then(p => setPantalla(p));
        window.addEventListener('popstate', handlePop);
        return () => window.removeEventListener('popstate', handlePop);
    }, []);

    const irAHome = (vista = null) => {
        window.history.pushState(null, '', window.location.pathname);
        setPantalla({ name: 'home', vista });
    };
    const irARocodromo = (id) => {
        window.history.pushState(null, '', `${window.location.pathname}#/rocodromo/${id}`);
        setPantalla({ name: 'rocodromo', id });
    };
    // croquis = null → nuevo; { escuelaInicial } → nuevo pre-relleno; {...datos} → editar existente
    const irAEditor = (croquis = null) => setPantalla({ name: 'editor', croquis });
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
                    vistaInicial={pantalla.vista}
                />
            )}
            {pantalla.name === 'editor' && (
                <CroquisEscalada
                    croquisInicial={pantalla.croquis}
                    onExit={() => irAHome()}
                />
            )}
            {pantalla.name === 'viewer' && (
                <CroquisViewer
                    croquis={pantalla.croquis}
                    onVolver={pantalla.volverA ? () => irAEscuela(pantalla.volverA.id, pantalla.volverA.sector) : () => irAHome()}
                    onEditar={(c) => irAEditor(c)}
                />
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
