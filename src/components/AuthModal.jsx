import React, { useState } from 'react';
import { X, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logotopoclimbing.png';

export default function AuthModal() {
    const { modalAuth, setModalAuth, registrar, iniciarSesion, iniciarConGoogle, confirmarAuth } = useAuth();
    const [modo, setModo] = useState('login'); // 'login' | 'registro'
    const [nombre, setNombre] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [verPass, setVerPass] = useState(false);
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);

    if (!modalAuth) return null;

    const resetForm = () => { setNombre(''); setEmail(''); setPassword(''); setError(''); };

    const cambiarModo = (m) => { setModo(m); resetForm(); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setCargando(true);
        try {
            if (modo === 'registro') {
                if (!nombre.trim()) { setError('Introduce tu nombre.'); setCargando(false); return; }
                await registrar(email, password, nombre.trim());
            } else {
                await iniciarSesion(email, password);
            }
            confirmarAuth();
        } catch (err) {
            setError(traducirError(err.code));
        }
        setCargando(false);
    };

    const handleGoogle = async () => {
        setError('');
        setCargando(true);
        try {
            await iniciarConGoogle();
            confirmarAuth();
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user') {
                setError(traducirError(err.code));
            }
        }
        setCargando(false);
    };

    return (
        <div style={st.overlay}>
            <div style={st.modal}>
                <div style={st.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img src={logo} alt="TopoClimbing" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.25)' }} />
                        <div style={st.tabs}>
                            <button onClick={() => cambiarModo('login')} style={{ ...st.tab, ...(modo === 'login' ? st.tabActivo : {}) }}>
                                <LogIn size={16} /> Entrar
                            </button>
                            <button onClick={() => cambiarModo('registro')} style={{ ...st.tab, ...(modo === 'registro' ? st.tabActivo : {}) }}>
                                <UserPlus size={16} /> Registrarse
                            </button>
                        </div>
                    </div>
                    <button onClick={() => setModalAuth(false)} style={st.btnClose}><X size={20} /></button>
                </div>

                <div style={st.body}>
                    <p style={st.subtitulo}>
                        {modo === 'login'
                            ? 'Inicia sesión para guardar tu croquis en la nube.'
                            : 'Crea una cuenta para guardar y compartir croquis.'}
                    </p>

                    <button type="button" onClick={handleGoogle} disabled={cargando} style={st.btnGoogle}>
                        <GoogleIcon />
                        Continuar con Google
                    </button>

                    <div style={st.separador}>
                        <span style={st.separadorLinea} />
                        <span style={st.separadorTexto}>o con email</span>
                        <span style={st.separadorLinea} />
                    </div>

                    <form onSubmit={handleSubmit}>
                        {modo === 'registro' && (
                            <div style={st.campo}>
                                <label style={st.label}>Nombre</label>
                                <input value={nombre} onChange={e => setNombre(e.target.value)}
                                    placeholder="Tu nombre" style={st.input} required />
                            </div>
                        )}
                        <div style={st.campo}>
                            <label style={st.label}>Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                placeholder="tu@email.com" style={st.input} required />
                        </div>
                        <div style={st.campo}>
                            <label style={st.label}>Contraseña</label>
                            <div style={{ position: 'relative' }}>
                                <input type={verPass ? 'text' : 'password'} value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Mínimo 6 caracteres" style={{ ...st.input, paddingRight: 44 }} required />
                                <button type="button" onClick={() => setVerPass(v => !v)} style={st.btnOjo}>
                                    {verPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        {error && <p style={st.error}>{error}</p>}
                        <button type="submit" disabled={cargando} style={st.btnSubmit}>
                            {cargando ? 'Cargando…' : modo === 'login' ? 'Entrar' : 'Crear cuenta'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

function GoogleIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
    );
}

function traducirError(code) {
    const errores = {
        'auth/invalid-email': 'Email no válido.',
        'auth/user-not-found': 'No existe cuenta con ese email.',
        'auth/wrong-password': 'Contraseña incorrecta.',
        'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
        'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
        'auth/invalid-credential': 'Email o contraseña incorrectos.',
    };
    return errores[code] || 'Error al autenticar. Inténtalo de nuevo.';
}

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 420, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' },
    header: { background: '#2c3e50', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    tabs: { display: 'flex', gap: 8 },
    tab: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', transition: 'all 0.2s' },
    tabActivo: { background: 'white', color: '#2c3e50' },
    btnClose: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' },
    body: { padding: 28 },
    subtitulo: { color: '#7f8c8d', fontSize: '0.9rem', marginBottom: 20, marginTop: 0 },
    campo: { marginBottom: 16 },
    label: { display: 'block', fontWeight: 'bold', color: '#34495e', marginBottom: 6, fontSize: '0.85rem' },
    input: { width: '100%', padding: '11px 14px', borderRadius: 8, border: '2px solid #ddd', boxSizing: 'border-box', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' },
    btnOjo: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#95a5a6' },
    error: { background: '#fdecea', color: '#c0392b', padding: '10px 14px', borderRadius: 8, fontSize: '0.9rem', marginBottom: 14 },
    btnSubmit: { width: '100%', padding: '13px', background: '#3498db', color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginTop: 4 },
    btnGoogle: { width: '100%', padding: '12px', background: 'white', color: '#3c4043', border: '1px solid #dadce0', borderRadius: 10, fontWeight: '600', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 4 },
    separador: { display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' },
    separadorLinea: { flex: 1, height: 1, background: '#e0e0e0' },
    separadorTexto: { color: '#9e9e9e', fontSize: '0.82rem', whiteSpace: 'nowrap' },
};
