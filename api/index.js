// api/index.js — Repartidores Camino Real
// Refactorizado: Helpers DRY, JWT real, estados de pedido
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// --- Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Constantes ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'logistica123';
const JWT_SECRET = process.env.JWT_SECRET || 'rcr_secreto_super_seguro_2026';
const JWT_EXPIRATION = '24h';

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../public')));

// =============================================================================
// FUNCIONES HELPER (DRY — antes estaban repetidas 6+ veces)
// =============================================================================

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
async function subirImagenBase64(base64Data, prefix = 'img', bucket = 'fotos-pedidos') {
    if (!base64Data || !base64Data.startsWith('data:image')) return null;

    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;

    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const fileName = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, buffer, { contentType, upsert: true });

    if (uploadError) {
        console.error(`Error al subir imagen a ${bucket}:`, uploadError);
        return null;
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
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

// =============================================================================
// AUTENTICACIÓN CON JWT
// =============================================================================

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        // Generar JWT real con expiración
        const token = jwt.sign(
            { role: 'admin', iat: Math.floor(Date.now() / 1000) },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRATION }
        );
        res.json({ token, message: 'Login exitoso' });
    } else {
        res.status(401).json({ error: 'Contraseña incorrecta' });
    }
});

/**
 * Middleware de protección: Verifica JWT válido y no expirado.
 */
const protegerRutaAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.adminUser = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Sesión expirada. Vuelve a iniciar sesión.', expired: true });
        }
        return res.status(401).json({ error: 'Token inválido.' });
    }
};

// =============================================================================
// RUTAS: NEGOCIOS
// =============================================================================

