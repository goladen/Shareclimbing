import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import AuthModal from './components/AuthModal';
import HomePage from './pages/HomePage';
import CroquisEscalada from './CroquisEscalada';
import CroquisViewer from './pages/CroquisViewer';

// Pantallas posibles
// { name: 'home' }
// { name: 'editor', croquis: null | croquisData }  — null = nuevo croquis
// { name: 'viewer', croquis: croquisData }

export default function App() {
    const [pantalla, setPantalla] = useState({ name: 'home' });

    const irAHome = () => setPantalla({ name: 'home' });
    const irAEditor = (croquis = null) => setPantalla({ name: 'editor', croquis });
    const irAViewer = (croquis) => setPantalla({ name: 'viewer', croquis });

    return (
        <AuthProvider>
            <AuthModal />
            {pantalla.name === 'home' && (
                <HomePage
                    onCrearCroquis={() => irAEditor(null)}
                    onVerCroquis={irAViewer}
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
        </AuthProvider>
    );
}
