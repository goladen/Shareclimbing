import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { AuthProvider } from './contexts/AuthContext';
import AuthModal from './components/AuthModal';
import HomePage from './pages/HomePage';
import CroquisEscalada from './CroquisEscalada';
import CroquisViewer from './pages/CroquisViewer';
import ProfilePage from './pages/ProfilePage';

function leerHash() {
    const hash = window.location.hash;
    const mc = hash.match(/^#\/croquis\/(.+)$/);
    if (mc) return { tipo: 'croquis', id: mc[1] };
    const me = hash.match(/^#\/escuela\/(.+)$/);
    if (me) return { tipo: 'escuela', id: me[1] };
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
    if (enlace.tipo === 'escuela') {
        return { name: 'home', escuelaId: enlace.id };
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

    const irAHome = () => {
        window.history.pushState(null, '', window.location.pathname);
        setPantalla({ name: 'home' });
    };
    // croquis = null → nuevo; { escuelaInicial } → nuevo pre-relleno; {...datos} → editar existente
    const irAEditor = (croquis = null) => setPantalla({ name: 'editor', croquis });
    const irAViewer = (croquis) => {
        if (croquis?.id) window.history.pushState(null, '', `${window.location.pathname}#/croquis/${croquis.id}`);
        setPantalla({ name: 'viewer', croquis });
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
                    escuelaIdDestacada={pantalla.escuelaId}
                />
            )}
            {pantalla.name === 'editor' && (
                <CroquisEscalada
                    croquisInicial={pantalla.croquis}
                    onExit={irAHome}
                />
            )}
            {pantalla.name === 'viewer' && (
                <CroquisViewer
                    croquis={pantalla.croquis}
                    onVolver={irAHome}
                    onEditar={(c) => irAEditor(c)}
                />
            )}
            {pantalla.name === 'profile' && (
                <ProfilePage
                    onVolver={irAHome}
                    onVerCroquis={irAViewer}
                    onEditarCroquis={irAEditor}
                    onCrearCroquis={(escuelaInicial) => irAEditor(typeof escuelaInicial === 'string' && escuelaInicial ? { escuelaInicial } : null)}
                />
            )}
        </AuthProvider>
    );
}