// Crear negocio
app.post('/api/negocios', protegerRutaAdmin, async (req, res) => {
    try {
        const { nombre, whatsapp, lat, lng, logo_base64 } = req.body;

        if (!nombre || !whatsapp || !lat || !lng) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        let slug = nombre.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');

        const ubicacion_origen = `POINT(${lng} ${lat})`;
        const logo_url = await subirImagenBase64(logo_base64, slug, 'logos-comercios');

        const { data, error } = await supabase
            .from('negocios')
            .insert([{ nombre_comercial: nombre, whatsapp, slug, ubicacion_origen, logo_url }])
            .select();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Ya existe un negocio con este nombre.' });
            }
            throw error;
        }

        res.status(201).json({
            mensaje: 'Negocio registrado con éxito',
            negocio: data[0],
            link_magico: `/${slug}`
        });
    } catch (err) {
        console.error("Error al crear negocio:", err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Actualizar negocio
app.put('/api/negocios/:slug', protegerRutaAdmin, async (req, res) => {
    try {
        const { slug } = req.params;
        const { nombre, whatsapp, lat, lng, logo_base64 } = req.body;

        if (!nombre || !whatsapp || !lat || !lng) {
            return res.status(400).json({ error: 'Faltan datos' });
        }

        let actualizacion = {
            nombre_comercial: nombre,
            whatsapp,
            ubicacion_origen: `POINT(${lng} ${lat})`
        };

        const nuevaUrl = await subirImagenBase64(logo_base64, slug, 'logos-comercios');
        if (nuevaUrl) actualizacion.logo_url = nuevaUrl;

        const { data, error } = await supabase
            .from('negocios')
            .update(actualizacion)
            .eq('slug', slug)
            .select();

        if (error) throw error;
        res.json({ mensaje: 'Negocio actualizado', negocio: data[0] });
    } catch (err) {
        console.error("Error al actualizar negocio:", err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar negocio (con borrado en cascada manual de pedidos)
app.delete('/api/negocios/:slug', protegerRutaAdmin, async (req, res) => {
    try {
        const { slug } = req.params;

        const { error: errPedidos } = await supabase.from('pedidos').delete().eq('negocio_slug', slug);
        if (errPedidos) {
            console.error("Error al borrar pedidos asociados:", errPedidos);
            return res.status(500).json({ error: 'No se pudieron borrar los pedidos del negocio' });
        }

        const { error: errNegocio } = await supabase.from('negocios').delete().eq('slug', slug);
        if (errNegocio) throw errNegocio;

        res.json({ mensaje: 'Negocio y todos sus pedidos fueron eliminados correctamente' });
    } catch (err) {
        console.error("Error al eliminar negocio:", err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener negocio por slug (público — para el formulario de pedido)
app.get('/api/negocio/:slug', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('negocios')
            .select('nombre_comercial, whatsapp, ubicacion_origen, logo_url')
            .eq('slug', req.params.slug)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Negocio no encontrado' });
        res.json(data);
    } catch (err) {
        console.error("Error al buscar negocio:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Listar todos los negocios (público — landing page)
app.get('/api/negocios', async (req, res) => {
    try {
        const { data: negocios, error } = await supabase
            .from('negocios')
            .select('nombre_comercial, slug, ubicacion_origen');

        if (error) throw error;

        const negociosProcesados = negocios.map(n => {
            const { lat, lng } = parsearCoordenadas(n.ubicacion_origen);
            return { nombre_comercial: n.nombre_comercial, slug: n.slug, lat, lng };
        });

        res.json(negociosProcesados);
    } catch (err) {
        console.error("Error al obtener negocios:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// =============================================================================
// RUTAS: CÁLCULO DE ENVÍO
// =============================================================================

app.post('/api/calcular-envio', async (req, res) => {
    try {
        const { slug, latDestino, lngDestino } = req.body;

        if (!slug || !latDestino || !lngDestino) {
            return res.status(400).json({ error: 'Faltan datos para calcular el envío' });
        }

        const { data: negocio, error } = await supabase
            .from('negocios')
            .select('ubicacion_origen')
            .eq('slug', slug)
            .single();

        if (error || !negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

        const { lat: latOrigen, lng: lngOrigen } = parsearCoordenadas(negocio.ubicacion_origen);

        if (latOrigen === null || lngOrigen === null) {
            return res.status(500).json({ error: 'No se pudieron leer las coordenadas del negocio' });
        }

        // Calcular distancia: OSRM (real) con fallback a Haversine
        let distanciaKm;
        try {
            const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${lngOrigen},${latOrigen};${lngDestino},${latDestino}?overview=false`;
            const response = await axios.get(osrmUrl, { timeout: 3000 });

            if (response.data?.code === 'Ok' && response.data.routes?.length > 0) {
                distanciaKm = response.data.routes[0].distance / 1000;
            } else {
                throw new Error('Respuesta inválida de OSRM');
            }
        } catch (error) {
            console.warn("OSRM falló, usando Haversine:", error.message);
            const R = 6371;
            const dLat = (latDestino - latOrigen) * Math.PI / 180;
            const dLon = (lngDestino - lngOrigen) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(latOrigen * Math.PI / 180) * Math.cos(latDestino * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;
            distanciaKm = (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 1.3;
        }

        // Tabulador: $35 base (hasta 2km), +$10 por km adicional
        let costoEnvio = 35;
        if (distanciaKm > 2) costoEnvio += Math.ceil(distanciaKm - 2) * 10;

        res.json({ distancia_km: distanciaKm.toFixed(2), costo_envio: costoEnvio, moneda: 'MXN' });
    } catch (err) {
        console.error("Error al calcular envío:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// =============================================================================
// RUTAS: PEDIDOS (con estado: pendiente / entregado)
// =============================================================================

// Crear pedido (público)
app.post('/api/pedidos', async (req, res) => {
    try {
        const { negocio_slug, nombre_cliente, telefono, direccion_detalles, costo_envio, latDestino, lngDestino, fotos } = req.body;

        if (!negocio_slug || !nombre_cliente || !telefono || !latDestino || !lngDestino) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        const fotosUrls = await subirMultiplesImagenes(fotos, 'pedido');
        const ubicacion_cliente = `POINT(${lngDestino} ${latDestino})`;

        const { data, error } = await supabase
            .from('pedidos')
            .insert([{
                negocio_slug,
                nombre_cliente,
                telefono,
                direccion_detalles,
                costo_envio,
                ubicacion_cliente,
                estado: 'pendiente',
                fotos: fotosUrls.length > 0 ? fotosUrls : null
            }]);

        if (error) {
            console.error("Error al registrar pedido:", error);
            return res.status(500).json({ error: 'Error al registrar pedido' });
        }

        // Auto-registro del cliente (upsert por teléfono)
        await supabase
            .from('clientes')
            .upsert(
                { telefono, nombre: nombre_cliente, direccion_detalles, ubicacion_cliente },
                { onConflict: 'telefono' }
            );

        res.status(201).json({ mensaje: 'Pedido registrado y cliente actualizado' });
    } catch (err) {
        console.error("Error del servidor (pedidos):", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Listar pedidos (admin)
app.get('/api/pedidos', protegerRutaAdmin, async (req, res) => {
    try {
        const { data: pedidos, error } = await supabase
            .from('pedidos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const pedidosProcesados = pedidos.map(p => {
            const { lat, lng } = parsearCoordenadas(p.ubicacion_cliente);
            return { ...p, lat, lng };
        });

        res.json(pedidosProcesados);
    } catch (err) {
        console.error("Error al obtener pedidos:", err);
        res.status(500).json({ error: 'Error interno al cargar pedidos' });
    }
});

// Cambiar estado del pedido (pendiente ↔ entregado)
app.patch('/api/pedidos/:id/estado', protegerRutaAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        if (!['pendiente', 'entregado'].includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido. Usa: pendiente o entregado' });
        }

        const { data, error } = await supabase
            .from('pedidos')
            .update({ estado })
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json({ mensaje: `Pedido marcado como ${estado}`, pedido: data[0] });
    } catch (err) {
        console.error("Error al actualizar estado:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// =============================================================================
// RUTAS: CLIENTES
// =============================================================================

app.get('/api/clientes', protegerRutaAdmin, async (req, res) => {
    try {
        const { data: clientes, error } = await supabase
            .from('clientes')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const clientesProcesados = clientes.map(c => {
            const { lat, lng } = parsearCoordenadas(c.ubicacion_cliente);
            return { ...c, lat, lng };
        });

        res.json(clientesProcesados);
    } catch (err) {
        console.error("Error al obtener clientes:", err);
        res.status(500).json({ error: 'Error interno al cargar clientes' });
    }
});

app.post('/api/clientes', protegerRutaAdmin, async (req, res) => {
    try {
        const { nombre, telefono, direccion_detalles, lat, lng, fotos } = req.body;

        if (!nombre || !telefono) {
            return res.status(400).json({ error: 'El nombre y teléfono son obligatorios' });
        }

        const ubicacion_cliente = (lat && lng) ? `POINT(${lng} ${lat})` : null;
        const fotosUrls = await subirMultiplesImagenes(fotos, 'cliente');

        const { data, error } = await supabase
            .from('clientes')
            .insert([{ nombre, telefono, direccion_detalles, ubicacion_cliente, fotos: fotosUrls.length > 0 ? fotosUrls : null }])
            .select();

        if (error) {
            if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un cliente con este teléfono.' });
            throw error;
        }

        res.json({ mensaje: 'Cliente registrado', cliente: data[0] });
    } catch (err) {
        console.error("Error al registrar cliente:", err);
        res.status(500).json({ error: 'Error interno al registrar cliente' });
    }
});

app.get('/api/clientes/:telefono/pedidos', protegerRutaAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pedidos')
            .select('*')
            .eq('telefono', req.params.telefono)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const pedidosProcesados = data.map(p => {
            const { lat, lng } = parsearCoordenadas(p.ubicacion_cliente);
            return { ...p, lat, lng };
        });

        res.json(pedidosProcesados);
    } catch (err) {
        console.error("Error al cargar historial:", err);
        res.status(500).json({ error: 'Error interno al cargar el historial del cliente' });
    }
});

app.put('/api/clientes/:id', protegerRutaAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, telefono, direccion_detalles, lat, lng, fotos } = req.body;

        if (!nombre || !telefono) {
            return res.status(400).json({ error: 'El nombre y teléfono son obligatorios' });
        }

        let actualizacion = { nombre, telefono, direccion_detalles };
        if (lat && lng) actualizacion.ubicacion_cliente = `POINT(${lng} ${lat})`;

        const nuevasFotos = await subirMultiplesImagenes(fotos, 'cliente');
        if (nuevasFotos.length > 0) {
            const { data: clientePrevio } = await supabase.from('clientes').select('fotos').eq('id', id).single();
            actualizacion.fotos = [...(clientePrevio?.fotos || []), ...nuevasFotos];
        }

        const { data, error } = await supabase.from('clientes').update(actualizacion).eq('id', id).select();

        if (error) {
            if (error.code === '23505') return res.status(409).json({ error: 'Ya existe otro cliente con este teléfono.' });
            throw error;
        }

        res.json({ mensaje: 'Cliente actualizado', cliente: data[0] });
    } catch (err) {
        console.error("Error al actualizar cliente:", err);
        res.status(500).json({ error: 'Error interno al actualizar cliente' });
    }
});

app.delete('/api/clientes/:id', protegerRutaAdmin, async (req, res) => {
    try {
        const { error } = await supabase.from('clientes').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ mensaje: 'Cliente eliminado correctamente' });
    } catch (err) {
        console.error("Error al eliminar cliente:", err);
        res.status(500).json({ error: 'Error interno al eliminar cliente' });
    }
});

// =============================================================================
// RUTA ATRAPA-TODO (Debe ir al final)
// =============================================================================

app.get('/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/pedido.html'));
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log('Servidor local en http://localhost:3000'));
}

module.exports = app;