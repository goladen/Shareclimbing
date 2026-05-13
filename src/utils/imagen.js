// Límites de imagen para Firebase Storage
export const MAX_MB = 20;           // rechazar si supera esto
export const COMPRIMIR_SI_MB = 2;   // comprimir automáticamente si supera esto
export const MAX_DIMENSION = 2048;  // píxeles máximos por lado
export const CALIDAD_INICIAL = 0.85;
export const CALIDAD_MINIMA = 0.35;

export function formatearMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Verifica y comprime una imagen antes de subirla.
 * Devuelve { blob, tipo, originalMB, finalMB, comprimida, error }
 */
export async function procesarImagenParaSubir(file, onProgreso) {
    const originalMB = file.size / (1024 * 1024);

    if (originalMB > MAX_MB) {
        return {
            error: `La imagen pesa ${formatearMB(file.size)} y supera el límite de ${MAX_MB} MB. Usa una foto de menor resolución.`,
        };
    }

    // Si es pequeña, subir directamente
    if (originalMB <= COMPRIMIR_SI_MB) {
        return { blob: file, tipo: file.type, originalMB, finalMB: originalMB, comprimida: false };
    }

    // Comprimir con Canvas
    onProgreso?.(`Comprimiendo imagen (${formatearMB(file.size)})…`);

    try {
        const blob = await _comprimir(file);
        const finalMB = blob.size / (1024 * 1024);
        return { blob, tipo: 'image/jpeg', originalMB, finalMB, comprimida: true };
    } catch (e) {
        return { error: 'No se pudo comprimir la imagen: ' + e.message };
    }
}

async function _comprimir(file) {
    const targetBytes = COMPRIMIR_SI_MB * 1024 * 1024;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            // Escalar si supera dimensión máxima
            let { naturalWidth: w, naturalHeight: h } = img;
            if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
                const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            // Fondo blanco para imágenes PNG con transparencia
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);

            let quality = CALIDAD_INICIAL;

            const intentar = () => {
                canvas.toBlob(blob => {
                    if (!blob) { reject(new Error('Error al generar blob')); return; }
                    if (blob.size <= targetBytes || quality <= CALIDAD_MINIMA) {
                        resolve(blob);
                    } else {
                        quality = parseFloat((quality - 0.1).toFixed(2));
                        intentar();
                    }
                }, 'image/jpeg', quality);
            };

            intentar();
        };

        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.src = url;
    });
}
