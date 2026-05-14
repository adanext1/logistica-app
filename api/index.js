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
async function subirImagenBase64(base64Data, prefix = 'img', bucket = 'logos-comercios', folder = '') {
    if (!base64Data || !base64Data.startsWith('data:image')) return null;

    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;

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
        return null;
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

        // 4. Calcular progreso (basado en campos completados)
        const { data: negocio } = await supabase
            .from('negocios')
            .select('nombre_comercial, logo_url, description, whatsapp, address_text, ubicacion_origen')
            .eq('id', negocioId)
            .single();

        let pasos = 1; // Registro inicial
        if (negocio?.logo_url) pasos++;
        if (negocio?.description) pasos++;
        if (negocio?.whatsapp) pasos++;
        if (negocio?.address_text || negocio?.ubicacion_origen) pasos++;

        const porcentaje = (pasos / 5) * 100;

        res.json({
            nombre: negocio?.nombre_comercial || 'Socio',
            visitas: totalVisitas || 0,
            productos: totalProductos || 0,
            carritos: totalCarritos || 0,
            progreso: porcentaje,
            pasos: pasos
        });
    } catch (err) {
        console.error("Error al cargar estadísticas:", err);
        res.status(500).json({ error: 'Error al cargar estadísticas' });
    }
});

// Obtener rendimiento detallado de productos
app.get('/api/negocio/:id/product-performance', async (req, res) => {
    try {
        const { id } = req.params;
        const { range = '7', start, end } = req.query;
        
        let fechaInicio, fechaFin;

        if (start && end) {
            fechaInicio = new Date(start);
            fechaFin = new Date(end);
            fechaFin.setHours(23, 59, 59, 999);
        } else {
            fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - parseInt(range));
            fechaFin = new Date();
        }

        // 1. Obtener eventos de tipo 'cart' para este negocio en el rango
        const { data: eventos, error } = await supabase
            .from('metricas_eventos')
            .select('detalles')
            .eq('negocio_id', id)
            .eq('tipo_evento', 'cart')
            .gte('created_at', fechaInicio.toISOString())
            .lte('created_at', fechaFin.toISOString());

        if (error) throw error;

        // 2. Contar ocurrencias por producto_id
        const conteo = {};
        eventos.forEach(e => {
            const pid = e.detalles?.producto_id;
            if (pid) conteo[pid] = (conteo[pid] || 0) + 1;
        });

        // 3. Obtener nombres e imágenes de los productos involucrados
        const ids = Object.keys(conteo);
        if (ids.length === 0) return res.json([]);

        const { data: productos } = await supabase
            .from('productos')
            .select('id, nombre, imagen_url')
            .in('id', ids);

        // 4. Mapear y ordenar
        const result = productos.map(p => ({
            ...p,
            count: conteo[p.id]
        })).sort((a, b) => b.count - a.count);

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al cargar rendimiento' });
    }
});

// Obtener rendimiento de promociones (Historias)
app.get('/api/negocio/:id/promo-performance', async (req, res) => {
    try {
        const { id } = req.params;
        const { range = '7', start, end } = req.query;

        let fechaInicio, fechaFin;
        if (start && end) {
            fechaInicio = new Date(start);
            fechaFin = new Date(end);
            fechaFin.setHours(23, 59, 59, 999);
        } else {
            fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - parseInt(range));
            fechaFin = new Date();
        }

        // 1. Obtener eventos de tipo 'view_story'
        const { data: eventos, error: errEventos } = await supabase
            .from('metricas_eventos')
            .select('detalles')
            .eq('negocio_id', id)
            .eq('tipo_evento', 'view_story')
            .gte('created_at', fechaInicio.toISOString())
            .lte('created_at', fechaFin.toISOString());

        if (errEventos) throw errEventos;

        // 2. Contar vistas por promo_id
        const conteo = {};
        eventos.forEach(ev => {
            const promoId = ev.detalles?.promo_id;
            if (promoId) {
                conteo[promoId] = (conteo[promoId] || 0) + 1;
            }
        });

        // 3. Obtener detalles de las promos
        const { data: promos, error: errPromos } = await supabase
            .from('ofertas')
            .select('id, titulo, imagen_url')
            .eq('negocio_id', id);

        if (errPromos) throw errPromos;

        const result = promos.map(p => ({
            ...p,
            count: conteo[p.id] || 0
        })).sort((a, b) => b.count - a.count);

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al cargar rendimiento de promos' });
    }
});

