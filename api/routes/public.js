// api/routes/public.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { supabase, ADMIN_PASSWORD, JWT_SECRET, JWT_EXPIRATION } = require('../config');
const { parsearCoordenadas, subirMultiplesImagenes } = require('../utils/helpers');

// Ping
router.get('/ping', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Login Administrador
router.post('/login', (req, res) => {
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

// Registrar un evento (visita, clic, etc)
router.post('/eventos', async (req, res) => {
    try {
        const { negocio_id, producto_id, tipo_evento, detalles } = req.body;
        
        if (!tipo_evento) {
            return res.status(400).json({ error: 'El tipo de evento es obligatorio' });
        }

        const { error } = await supabase
            .from('metricas_eventos')
            .insert([{
                negocio_id: negocio_id || null,
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
router.get('/negocio/:slug', async (req, res, next) => {
    const slug = req.params.slug;
    
    // Si el slug parece un UUID, dejamos que lo maneje la ruta de :id (que está protegida en negocios.js)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    if (isUUID) return next();

    try {
        const { data: negocio, error } = await supabase
            .from('negocios')
            .select('id, nombre_comercial, whatsapp, ubicacion_origen, logo_url, plan, splash_url, description, description_long, address_text')
            .eq('slug', slug)
            .single();

        if (error || !negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

        // Obtener los horarios del negocio
        const { data: horarios } = await supabase
            .from('horarios_negocio')
            .select('day_of_week, open_time, close_time, esta_cerrado')
            .eq('negocio_id', negocio.id)
            .order('day_of_week', { ascending: true });

        const { lat, lng } = parsearCoordenadas(negocio.ubicacion_origen);
        
        res.json({ ...negocio, lat, lng, horarios: horarios || [] });
    } catch (err) {
        console.error("Error al buscar negocio por slug:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Listar todos los negocios (público — landing page; y privado con credenciales para admin si envía token)
router.get('/negocios', async (req, res) => {
    try {
        let esAdmin = false;
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded.role === 'admin') {
                    esAdmin = true;
                }
            } catch (jwtErr) {
                // Token inválido o expirado, tratar como usuario público
            }
        }

        const { data: negocios, error } = await supabase
            .from('negocios')
            .select('id, nombre_comercial, slug, ubicacion_origen, logo_url, plan, whatsapp, usuario, pin, splash_url, description, categoria');

        if (error) throw error;

        const negociosProcesados = negocios.map(n => {
            const { lat, lng } = parsearCoordenadas(n.ubicacion_origen);
            const item = { 
                id: n.id,
                nombre_comercial: n.nombre_comercial, 
                slug: n.slug, 
                lat, 
                lng, 
                logo_url: n.logo_url, 
                plan: n.plan || 'basico',
                whatsapp: n.whatsapp,
                splash_url: n.splash_url,
                description: n.description,
                categoria: n.categoria
            };

            // Solo exponer credenciales de acceso si es el administrador logueado
            if (esAdmin) {
                item.usuario = n.usuario;
                item.pin = n.pin;
            }

            return item;
        });

        res.json(negociosProcesados);
    } catch (err) {
        console.error("Error al obtener negocios:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Listar todas las ofertas (agrupadas por negocio para Historias)
router.get('/ofertas', async (req, res) => {
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

// Listar ofertas activas de un negocio (público)
router.get('/negocio/:id/ofertas', async (req, res) => {
    try {
        const hoy = new Date().toISOString();
        const { data, error } = await supabase
            .from('ofertas')
            .select('id, titulo, descripcion, imagen_url, fecha_inicio, fecha_fin, producto_id, tipo, precio, mensaje_whatsapp')
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

// Listar próximos eventos de un negocio (público)
router.get('/negocio/:id/eventos', async (req, res) => {
    try {
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

// Listar productos de un negocio (público)
router.get('/negocio/:id/productos', async (req, res) => {
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

// Listar categorías de un negocio (público)
router.get('/negocio/:id/categorias', async (req, res) => {
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

// Obtener configuración global
router.get('/configuracion', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('negocios')
            .select('costo_envio_base, distancia_base, costo_incremento')
            .eq('slug', 'plataforma-rcr')
            .single();

        if (error || !data) throw error || new Error('No se encontró la configuración global.');
        res.json({
            costo_envio_base: data.costo_envio_base !== null ? parseFloat(data.costo_envio_base) : 35,
            distancia_base: data.distancia_base !== null ? parseFloat(data.distancia_base) : 2,
            costo_incremento: data.costo_incremento !== null ? parseFloat(data.costo_incremento) : 10
        });
    } catch (err) {
        console.error("Error al obtener la configuración global:", err);
        res.status(500).json({ error: 'Error al obtener la configuración' });
    }
});

// Calcular costo de envío
router.post('/calcular-envio', async (req, res) => {
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

        let distanciaKm;
        try {
            const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${lngOrigen},${latOrigen};${lngDestino},${latDestino}?overview=false&alternatives=true`;
            const response = await axios.get(osrmUrl, { timeout: 3000 });

            if (response.data?.code === 'Ok' && response.data.routes?.length > 0) {
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

        const { data: config } = await supabase
            .from('negocios')
            .select('costo_envio_base, distancia_base, costo_incremento')
            .eq('slug', 'plataforma-rcr')
            .single();

        const costoBase = (config && config.costo_envio_base !== null) ? parseFloat(config.costo_envio_base) : 35;
        const distBase = (config && config.distancia_base !== null) ? parseFloat(config.distancia_base) : 2;
        const costoIncr = (config && config.costo_incremento !== null) ? parseFloat(config.costo_incremento) : 10;

        let costoEnvio = costoBase;
        if (distanciaKm > distBase) {
            costoEnvio += Math.ceil(distanciaKm - distBase) * costoIncr;
        }

        res.json({ distancia_km: distanciaKm.toFixed(2), costo_envio: costoEnvio, moneda: 'MXN' });
    } catch (err) {
        console.error("Error al calcular envío:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Crear pedido (público)
router.post('/pedidos', async (req, res) => {
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

module.exports = router;
