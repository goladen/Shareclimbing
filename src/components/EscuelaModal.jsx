import React, { useState, useEffect } from 'react';
import { X, Mountain, Camera } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, doc, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import LocationPicker from './LocationPicker';
import { ItinerarioEditor } from './ItinerarioMapa';
import { normalizarNombre } from '../utils/escuelas';
import SelectorRegion from './SelectorRegion';
import { EditorReferencias, limpiarReferencias } from './Referencias';
import { procesarImagenParaSubir, subirACloudinary, formatearMB, MAX_MB } from '../utils/imagen';

// escuelaEditar: objeto con datos existentes (modo edición), o null (modo creación)
export default function EscuelaModal({ onClose, onCreada, onEditada, escuelaEditar }) {
    const modoEdicion = Boolean(escuelaEditar);
    const { usuario, pedirAuth } = useAuth();
    const [nombre, setNombre] = useState(escuelaEditar?.nombre || '');
    const [descripcion, setDescripcion] = useState(escuelaEditar?.descripcion || '');
    const [acceso, setAcceso] = useState(escuelaEditar?.acceso || '');
    const [restricciones, setRestricciones] = useState(escuelaEditar?.restricciones || '');
    const [referencias, setReferencias] = useState(escuelaEditar?.referencias || []);
    const [region, setRegion] = useState({ pais: escuelaEditar?.pais || '', comunidad: escuelaEditar?.comunidad || '' });
    const [lat, setLat] = useState(escuelaEditar?.lat ?? '');
    const [lng, setLng] = useState(escuelaEditar?.lng ?? '');
    const [mapsUrl, setMapsUrl] = useState(escuelaEditar?.mapsUrl || '');
    const [itinerario, setItinerario] = useState(escuelaEditar?.itinerario || []);
    const [imagenFile, setImagenFile] = useState(null);
    const [imagenPreview, setImagenPreview] = useState(escuelaEditar?.imagenUrl || null);
    // URL de la imagen cuando no se sube un archivo (pegada o elegida entre las de los sectores)
    const [imagenUrlElegida, setImagenUrlElegida] = useState(escuelaEditar?.imagenUrl || '');
    const [croquisVisibles, setCroquisVisibles] = useState([]);
    const [guardando, setGuardando] = useState(false);
    const [progreso, setProgreso] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        getDocs(collection(db, 'croquis_escalada'))
            .then(snap => setCroquisVisibles(snap.docs.map(d => d.data())
                .filter(c => !c.visibilidad || c.visibilidad === 'publico' || c.creadoPor === usuario?.uid)))
            .catch(e => console.error(e));
    }, []); // eslint-disable-line

    // Fotos de los sectores de esta escuela, sin repetir
    const fotosSectores = [...new Map(croquisVisibles
        .filter(c => normalizarNombre(nombre) && normalizarNombre(c.infoCroquis?.escuela) === normalizarNombre(nombre))
        .flatMap(c => (c.fotos?.length > 0 ? c.fotos : [{ imagenUrl: c.imagenUrl }])
            .filter(f => f.imagenUrl)
            .map(f => [f.imagenUrl, { url: f.imagenUrl, sector: c.infoCroquis?.sector || 'Sin sector' }]))
    ).values()];

    const usarUrl = (url) => {
        setImagenUrlElegida(url);
        setImagenFile(null);
        setImagenPreview(url.trim() || null);
        setError('');
    };

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
        setImagenUrlElegida('');
        const reader = new FileReader();
        reader.onload = ev => setImagenPreview(ev.target.result);
        reader.readAsDataURL(file);
    };

    const guardar = async () => {
        if (!nombre.trim()) { setError('El nombre de la escuela es obligatorio.'); return; }
        // Obligatorio al crear; las escuelas anteriores se pueden completar más adelante
        if (!modoEdicion && (!region.pais.trim() || !region.comunidad.trim())) { setError('Elige el país y la comunidad o región.'); return; }
        if (imagenUrlElegida.trim() && !/^(https?:|data:image\/)/i.test(imagenUrlElegida.trim())) { setError('La URL de la imagen debe empezar por http:// o https://.'); return; }
        if (!usuario) { pedirAuth(() => guardar()); return; }

        setGuardando(true);
        setError('');
        try {
            let imagenUrl = imagenUrlElegida.trim() || null;
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
                referencias: limpiarReferencias(referencias),
                pais: region.pais.trim(),
                comunidad: region.comunidad.trim(),
                lat: lat !== '' ? parseFloat(lat) : null,
                lng: lng !== '' ? parseFloat(lng) : null,
                mapsUrl: mapsUrl.trim(),
                itinerario,
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

                    <SelectorRegion pais={region.pais} comunidad={region.comunidad} onChange={setRegion} obligatorio={!modoEdicion}
                        inputStyle={st.input} labelStyle={{ display: 'block', fontWeight: 'bold', color: '#34495e', marginBottom: 6, fontSize: '0.87rem' }} />

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
                        <input value={imagenUrlElegida} onChange={e => usarUrl(e.target.value)}
                            placeholder="…o pega la URL de una imagen" style={{ ...st.input, marginTop: 8 }} />
                        {fotosSectores.length > 0 && (
                            <>
                                <div style={{ fontSize: '0.8rem', color: '#7f8c8d', margin: '10px 0 6px' }}>…o elige una foto de sus sectores:</div>
                                <div style={st.galeria}>
                                    {fotosSectores.map(f => (
                                        <button key={f.url} type="button" onClick={() => usarUrl(f.url)} title={f.sector}
                                            style={{ ...st.miniatura, borderColor: imagenUrlElegida === f.url ? '#27ae60' : 'transparent' }}>
                                            <img src={f.url} alt={f.sector} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </Field>

                    <Field label="Acceso">
                        <textarea value={acceso} onChange={e => setAcceso(e.target.value)}
                            placeholder="Cómo llegar…" rows={2}
                            style={{ ...st.input, resize: 'vertical' }} />
                    </Field>

                    <Field label="Bibliografía y enlaces de interés">
                        <EditorReferencias referencias={referencias} onChange={setReferencias} inputStyle={st.input} />
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

                    <Field label="Itinerario hasta la escuela">
                        <ItinerarioEditor puntos={itinerario} onChange={setItinerario} lat={lat} lng={lng} />
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
    galeria: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 },
    miniatura: { flexShrink: 0, width: 84, height: 64, padding: 0, border: '3px solid', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#ecf0f1' },
    error: { background: '#fdecea', color: '#c0392b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: '0.9rem' },
    btnGuardar: { width: '100%', padding: '13px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginTop: 8 },
    progreso: { background: '#eaf4fb', color: '#2980b9', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: '0.88rem' },
};