// Obtener analíticas detalladas (por tiempo) para gráficas
app.get('/api/negocio/:id/analytics', async (req, res) => {
    try {
        const { id } = req.params;
        const { range = '7', start, end } = req.query; // Días hacia atrás
        
        let fechaInicio, fechaFin;

        if (start && end) {
            fechaInicio = new Date(start);
            fechaFin = new Date(end);
            fechaFin.setHours(23, 59, 59, 999);
        } else {
            fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - parseInt(range));
            fechaFin = new Date();
        }

        const { data: eventos, error } = await supabase
            .from('metricas_eventos')
            .select('tipo_evento, created_at')
            .eq('negocio_id', id)
            .gte('created_at', fechaInicio.toISOString())
            .lte('created_at', fechaFin.toISOString());

        if (error) throw error;

        // Procesar datos para gráficas
        const stats = {
            visitasPorDia: {},
            totalPorTipo: {
                view: 0,
                cart: 0,
                click_top: 0,
                click_negocio_grid: 0,
                view_story: 0
            }
        };

        eventos.forEach(ev => {
            // Agrupar por día (YYYY-MM-DD)
            const fecha = ev.created_at.split('T')[0];
            if (ev.tipo_evento === 'view') {
                stats.visitasPorDia[fecha] = (stats.visitasPorDia[fecha] || 0) + 1;
            }
            
            // Contar totales por tipo
            if (stats.totalPorTipo[ev.tipo_evento] !== undefined) {
                stats.totalPorTipo[ev.tipo_evento]++;
            }
        });

        res.json(stats);
    } catch (err) {
        console.error("Error al cargar analíticas:", err);
        res.status(500).json({ error: 'Error al cargar analíticas' });
    }
});

// Registrar un evento (visita, clic, etc)
app.post('/api/eventos', async (req, res) => {
    try {
        const { negocio_id, producto_id, tipo_evento, detalles } = req.body;
        
        if (!tipo_evento) {
            return res.status(400).json({ error: 'El tipo de evento es obligatorio' });
        }

        const { error } = await supabase
            .from('metricas_eventos')
            .insert([{
                negocio_id: negocio_id || null, // Si el schema lo permite null, o manejarlo según lógica
                producto_id: producto_id || null,
                tipo_evento,
                detalles: detalles || {}
            }]);

        if (error) {
            console.error("Error de Supabase al guardar evento:", error);
            // No bloqueamos al usuario si falla la métrica
            return res.status(200).json({ status: 'ignored' });
        }

        res.status(201).json({ status: 'ok' });
    } catch (err) {
        console.error("Error al registrar evento:", err);
        res.status(200).json({ status: 'ignored' }); // Respondemos OK para no romper el front
    }
});

