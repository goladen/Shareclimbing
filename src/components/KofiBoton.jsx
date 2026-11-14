// Botón de apoyo en Ko-fi (el mismo que en PiKT). Replica el widget oficial
// (Widget_2.js usa document.write y no funciona dentro de React), enlazando a la página.
const KOFI_ID = 'O7D429HX5Z';

export default function KofiBoton({ texto = 'Apóyame en Ko-fi', style }) {
    return (
        <a
            href={`https://ko-fi.com/${KOFI_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Apoya TopoClimbing en Ko-fi"
            style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: '#72a4f2', color: 'white', textDecoration: 'none',
                padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold',
                fontSize: '0.95rem', boxShadow: '1px 1px 0 rgba(0,0,0,0.2)',
                ...style,
            }}
        >
            <img src="https://storage.ko-fi.com/cdn/cup-border.png" alt="" style={{ height: '15px', width: 'auto' }} />
            {texto}
        </a>
    );
}
