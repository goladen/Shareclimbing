import React, { useState } from 'react';
import { X, Mountain, Camera } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import LocationPicker from './LocationPicker';
import { procesarImagenParaSubir, subirACloudinary, formatearMB, MAX_MB } from '../utils/imagen';

// escuelaEditar: objeto con datos existentes (modo edición), o null (modo creación)
export default function EscuelaModal({ onClose, onCreada, onEditada, escuelaEditar }) {
    const modoEdicion = Boolean(escuelaEditar);
    const { usuario, pedirAuth } = useAuth();
    const [nombre, setNombre] = useState(escuelaEditar?.nombre || '');
    const [descripcion, setDescripcion] = useState(escuelaEditar?.descripcion || '');
    const [acceso, setAcceso] = useState(escuelaEditar?.acceso || '');
    const [restricciones, setRestricciones] = useState(escuelaEditar?.restricciones || '');
    const [lat, setLat] = useState(escuelaEditar?.lat ?? '');
    const [lng, setLng] = useState(escuelaEditar?.lng ?? '');
    const [mapsUrl, setMapsUrl] = useState(escuelaEditar?.mapsUrl || '');
    const [imagenFile, setImagenFile] = useState(null);
    const [imagenPreview, setImagenPreview] = useState(escuelaEditar?.imagenUrl || null);
    const [guardando, setGuardando] = useState(false);
    const [progreso, setProgreso] = useState('');
    const [error, setError] = useState('');

    const handleImagen = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const mb = file.size / (1024 * 1024);
        if (mb > MAX_MB) {
            setError(`La imagen pesa ${formatearMB(file.size)} y supera el límite de ${MAX_MB} MB.`);
            return;
        }
        setError('');
        setImagenFile(file);
        const reader = new FileReader();
        reader.onload = ev => setImagenPreview(ev.target.result);
        reader.readAsDataURL(file);
    };

    const guardar = async () => {
        if (!nombre.trim()) { setError('El nombre de la escuela es obligatorio.'); return; }
        if (!usuario) { pedirAuth(() => guardar()); return; }

        setGuardando(true);
        setError('');
        try {
            let imagenUrl = escuelaEditar?.imagenUrl || null; // mantener imagen anterior si no hay nueva
            if (imagenFile) {
                const resultado = await procesarImagenParaSubir(imagenFile, setProgreso);
                if (resultado.error) { setError(resultado.error); setGuardando(false); return; }
                imagenUrl = await subirACloudinary(resultado.blob, setProgreso);
                setProgreso('');
            }

            const datos = {
                nombre: nombre.trim(),
                descripcion: descripcion.trim(),
                acceso: acceso.trim(),
                restricciones: restricciones.trim(),
                lat: lat !== '' ? parseFloat(lat) : null,
                lng: lng !== '' ? parseFloat(lng) : null,
                mapsUrl: mapsUrl.trim(),
                imagenUrl,
            };

            if (modoEdicion) {
                await updateDoc(doc(db, 'escuelas', escuelaEditar.id), datos);
                onEditada?.({ ...escuelaEditar, ...datos });
            } else {
                const docRef = await addDoc(collection(db, 'escuelas'), {
                    ...datos,
                    creadoPor: usuario.uid,
                    createdAt: serverTimestamp(),
                });
                onCreada?.({ id: docRef.id, ...datos });
            }
            onClose();
        } catch (e) {
            setError('Error al guardar: ' + e.message);
        }
        setGuardando(false);
    };

    return (
        <div style={st.overlay}>
            <div style={st.modal}>
                <div style={st.header}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Mountain size={20} /> {modoEdicion ? 'Editar Escuela' : 'Nueva Escuela de Escalada'}
                    </span>
                    <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                </div>

                <div style={st.body}>
                    {error && <p style={st.error}>{error}</p>}

                    <Field label="Nombre *">
                        <input value={nombre} onChange={e => setNombre(e.target.value)}
                            placeholder="Ej: Rodellar, Margalef, Siurana…" style={st.input} autoFocus />
                    </Field>

                    <Field label="Descripción">
                        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                            placeholder="Breve descripción del área de escalada…" rows={3}
                            style={{ ...st.input, resize: 'vertical' }} />
                    </Field>

                    <Field label="Imagen de portada">
                        <label style={st.btnImagen}>
                            {imagenPreview
                                ? <img src={imagenPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                                : <span style={{ color: '#7f8c8d', display: 'flex', alignItems: 'center', gap: 8 }}><Camera size={20} /> Seleccionar imagen</span>
                            }
                            <input type="file" accept="image/*" onChange={handleImagen} style={{ display: 'none' }} />
                        </label>
                    </Field>

                    <Field label="Acceso">
                        <textarea value={acceso} onChange={e => setAcceso(e.target.value)}
                            placeholder="Cómo llegar…" rows={2}
                            style={{ ...st.input, resize: 'vertical' }} />
                    </Field>

                    <Field label="Restricciones">
                        <textarea value={restricciones} onChange={e => setRestricciones(e.target.value)}
                            placeholder="Cierres temporales, nidificación…" rows={2}
                            style={{ ...st.input, resize: 'vertical' }} />
                    </Field>

                    <Field label="Ubicación en el mapa">
                        <LocationPicker
                            lat={lat} lng={lng}
                            onChange={(la, ln) => { setLat(la); setLng(ln); }}
                        />
                    </Field>

                    <Field label="Enlace Google Maps (opcional)">
                        <input value={mapsUrl} onChange={e => setMapsUrl(e.target.value)}
                            placeholder="https://maps.app.goo.gl/…" style={st.input} />
                    </Field>

                    {progreso && <p style={st.progreso}>{progreso}</p>}

                    <button onClick={guardar} disabled={guardando} style={st.btnGuardar}>
                        {guardando ? 'Guardando…' : modoEdicion ? 'Guardar cambios' : 'Crear escuela'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const Field = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontWeight: 'bold', color: '#34495e', marginBottom: 6, fontSize: '0.87rem' }}>{label}</label>
        {children}
    </div>
);

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 580, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.35)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' },
    header: { background: '#2c3e50', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
    btnClose: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' },
    body: { padding: 24, overflowY: 'auto', flex: 1 },
    input: { width: '100%', padding: '10px 14px', border: '2px solid #ddd', borderRadius: 8, boxSizing: 'border-box', fontSize: '0.95rem', outline: 'none' },
    btnImagen: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 110, border: '2px dashed #bdc3c7', borderRadius: 10, cursor: 'pointer', overflow: 'hidden', background: '#f8f9fa' },
    error: { background: '#fdecea', color: '#c0392b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: '0.9rem' },
    btnGuardar: { width: '100%', padding: '13px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginTop: 8 },
    progreso: { background: '#eaf4fb', color: '#2980b9', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: '0.88rem' },
};
