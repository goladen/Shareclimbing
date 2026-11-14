import { useEffect } from 'react';

// En una zona que se desplaza con el dedo, un toque que empieza sobre un elemento arrastrable
// (marcado con data-arrastrable) no debe mover la página: el navegador cortaría el arrastre.
export function useSinDesplazarAlArrastrar(ref) {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const alTocar = (e) => { if (e.target.closest?.('[data-arrastrable]')) e.preventDefault(); };
        el.addEventListener('touchstart', alTocar, { passive: false });
        return () => el.removeEventListener('touchstart', alTocar);
    });
}