// Obtener negocio por slug (público — para el formulario de pedido)
// Nota: Se coloca antes que :id para que los slugs no sean interpretados como IDs inválidos
app.get('/api/negocio/:slug', async (req, res, next) => {
    const slug = req.params.slug;
    
    // Si el slug parece un UUID, dejamos que lo maneje la ruta de :id
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    if (isUUID) return next();

    try {
        const { data: negocio, error } = await supabase
            .from('negocios')
            .select('id, nombre_comercial, whatsapp, ubicacion_origen, logo_url, plan, splash_url, description, description_long, address_text')
            .eq('slug', slug)
            .single();

        if (error || !negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

        // --- NUEVO: Obtener los horarios del negocio ---
        const { data: horarios } = await supabase
            .from('horarios_negocio')
            .select('day_of_week, open_time, close_time, esta_cerrado')
            .eq('negocio_id', negocio.id)
            .order('day_of_week', { ascending: true });

        const { lat, lng } = parsearCoordenadas(negocio.ubicacion_origen);
        
        // Enviamos todo junto
        res.json({ ...negocio, lat, lng, horarios: horarios || [] });
    } catch (err) {
        console.error("Error al buscar negocio por slug:", err);
        res.status(500).json({ error: 'Error interno' });
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

        // Parsear ubicación si existe
        const { lat, lng } = parsearCoordenadas(data.ubicacion_origen);
        
        // Devolvemos el objeto original pero con lat y lng inyectados para facilitar al frontend
        res.json({
            ...data,
            lat,
            lng
        });
    } catch (err) {
        console.error("Error al cargar perfil:", err);
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

        // Procesar imágenes si vienen (Organizamos en carpetas dentro de logos-comercios)
        if (logo_base64) {
            const url = await subirImagenBase64(logo_base64, `logo-${id}`, 'logos-comercios', 'logos');
            if (url) updateData.logo_url = url;
        }
        if (splash_base64) {
            const url = await subirImagenBase64(splash_base64, `splash-${id}`, 'logos-comercios', 'splash');
            if (url) updateData.splash_url = url;
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
        const { negocio_id, nombre, variaciones } = req.body;
        if (!negocio_id || !nombre) return res.status(400).json({ error: 'Datos insuficientes' });

        const slug = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const { data, error } = await supabase
            .from('categorias_productos')
            .insert([{ negocio_id, nombre, slug, variaciones: variaciones || null }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error al crear categoría' });
    }
});

// Actualizar categoría
app.put('/api/categorias/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, variaciones } = req.body;
        
        let updateData = {};
        if (nombre) {
            updateData.nombre = nombre;
            updateData.slug = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        }
        if (variaciones !== undefined) {
            updateData.variaciones = variaciones;
        }

        const { data, error } = await supabase
            .from('categorias_productos')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("Error al actualizar categoría:", err);
        res.status(500).json({ error: 'Error al actualizar categoría' });
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
        const { negocio_id, nombre, precio, unidad, categoria_id, descripcion, disponible, imagen_base64, variaciones } = req.body;

        if (!negocio_id || !nombre || !precio) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        let imagen_url = null;
        if (imagen_base64) {
            const fileName = `prod`;
            // Se sube al bucket 'productos-negocio', dentro de la carpeta con el ID del negocio
            imagen_url = await subirImagenBase64(imagen_base64, fileName, 'productos-negocio', negocio_id);
        }

        const { data, error } = await supabase
            .from('productos')
            .insert([{
                negocio_id,
                nombre,
                precio,
                precio_medida_unit: unidad,
                categoria_id,
                descripcion,
                esta_disponible: disponible !== undefined ? disponible : true,
                imagen_url,
                variaciones: variaciones || []
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

// Obtener un solo producto
app.get('/api/productos/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('productos')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) console.error("Supabase error GET /api/productos/:id:", error);
        if (error || !data) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json(data);
    } catch (err) {
        console.error("Error al cargar producto:", err);
        res.status(500).json({ error: 'Error al cargar producto' });
    }
});

// Actualizar producto
app.put('/api/productos/:id', async (req, res) => {
    try {
        const { negocio_id, nombre, precio, unidad, categoria_id, descripcion, disponible, imagen_base64, variaciones } = req.body;

        if (!nombre || !precio) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        let updateData = {
            nombre,
            precio,
            precio_medida_unit: unidad,
            categoria_id,
            descripcion,
            esta_disponible: disponible !== undefined ? disponible : true,
            variaciones: variaciones || null
        };

        if (imagen_base64) {
            const fileName = `prod`;
            const url = await subirImagenBase64(imagen_base64, fileName, 'productos-negocio', negocio_id);
            if (url) updateData.imagen_url = url;
        }

        const { data, error } = await supabase
            .from('productos')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("Error al actualizar producto:", err);
        res.status(500).json({ error: 'Error al actualizar producto' });
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

// --- OFERTAS Y EVENTOS ---

// Listar ofertas activas de un negocio
app.get('/api/negocio/:id/ofertas', async (req, res) => {
    try {
        const hoy = new Date().toISOString();
        const { data, error } = await supabase
            .from('ofertas')
            .select('id, titulo, descripcion, imagen_url, fecha_inicio, fecha_fin, producto_id')
            .eq('negocio_id', req.params.id)
            .lte('fecha_inicio', hoy)
            .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`)
            .order('fecha_inicio', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("Error al cargar ofertas:", err);
        res.status(500).json({ error: 'Error al cargar ofertas' });
    }
});

// Listar próximos eventos de un negocio
app.get('/api/negocio/:id/eventos', async (req, res) => {
    try {
        // En un caso real, podríamos filtrar por fecha_evento >= hoy. Por simplicidad, traemos todos (o los más recientes).
        const hoy = new Date().toISOString();
        const { data, error } = await supabase
            .from('eventos')
            .select('id, titulo, descripcion, imagen_url, fecha_evento')
            .eq('negocio_id', req.params.id)
            .gte('fecha_evento', hoy)
            .order('fecha_evento', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("Error al cargar eventos:", err);
        res.status(500).json({ error: 'Error al cargar eventos' });
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
        const { nombre, whatsapp, plan, lat, lng, logo_base64, usuario, pin, categoria } = req.body;

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
            .insert([{ nombre_comercial: nombre, whatsapp, slug, ubicacion_origen, logo_url, plan, usuario, pin, categoria }])
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
        const { nombre, whatsapp, plan, lat, lng, logo_base64, usuario, pin, categoria } = req.body;

        if (!nombre || !whatsapp || !lat || !lng) {
            return res.status(400).json({ error: 'Faltan datos' });
        }

        let actualizacion = {
            nombre_comercial: nombre,
            whatsapp,
            plan,
            ubicacion_origen: `POINT(${lng} ${lat})`,
            usuario,
            pin,
            categoria
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


// Listar todos los negocios (público — landing page)
app.get('/api/negocios', async (req, res) => {
    try {
        const { data: negocios, error } = await supabase
            .from('negocios')
            .select('id, nombre_comercial, slug, ubicacion_origen, logo_url, plan, whatsapp, usuario, pin, splash_url, description, categoria');

        if (error) throw error;

        const negociosProcesados = negocios.map(n => {
            const { lat, lng } = parsearCoordenadas(n.ubicacion_origen);
            return { 
                id: n.id,
                nombre_comercial: n.nombre_comercial, 
                slug: n.slug, 
                lat, 
                lng, 
                logo_url: n.logo_url, 
                plan: n.plan || 'basico',
                whatsapp: n.whatsapp,
                usuario: n.usuario,
                pin: n.pin,
                splash_url: n.splash_url,
                description: n.description,
                categoria: n.categoria
            };
        });

        res.json(negociosProcesados);
    } catch (err) {
        console.error("Error al obtener negocios:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Listar todas las ofertas (agrupadas por negocio para Historias)
app.get('/api/ofertas', async (req, res) => {
    try {
        const { data: ofertas, error } = await supabase
            .from('ofertas')
            .select(`
                *,
                negocio:negocios (
                    id,
                    nombre_comercial,
                    slug,
                    logo_url
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Agrupar por negocio para el visualizador de historias
        const agrupadas = ofertas.reduce((acc, curr) => {
            const negocioId = curr.negocio_id;
            if (!acc[negocioId]) {
                acc[negocioId] = {
                    negocio: curr.negocio,
                    promos: []
                };
            }
            acc[negocioId].promos.push(curr);
            return acc;
        }, {});

        res.json(Object.values(agrupadas));
    } catch (err) {
        console.error("Error al obtener ofertas:", err);
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
        const { negocio_slug, nombre_cliente, telefono, direccion_detalles, costo_envio, latDestino, lngDestino, fotos, whatsapp_message } = req.body;

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
                fotos: fotosUrls.length > 0 ? fotosUrls : null,
                whatsapp_message: whatsapp_message || null
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
// METRICAS Y ESTADISTICAS PARA DASHBOARD
// =============================================================================

app.get('/api/negocio/:id/stats', async (req, res) => {
    try {
        const id = req.params.id;
        
        // Consultar eventos de los últimos 30 días
        const { data: eventos, error } = await supabase
            .from('eventos')
            .select('tipo_evento')
            .eq('negocio_id', id);

        if (error) throw error;

        // Contar tipos de eventos
        const stats = {
            visitas: eventos.filter(e => e.tipo_evento === 'view').length,
            carritos: eventos.filter(e => e.tipo_evento === 'cart').length,
            checkout: eventos.filter(e => e.tipo_evento === 'checkout_start').length,
            pedidos: eventos.filter(e => e.tipo_evento === 'order_complete').length,
            productos: 0,
            progreso: 60, // Simulado por ahora
            pasos: 3
        };

        // Obtener conteo real de productos
        const { count: prodCount } = await supabase
            .from('productos')
            .select('*', { count: 'exact', head: true })
            .eq('negocio_id', id);
        
        stats.productos = prodCount || 0;

        res.json(stats);
    } catch (err) {
        console.error("Error en stats:", err);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

app.get('/api/negocio/:id/product-performance', async (req, res) => {
    try {
        const id = req.params.id;
        
        // Obtener eventos tipo 'cart' agrupados por producto_id
        const { data: eventos, error } = await supabase
            .from('eventos')
            .select('detalles')
            .eq('negocio_id', id)
            .eq('tipo_evento', 'cart');

        if (error) throw error;

        // Contar frecuencia de cada producto_id
        const counts = {};
        eventos.forEach(e => {
            const pid = e.detalles?.producto_id;
            if (pid) counts[pid] = (counts[pid] || 0) + 1;
        });

        // Obtener nombres de productos
        const { data: productos } = await supabase
            .from('productos')
            .select('id, nombre, imagen_url')
            .in('id', Object.keys(counts));

        const result = (productos || []).map(p => ({
            ...p,
            count: counts[p.id]
        })).sort((a, b) => b.count - a.count);

        res.json(result);
    } catch (err) {
        console.error("Error en performance:", err);
        res.status(500).json({ error: 'Error al obtener rendimiento' });
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