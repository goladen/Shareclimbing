import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup
} from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [usuario, setUsuario] = useState(undefined); // undefined = cargando
    const [modalAuth, setModalAuth] = useState(false); // mostrar modal login/registro
    const [onAuthSuccess, setOnAuthSuccess] = useState(null); // callback tras login

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, u => setUsuario(u ?? null));
        return unsub;
    }, []);

    const registrar = (email, password, nombre) =>
        createUserWithEmailAndPassword(auth, email, password).then(({ user }) =>
            updateProfile(user, { displayName: nombre })
        );

    const iniciarSesion = (email, password) =>
        signInWithEmailAndPassword(auth, email, password);

    const iniciarConGoogle = () =>
        signInWithPopup(auth, new GoogleAuthProvider());

    const cerrarSesion = () => signOut(auth);

    // Muestra el modal y ejecuta callback tras autenticarse
    const pedirAuth = (callback) => {
        setOnAuthSuccess(() => callback);
        setModalAuth(true);
    };

    const confirmarAuth = () => {
        setModalAuth(false);
        if (onAuthSuccess) {
            onAuthSuccess();
            setOnAuthSuccess(null);
        }
    };

    return (
        <AuthContext.Provider value={{
            usuario,
            cargando: usuario === undefined,
            registrar,
            iniciarSesion,
            iniciarConGoogle,
            cerrarSesion,
            modalAuth,
            setModalAuth,
            pedirAuth,
            confirmarAuth
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
