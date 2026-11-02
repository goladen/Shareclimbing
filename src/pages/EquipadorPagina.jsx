import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { esDeEquipador, fotosDeCroquis } from '../utils/equipadores';
import { useAccesoDirecto } from '../utils/accesoDirecto';
import BotonAccesoDirecto from '../components/BotonAccesoDirecto';

export default function EquipadorPagina({ equipadorId, onVolver, onVerCroquis }) {
    const [equipador, setEquipador] = useState(null);
    const [vias, setVias] = useState([]);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'equipadores', equipadorId));
                if (snap.exists()) {
                    const eq = { id: snap.id, ...snap.data() };
                    const snapCroquis = await getDocs(collection(db, 'croquis_escalada'));
                    const encontradas = snapCroquis.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .filter(c => !c.visibilidad || c.visibilidad === 'publico')
                        .flatMap(c => fotosDeCroquis(c).flatMap(f => (f.vias || [])
                            .filter(v => esDeEquipador(v.info, eq))
                            .map(v => ({ via: v, croquis: c }))));
                    setEquipador(eq);
                    setVias(encontradas);
                }
            } catch (e) { console.error(e); }
            setCargando(false);
        })();
    }, [equipadorId]);

    useAccesoDirecto(equipador?.nombre);

    if (cargando) return <div style={st.mensaje}>Cargando…</div>;
    if (!equipador) {
        return (
            <div style={st.mensaje}>
                <p>Este equipador no existe.</p>
                <button onClick={onVolver} style={st.btnVolver}>Volver</button>
            </div>
        );
    }

    return (
        <div style={st.app}>
            <div style={st.topbar}>
                <button onClick={onVolver} style={st.btnIcono} title="Volver"><ArrowLeft size={20} /></button>
                <div>
                    <div style={{ color: 'white', fontWeight: 'bold' }}>🔩 {equipador.nombre}</div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{vias.length} {vias.length === 1 ? 'vía equipada' : 'vías equipadas'}</div>
                </div>
                <div style={{ flex: 1 }} />
                <BotonAccesoDirecto nombre={equipador.nombre} estilo={st.btnIcono} />
            </div>
            <div style={st.scroll}>
                <div style={st.lista}>
                    {vias.length === 0 && <div style={{ color: '#7f8c8d', fontStyle: 'italic', textAlign: 'center', padding: 24 }}>Aún no hay vías públicas de este equipador.</div>}
                    {vias.map(({ via, croquis }) => (
                        <button key={`${croquis.id}-${via.id}`} onClick={() => onVerCroquis(croquis)} style={st.fila}>
                            <span style={{ ...st.grado, background: via.color || '#2c3e50' }}>{via.info?.grado || '?'}</span>
                            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                <strong style={{ overflowWrap: 'anywhere' }}>{via.info?.nombre}</strong>
                                <span style={{ display: 'block', fontSize: '0.8rem', color: '#7f8c8d' }}>
                                    {[croquis.infoCroquis?.escuela, croquis.infoCroquis?.sector].filter(Boolean).join(' · ') || 'Sin ubicación'}
                                    {via.info?.anio ? ` · ${via.info.anio}` : ''}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

const st = {
    app: { display: 'flex', flexDirection: 'column', height: '100dvh', fontFamily: "'Segoe UI', Tahoma, sans-serif", background: '#f4f6f8' },
    mensaje: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontFamily: 'sans-serif', color: '#7f8c8d', padding: 20, textAlign: 'center' },
    btnVolver: { marginTop: 12, padding: '9px 16px', background: '#2c3e50', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
    topbar: { background: '#2c3e50', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
    btnIcono: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex' },
    scroll: { flex: 1, overflowY: 'auto', padding: 16 },
    lista: { maxWidth: 760, margin: '0 auto', background: 'white', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
    fila: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 8px', background: 'none', border: 'none', borderBottom: '1px solid #ecf0f1', color: '#2c3e50', cursor: 'pointer', fontSize: '0.95rem' },
    grado: { color: 'white', borderRadius: 7, padding: '5px 8px', fontWeight: 'bold', fontSize: '0.85rem', flexShrink: 0, minWidth: 38, textAlign: 'center' },
};
