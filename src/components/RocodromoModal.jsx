import React, { useState } from 'react';
import { X, Dumbbell, Camera } from 'lucide-react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import LocationPicker from './LocationPicker';
import { procesarImagenParaSubir, subirACloudinary, formatearMB, MAX_MB } from '../utils/imagen';

// Sube archivos de imagen y devuelve las fotos listas para guardar en el rocódromo
export async function subirFotosRocodromo(files, onProgreso) {
    const fotos = [];
    for (let i = 0; i < files.length; i++) {
        onProgreso?.(`Subiendo foto ${i + 1} de ${files.length}…`);
        const resultado = await procesarImagenParaSubir(files[i], onProgreso);
        if (resultado.error) throw new Error(resultado.error);
        const imagenUrl = await subirACloudinary(resultado.blob, onProgreso);
        fotos.push({ id: `f${Date.now()}_${i}`, imagenUrl, nombre: '' });
    }
    return fotos;
}

export function archivoDemasiadoGrande(files) {
    const grande = files.find(f => f.size / (1024 * 1024) > MAX_MB);
    return grande ? `La imagen ${grande.name} pesa ${formatearMB(grande.size)} y supera el límite de ${MAX_MB} MB.` : '';
}

// rocodromoEditar: datos existentes (modo edición), o null (modo creación)
export default function RocodromoModal({ onClose, onCreado, onEditado, rocodromoEditar }) {
    const { usuario, setModalAuth } = useAuth();
    const [nombre, setNombre] = useState(rocodromoEditar?.nombre || '');
    const [descripcion, setDescripcion] = useState(rocodromoEditar?.descripcion || '');
    const [lat, setLat] = useState(rocodromoEditar?.lat ?? '');
    const [lng, setLng] = useState(rocodromoEditar?.lng ?? '');
    const [archivos, setArchivos] = useState([]);
    const [guardando, setGuardando] = useState(false);
    const [progreso, setProgreso] = useState('');
    const [error, setError] = useState('');

    const elegirArchivos = (e) => {
        const files = [...e.target.files];
        const aviso = archivoDemasiadoGrande(files);
        setError(aviso);
        if (!aviso) setArchivos(files);
    };

    const guardar = async () => {
        if (!nombre.trim()) { setError('El nombre del rocódromo es obligatorio.'); return; }
        if (!usuario) { setModalAuth(true); return; }
        setGuardando(true);
        setError('');
        try {
            const datos = {
                nombre: nombre.trim(),
                descripcion: descripcion.trim(),
                lat: lat !== '' ? parseFloat(lat) : null,
                lng: lng !== '' ? parseFloat(lng) : null,
            };
            if (rocodromoEditar) {
                await updateDoc(doc(db, 'rocodromos', rocodromoEditar.id), datos);
                onEditado?.({ ...rocodromoEditar, ...datos });
            } else {
                const fotos = await subirFotosRocodromo(archivos, setProgreso);
                const nuevo = { ...datos, fotos, creadoPor: usuario.uid, miembros: [usuario.uid] };
                const ref = await addDoc(collection(db, 'rocodromos'), { ...nuevo, createdAt: serverTimestamp() });
                onCreado?.({ id: ref.id, ...nuevo });
            }
            onClose();
        } catch (e) {
            setError('Error al guardar: ' + e.message);
            setGuardando(false);
        }
        setProgreso('');
    };

    return (
        <div style={st.overlay}>
            <div style={st.modal}>
                <div style={st.header}>
                    <span style={{ color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Dumbbell size={20} /> {rocodromoEditar ? 'Editar rocódromo' : 'Nuevo rocódromo'}
                    </span>
                    <button onClick={onClose} style={st.btnClose}><X size={20} /></button>
                </div>
                <div style={st.body}>
                    {error && <p style={st.error}>{error}</p>}
                    <label style={st.label}>Nombre *</label>
                    <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Sputnik" style={st.input} autoFocus />
                    <label style={st.label}>Descripción</label>
                    <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2} style={{ ...st.input, resize: 'vertical' }} />
                    {!rocodromoEditar && (
                        <>
                            <label style={st.label}>Fotos de las paredes</label>
                            <label style={st.btnFotos}>
                                <Camera size={18} /> {archivos.length ? `${archivos.length} foto(s) seleccionada(s)` : 'Seleccionar fotos'}
                                <input type="file" accept="image/*" multiple onChange={elegirArchivos} style={{ display: 'none' }} />
                            </label>
                        </>
                    )}
                    <label style={st.label}>Ubicación</label>
                    <LocationPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
                    {progreso && <p style={st.progreso}>{progreso}</p>}
                    <button onClick={guardar} disabled={guardando} style={st.btnGuardar}>
                        {guardando ? 'Guardando…' : rocodromoEditar ? 'Guardar cambios' : 'Crear rocódromo'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const st = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 },
    modal: { background: 'white', width: '100%', maxWidth: 560, borderRadius: 16, overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' },
    header: { background: '#2c3e50', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
    btnClose: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' },
    body: { padding: 20, overflowY: 'auto', flex: 1 },
    label: { display: 'block', fontWeight: 'bold', color: '#34495e', margin: '12px 0 6px', fontSize: '0.87rem' },
    input: { width: '100%', padding: '10px 14px', border: '2px solid #ddd', borderRadius: 8, fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit', color: '#2c3e50' },
    btnFotos: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, border: '2px dashed #bdc3c7', borderRadius: 10, cursor: 'pointer', color: '#7f8c8d', background: '#f8f9fa' },
    error: { background: '#fdecea', color: '#c0392b', padding: '10px 14px', borderRadius: 8, fontSize: '0.9rem' },
    progreso: { background: '#eaf4fb', color: '#2980b9', padding: '8px 12px', borderRadius: 8, marginTop: 10, fontSize: '0.88rem' },
    btnGuardar: { width: '100%', padding: 13, background: '#27ae60', color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginTop: 16 },
};
