// api/index.js — Repartidores Camino Real
// Refactorizado: Helpers DRY, JWT real, estados de pedido
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/api/ping', (req, res) => res.json({ status: 'ok', time: new Date() }));

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

/**
 * Middleware de protección para REPARTIDORES: Verifica JWT válido (rol driver).
 */
const protegerRutaDriver = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'driver') {
            return res.status(403).json({ error: 'Acceso denegado. Solo para repartidores.' });
        }
        req.driverUser = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Sesión expirada. Vuelve a iniciar sesión.', expired: true });
        }
        return res.status(401).json({ error: 'Token inválido.' });
    }
};

// Login Repartidor
app.post('/api/driver/login', async (req, res) => {
    try {
        const { telefono, pin } = req.body;
        
        if (!telefono || !pin) {
            return res.status(400).json({ error: 'Teléfono y PIN son requeridos.' });
        }

        const { data: repartidor, error } = await supabase
            .from('repartidores')
            .select('id, nombre, estado, pin')
            .eq('telefono', telefono)
            .single();

        if (error || !repartidor) {
            return res.status(401).json({ error: 'Número de teléfono o PIN incorrecto.' });
        }

        if (repartidor.pin !== pin) {
            return res.status(401).json({ error: 'Número de teléfono o PIN incorrecto.' });
        }

        if (repartidor.estado !== 'activo') {
            return res.status(403).json({ error: 'Tu cuenta está inactiva. Contacta al administrador.' });
        }

        const token = jwt.sign(
            { role: 'driver', id: repartidor.id, nombre: repartidor.nombre },
            JWT_SECRET,
            { expiresIn: '30d' } // Sesión larga para repartidores
        );
        
        res.json({ token, message: 'Login exitoso', repartidor: { id: repartidor.id, nombre: repartidor.nombre } });
    } catch (err) {
        console.error("Error en login driver:", err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// =============================================================================
// AUTH NEGOCIOS
// =============================================================================

app.post('/api/login-negocio', async (req, res) => {
    console.log("Petición recibida en /api/login-negocio:", req.body);
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('Usuario y PIN son requeridos');
    }

    try {
        const { data: negocio, error } = await supabase
            .from('negocios')
            .select('id, slug, nombre_comercial')
            .eq('usuario', username.toLowerCase().trim())
            .eq('pin', password.trim())
            .single();

        if (error || !negocio) {
            return res.status(401).json({ error: 'Usuario o PIN incorrectos' });
        }

        res.json({ 
            message: 'Login exitoso', 
            negocio: { 
                id: negocio.id,
                slug: negocio.slug, 
                nombre: negocio.nombre_comercial 
            } 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Obtener estadísticas reales para el dashboard
app.get('/api/negocio/:id/stats', async (req, res) => {
    try {
        const negocioId = req.params.id;

        // 1. Conteo de productos
        const { count: totalProductos } = await supabase
            .from('productos')
            .select('*', { count: 'exact', head: true })
            .eq('negocio_id', negocioId);

        // 2. Conteo de visitas (eventos tipo 'view')
        const { count: totalVisitas } = await supabase
            .from('metricas_eventos')
            .select('*', { count: 'exact', head: true })
            .eq('negocio_id', negocioId)
            .eq('tipo_evento', 'view');

        // 3. Carritos generados (eventos tipo 'cart')
        const { count: totalCarritos } = await supabase
            .from('metricas_eventos')
            .select('*', { count: 'exact', head: true })
            .eq('negocio_id', negocioId)
            .eq('tipo_evento', 'cart');

        // 4. Calcular progreso (lógica simple basada en si tiene logo y descripción)
        const { data: negocio } = await supabase
            .from('negocios')
            .select('nombre_comercial, logo_url, description')
            .eq('id', negocioId)
            .single();

        let progreso = 50;
        if (negocio?.logo_url) progreso += 25;
        if (negocio?.description) progreso += 25;

        res.json({
            nombre: negocio?.nombre_comercial || 'Socio',
            visitas: totalVisitas || 0,
            productos: totalProductos || 0,
            carritos: totalCarritos || 0,
            progreso: progreso
        });
    } catch (err) {
        console.error("Error al cargar estadísticas:", err);
        res.status(500).json({ error: 'Error al cargar estadísticas' });
    }
});

// Actualizar perfil por negocio (Partner)
app.get('/api/negocio/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('negocios')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Negocio no encontrado' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error al cargar perfil' });
    }
});

app.put('/api/negocio/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            nombre_comercial, 
            whatsapp, 
            description, 
            description_long, 
            address_text,
            lat,
            lng,
            logo_base64,
            splash_base64
        } = req.body;

        let updateData = {
            nombre_comercial,
            whatsapp,
            description,
            description_long,
            address_text
        };

        if (lat && lng) {
            updateData.ubicacion_origen = `POINT(${lng} ${lat})`;
        }

        // Procesar imágenes si vienen
        if (logo_base64) {
            updateData.logo_url = await subirImagenBase64(logo_base64, `logo-${id}`, 'logos-comercios');
        }
        if (splash_base64) {
            updateData.splash_url = await subirImagenBase64(splash_base64, `splash-${id}`, 'logos-comercios');
        }

        const { data, error } = await supabase
            .from('negocios')
            .update(updateData)
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json({ mensaje: 'Perfil actualizado con éxito', negocio: data[0] });
    } catch (err) {
        console.error("Error al actualizar perfil:", err);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

// --- CATEGORÍAS ---

// Listar categorías de un negocio
app.get('/api/negocio/:id/categorias', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('categorias_productos')
            .select('*')
            .eq('negocio_id', req.params.id)
            .order('nombre', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error al cargar categorías' });
    }
});

// Crear categoría
app.post('/api/categorias', async (req, res) => {
    try {
        const { negocio_id, nombre } = req.body;
        if (!negocio_id || !nombre) return res.status(400).json({ error: 'Datos insuficientes' });

        const slug = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const { data, error } = await supabase
            .from('categorias_productos')
            .insert([{ negocio_id, nombre, slug }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error al crear categoría' });
    }
});

// Listar productos de un negocio
app.get('/api/negocio/:id/productos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('productos')
            .select('*')
            .eq('negocio_id', req.params.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error al cargar productos' });
    }
});

// Crear producto
app.post('/api/productos', async (req, res) => {
    try {
        const { negocio_id, nombre, precio, unidad, categoria, descripcion, disponible, imagen_base64 } = req.body;

        if (!negocio_id || !nombre || !precio) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        let imagen_url = null;
        if (imagen_base64) {
            const fileName = `${negocio_id}-${Date.now()}`;
            imagen_url = await subirImagenBase64(imagen_base64, fileName, 'productos');
        }

        const { data, error } = await supabase
            .from('productos')
            .insert([{
                negocio_id,
                nombre,
                precio,
                precio_medida_unit: unidad,
                descripcion,
                esta_disponible: disponible !== undefined ? disponible : true,
                imagen_url
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        console.error("Error al crear producto:", err);
        res.status(500).json({ error: 'Error al crear producto' });
    }
});

// Eliminar producto
app.delete('/api/productos/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('productos')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ mensaje: 'Producto eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar producto' });
    }
});

// --- HORARIOS ---

app.get('/api/negocio/:id/horario', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('horarios_negocio')
            .select('*')
            .eq('negocio_id', req.params.id)
            .order('day_of_week', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error al cargar horarios' });
    }
});

app.post('/api/negocio/:id/horario', async (req, res) => {
    try {
        const { horarios } = req.body; // Array de objetos { day_of_week, open_time, close_time, esta_cerrado }
        const negocio_id = req.params.id;

        // Limpiar horarios anteriores
        await supabase.from('horarios_negocio').delete().eq('negocio_id', negocio_id);

        // Insertar nuevos
        const dataToInsert = horarios.map(h => ({ ...h, negocio_id }));
        const { error } = await supabase.from('horarios_negocio').insert(dataToInsert);

        if (error) throw error;
        res.json({ mensaje: 'Horarios actualizados' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al guardar horarios' });
    }
});

// =============================================================================
// RUTAS: NEGOCIOS
// =============================================================================

// Crear negocio
app.post('/api/negocios', protegerRutaAdmin, async (req, res) => {
    try {
        const { nombre, whatsapp, plan, lat, lng, logo_base64, usuario, pin } = req.body;

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
            .insert([{ nombre_comercial: nombre, whatsapp, slug, ubicacion_origen, logo_url, plan, usuario, pin }])
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
        const { nombre, whatsapp, plan, lat, lng, logo_base64, usuario, pin } = req.body;

        if (!nombre || !whatsapp || !lat || !lng) {
            return res.status(400).json({ error: 'Faltan datos' });
        }

        let actualizacion = {
            nombre_comercial: nombre,
            whatsapp,
            plan,
            ubicacion_origen: `POINT(${lng} ${lat})`,
            usuario,
            pin
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
            .select('nombre_comercial, whatsapp, ubicacion_origen, logo_url, plan')
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
            .select('nombre_comercial, slug, ubicacion_origen, logo_url, plan, whatsapp, usuario, pin');

        if (error) throw error;

        const negociosProcesados = negocios.map(n => {
            const { lat, lng } = parsearCoordenadas(n.ubicacion_origen);
            return { 
                nombre_comercial: n.nombre_comercial, 
                slug: n.slug, 
                lat, 
                lng, 
                logo_url: n.logo_url, 
                plan: n.plan || 'basico',
                whatsapp: n.whatsapp,
                usuario: n.usuario,
                pin: n.pin
            };
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
            // Se solicita alternatives=true para obtener varias opciones y elegir la más corta en distancia
            const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${lngOrigen},${latOrigen};${lngDestino},${latDestino}?overview=false&alternatives=true`;
            const response = await axios.get(osrmUrl, { timeout: 3000 });

            if (response.data?.code === 'Ok' && response.data.routes?.length > 0) {
                // Seleccionar la ruta con la distancia más corta (por defecto OSRM ordena por la más rápida)
                const rutaMasCorta = response.data.routes.reduce((min, route) => route.distance < min.distance ? route : min, response.data.routes[0]);
                distanciaKm = rutaMasCorta.distance / 1000;
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
// RUTAS: DRIVER (APP REPARTIDOR)
// =============================================================================

// Obtener pedidos pendientes para el radar del repartidor
app.get('/api/driver/pedidos', protegerRutaDriver, async (req, res) => {
    try {
        // En una app más avanzada, solo enviaríamos los asignados.
        // Aquí mostramos todos los 'pendientes' en el radar.
        const { data: pedidos, error } = await supabase
            .from('pedidos')
            .select('*')
            .eq('estado', 'pendiente')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const pedidosProcesados = pedidos.map(p => {
            const { lat, lng } = parsearCoordenadas(p.ubicacion_cliente);
            return { ...p, lat, lng };
        });

        res.json(pedidosProcesados);
    } catch (err) {
        console.error("Error al obtener pedidos driver:", err);
        res.status(500).json({ error: 'Error interno al cargar pedidos' });
    }
});

// Cambiar estado a entregado (por el repartidor)
app.patch('/api/driver/pedidos/:id/estado', protegerRutaDriver, async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        if (estado !== 'entregado') {
            return res.status(400).json({ error: 'Solo puedes marcar como entregado.' });
        }

        const { data, error } = await supabase
            .from('pedidos')
            .update({ estado, repartidor_id: req.driverUser.id }) // Registrar quién lo entregó
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json({ mensaje: `Pedido marcado como ${estado}`, pedido: data[0] });
    } catch (err) {
        console.error("Error al actualizar estado driver:", err);
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
// RUTAS: REPARTIDORES
// =============================================================================

app.get('/api/repartidores', protegerRutaAdmin, async (req, res) => {
    try {
        const { data: repartidores, error } = await supabase
            .from('repartidores')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(repartidores);
    } catch (err) {
        console.error("Error al obtener repartidores:", err);
        res.status(500).json({ error: 'Error interno al cargar repartidores' });
    }
});

app.post('/api/repartidores', protegerRutaAdmin, async (req, res) => {
    try {
        const { nombre, telefono, vehiculo, placas, estado, pin } = req.body;

        if (!nombre || !telefono) {
            return res.status(400).json({ error: 'El nombre y teléfono son obligatorios' });
        }

        const { data, error } = await supabase
            .from('repartidores')
            .insert([{ nombre, telefono, vehiculo, placas, estado: estado || 'activo', pin: pin || '1234' }])
            .select();

        if (error) throw error;
        res.status(201).json({ mensaje: 'Repartidor registrado', repartidor: data[0] });
    } catch (err) {
        console.error("Error al registrar repartidor:", err);
        res.status(500).json({ error: 'Error interno al registrar repartidor' });
    }
});

app.put('/api/repartidores/:id', protegerRutaAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, telefono, vehiculo, placas, estado, pin } = req.body;

        if (!nombre || !telefono) {
            return res.status(400).json({ error: 'El nombre y teléfono son obligatorios' });
        }

        const actualizacion = { nombre, telefono, vehiculo, placas, estado };
        if (pin) actualizacion.pin = pin;

        const { data, error } = await supabase
            .from('repartidores')
            .update(actualizacion)
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json({ mensaje: 'Repartidor actualizado', repartidor: data[0] });
    } catch (err) {
        console.error("Error al actualizar repartidor:", err);
        res.status(500).json({ error: 'Error interno al actualizar repartidor' });
    }
});

app.delete('/api/repartidores/:id', protegerRutaAdmin, async (req, res) => {
    try {
        const { error } = await supabase.from('repartidores').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ mensaje: 'Repartidor eliminado correctamente' });
    } catch (err) {
        console.error("Error al eliminar repartidor:", err);
        res.status(500).json({ error: 'Error interno al eliminar repartidor' });
    }
});

// =============================================================================
// RUTA ATRAPA-TODO (Debe ir al final)
// =============================================================================

app.get('/:slug', async (req, res) => {
    const slug = req.params.slug;
    const vistaPedido = req.query.v === 'pedido';

    // Ignorar archivos estáticos y rutas conocidas
    if (slug.includes('.') || slug.startsWith('api')) {
        return res.status(404).send('No encontrado');
    }

    try {
        const { data: negocio } = await supabase
            .from('negocios')
            .select('plan')
            .eq('slug', slug)
            .single();

        // Si se pide explícitamente la vista de pedido (?v=pedido) → servir pedido.html
        if (vistaPedido) {
            return res.sendFile(path.join(__dirname, '../public/pedido.html'));
        }

        // Si es premium, buscar HTML personalizado
        if (negocio && negocio.plan === 'premium') {
            const premiumPath = path.join(__dirname, `../public/p/${slug}.html`);
            if (fs.existsSync(premiumPath)) {
                return res.sendFile(premiumPath);
            }
            // Fallback a genérico si no existe el archivo premium
            return res.sendFile(path.join(__dirname, '../public/g/tienda.html'));
        }

        // Si es genérico, servir template
        if (negocio && negocio.plan === 'generico') {
            return res.sendFile(path.join(__dirname, '../public/g/tienda.html'));
        }

        // Básico o no encontrado → pedido.html
        res.sendFile(path.join(__dirname, '../public/pedido.html'));
    } catch (err) {
        // Error de BD → fallback a pedido.html
        res.sendFile(path.join(__dirname, '../public/pedido.html'));
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log('Servidor local en http://localhost:3000'));
}

module.exports = app;