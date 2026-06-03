// api/utils/helpers.js
const { supabase } = require('../config');

/**
 * Parsea coordenadas desde los 3 formatos que Supabase/PostGIS puede devolver:
 * 1. String WKT: "POINT(lng lat)"
 * 2. WKB Hex: "0101000020E6100000..."
 * 3. GeoJSON: { coordinates: [lng, lat] }
 * @param {string|object} ubicacion - El campo de ubicación desde Supabase
 * @returns {{ lat: number|null, lng: number|null }}
 */
function parsearCoordenadas(ubicacion) {
    if (!ubicacion) return { lat: null, lng: null };

    // Formato 1: String WKT "POINT(lng lat)"
    if (typeof ubicacion === 'string') {
        const match = ubicacion.match(/POINT\(([^ ]+)\s+([^ ]+)\)/i);
        if (match) {
            return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
        }

        // Formato 2: WKB Hex (PostGIS a veces lo retorna así)
        if (ubicacion.startsWith('01010000')) {
            try {
                const buf = Buffer.from(ubicacion, 'hex');
                const hasSrid = buf[4] === 0x20;
                const offset = hasSrid ? 9 : 5;
                const lng = buf.readDoubleLE(offset);
                const lat = buf.readDoubleLE(offset + 8);

                if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                    return { lat, lng };
                }
            } catch (e) {
                console.error("Error parseando WKB Hex:", e.message);
            }
        }
    }

    // Formato 3: GeoJSON { coordinates: [lng, lat] }
    if (ubicacion && ubicacion.coordinates) {
        return { lng: ubicacion.coordinates[0], lat: ubicacion.coordinates[1] };
    }

    return { lat: null, lng: null };
}

/**
 * Sube una imagen Base64 a Supabase Storage y devuelve la URL pública.
 * @param {string} base64Data - Imagen en formato "data:image/...;base64,..."
 * @param {string} prefix - Prefijo para el nombre del archivo (ej: "pedido", "cliente")
 * @param {string} bucket - Nombre del bucket en Supabase Storage
 * @returns {Promise<string|null>} URL pública o null si falla
 */
async function subirImagenBase64(base64Data, prefix = 'img', bucket = 'logos-comercios', folder = '') {
    if (!base64Data) throw new Error('No se recibió ninguna información de archivo (Base64 vacío).');
    
    if (!(base64Data.startsWith('data:image') || base64Data.startsWith('data:video'))) {
        throw new Error('El archivo no es una imagen o video válido.');
    }

    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,([\s\S]+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error('El formato Base64 del archivo es inválido o está corrupto.');
    }

    const contentType = matches[1]; // ej: image/png
    const extension = contentType.split('/')[1] || 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');
    
    // Ruta del archivo: carpeta/nombre_archivo.extension
    const pathName = folder 
        ? `${folder}/${prefix}_${Date.now()}.${extension}`
        : `${prefix}_${Date.now()}.${extension}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(pathName, buffer, { contentType, upsert: true });

    if (uploadError) {
        console.error(`Error al subir imagen a ${bucket}/${folder}:`, uploadError);
        throw uploadError;
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(pathName);
    return urlData?.publicUrl || null;
}

/**
 * Sube múltiples imágenes Base64 y devuelve un array de URLs.
 * @param {string[]} fotosBase64 - Array de strings base64
 * @param {string} prefix - Prefijo para nombres
 * @returns {Promise<string[]>}
 */
async function subirMultiplesImagenes(fotosBase64, prefix = 'img') {
    if (!fotosBase64 || !Array.isArray(fotosBase64) || fotosBase64.length === 0) return [];

    const urls = [];
    for (const foto of fotosBase64) {
        const url = await subirImagenBase64(foto, prefix);
        if (url) urls.push(url);
    }
    return urls;
}

module.exports = {
    parsearCoordenadas,
    subirImagenBase64,
    subirMultiplesImagenes
};
