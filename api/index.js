// api/index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js'); // 1. Importamos Supabase
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 2. Inicializamos el cliente de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../public')));

// --- RUTAS DE LA API ---

// (Aquí debería estar tu ruta previa de Google Maps /api/buscar-direccion)

// --- Módulo de Autenticación Sencillo ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'logistica123';

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ token: 'admin_token_secreto_123', message: 'Login exitoso' });
    } else {
        res.status(401).json({ error: 'Contraseña incorrecta' });
    }
});

const protegerRutaAdmin = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token === 'Bearer admin_token_secreto_123') {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    }
};

// 3. NUEVA RUTA: Registrar un Negocio (Ahora protegida)
app.post('/api/negocios', protegerRutaAdmin, async (req, res) => {
    try {
        const { nombre, whatsapp, lat, lng } = req.body;

        // Validaciones básicas
        if (!nombre || !whatsapp || !lat || !lng) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        // Generar el "Link Mágico" (Slug). Ej: "Tacos El Gordo" -> "tacos-el-gordo"
        // Convertimos a minúsculas, quitamos espacios y caracteres especiales
        let slug = nombre.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
            .replace(/[^a-z0-9]+/g, '-') // Reemplazar espacios y rarezas con guiones
            .replace(/(^-|-$)+/g, ''); // Quitar guiones al inicio o final

        // Formatear las coordenadas para PostGIS (Formato: 'POINT(longitud latitud)')
        // OJO: PostGIS usa Longitud primero, luego Latitud.
        const ubicacion_origen = `POINT(${lng} ${lat})`;

        // Insertar en Supabase
        const { data, error } = await supabase
            .from('negocios')
            .insert([
                {
                    nombre_comercial: nombre,
                    whatsapp: whatsapp,
                    slug: slug,
                    ubicacion_origen: ubicacion_origen
                }
            ])
            .select(); // Le pedimos a Supabase que nos devuelva el registro recién creado

        if (error) {
            console.error("Error en Supabase:", error);
            // Manejar caso de slug duplicado (ej. otro "Tacos El Gordo")
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Ya existe un negocio con este nombre. Intenta agregar su sucursal (Ej. Tacos El Gordo Centro)' });
            }
            throw error;
        }

        // Éxito: Devolvemos los datos y el link generado
        res.status(201).json({
            mensaje: 'Negocio registrado con éxito',
            negocio: data[0],
            link_magico: `www.domicilio.com/${slug}`
        });

    } catch (err) {
        console.error("Error del servidor:", err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 1. NUEVA RUTA API: Consulta los datos del negocio por su link
app.get('/api/negocio/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        // Buscamos en Supabase el negocio con ese slug exacto
        const { data, error } = await supabase
            .from('negocios')
            .select('nombre_comercial, whatsapp, ubicacion_origen')
            .eq('slug', slug)
            .single(); // .single() asegura que solo traiga 1 resultado o dé error si no existe

        if (error || !data) {
            return res.status(404).json({ error: 'Negocio no encontrado' });
        }

        res.json(data);
    } catch (err) {
        console.error("Error al buscar negocio:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 3. NUEVA RUTA API: Calcular costo de envío
app.post('/api/calcular-envio', async (req, res) => {
    try {
        const { slug, latDestino, lngDestino } = req.body;

        if (!slug || !latDestino || !lngDestino) {
            return res.status(400).json({ error: 'Faltan datos para calcular el envío' });
        }

        // Buscamos el negocio para obtener sus coordenadas
        const { data: negocio, error } = await supabase
            .from('negocios')
            .select('ubicacion_origen')
            .eq('slug', slug)
            .single();

        if (error || !negocio) {
            return res.status(404).json({ error: 'Negocio no encontrado' });
        }

        // Extraer lat/lng del negocio (Maneja string "POINT(lng lat)" u objeto GeoJSON)
        let latOrigen = null, lngOrigen = null;
        if (typeof negocio.ubicacion_origen === 'string') {
            const match = negocio.ubicacion_origen.match(/POINT\(([^ ]+)\s+([^ ]+)\)/i);
            if (match) {
                lngOrigen = parseFloat(match[1]);
                latOrigen = parseFloat(match[2]);
            } else if (negocio.ubicacion_origen.startsWith('0101000020E6100000') || negocio.ubicacion_origen.startsWith('0101000000')) {
                try {
                    const buf = Buffer.from(negocio.ubicacion_origen, 'hex');
                    const hasSrid = buf[4] === 0x20;
                    const offset = hasSrid ? 9 : 5;
                    
                    lngOrigen = buf.readDoubleLE(offset);
                    latOrigen = buf.readDoubleLE(offset + 8);
                    
                    if (isNaN(latOrigen) || isNaN(lngOrigen) || Math.abs(latOrigen) > 90 || Math.abs(lngOrigen) > 180) {
                        latOrigen = null;
                        lngOrigen = null;
                    }
                } catch(e) {
                    console.error("No se pudo parsear WKB Hex", e);
                }
            }
        } else if (negocio.ubicacion_origen && negocio.ubicacion_origen.coordinates) {
            lngOrigen = negocio.ubicacion_origen.coordinates[0];
            latOrigen = negocio.ubicacion_origen.coordinates[1];
        }

        if (latOrigen === null || lngOrigen === null || latOrigen === undefined || lngOrigen === undefined) {
             return res.status(500).json({ error: 'No se pudieron leer las coordenadas del negocio' });
        }

        // Fórmula Haversine para distancia en kilómetros
        const R = 6371; // Radio de la Tierra en km
        const dLat = (latDestino - latOrigen) * Math.PI / 180;
        const dLon = (lngDestino - lngOrigen) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(latOrigen * Math.PI / 180) * Math.cos(latDestino * Math.PI / 180) * 
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distanciaKm = R * c;

        // Lógica de cobro según tabulador: $35 base (hasta 2km), +$10 por km adicional
        let costoEnvio = 35;
        if (distanciaKm > 2) {
            costoEnvio += Math.ceil(distanciaKm - 2) * 10;
        }

        res.json({
            distancia_km: distanciaKm.toFixed(2),
            costo_envio: costoEnvio,
            moneda: 'MXN'
        });

    } catch (err) {
        console.error("Error al calcular envío:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 4. NUEVA RUTA API: Registrar Pedido en Base de Datos
app.post('/api/pedidos', async (req, res) => {
    try {
        const { negocio_slug, nombre_cliente, telefono, direccion_detalles, costo_envio, latDestino, lngDestino } = req.body;

        if (!negocio_slug || !nombre_cliente || !telefono || !latDestino || !lngDestino) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        const ubicacion_cliente = `POINT(${lngDestino} ${latDestino})`;

        // Insertar en Supabase (tabla 'pedidos')
        const { data, error } = await supabase
            .from('pedidos')
            .insert([
                {
                    negocio_slug,
                    nombre_cliente,
                    telefono,
                    direccion_detalles,
                    costo_envio,
                    ubicacion_cliente
                }
            ]);

        if (error) {
            console.error("Error al registrar pedido en Supabase:", error);
            return res.status(500).json({ error: 'Error al registrar pedido' });
        }

        res.status(201).json({ mensaje: 'Pedido registrado' });

    } catch (err) {
        console.error("Error del servidor (pedidos):", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 4. NUEVA RUTA API: Obtener todos los negocios para la Landing Page
app.get('/api/negocios', async (req, res) => {
    try {
        const { data: negocios, error } = await supabase
            .from('negocios')
            .select('nombre_comercial, slug, ubicacion_origen');

        if (error) throw error;

        // Limpiar datos geográficos para el frontend
        const negociosProcesados = negocios.map(n => {
            let lat = null, lng = null;
            if (n.ubicacion_origen) {
                if (typeof n.ubicacion_origen === 'string') {
                    const match = n.ubicacion_origen.match(/POINT\(([^ ]+)\s+([^ ]+)\)/i);
                    if (match) {
                        lng = parseFloat(match[1]);
                        lat = parseFloat(match[2]);
                    } else if (n.ubicacion_origen.startsWith('0101000020E6100000') || n.ubicacion_origen.startsWith('0101000000')) {
                        // Decodificar Formato Hex WKB (PostgREST lo retorna así por defecto a veces)
                        try {
                            const buf = Buffer.from(n.ubicacion_origen, 'hex');
                            // Revisar el byte 4 para ver si tiene el flag de SRID (0x20)
                            const hasSrid = buf[4] === 0x20;
                            const offset = hasSrid ? 9 : 5;
                            
                            lng = buf.readDoubleLE(offset);
                            lat = buf.readDoubleLE(offset + 8);
                            
                            // Validar que no sean números corruptos (NaN o infinitos) para no trabar el frontend
                            if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
                                console.error("Coordenadas corruptas detectadas:", {lat, lng});
                                lat = null;
                                lng = null;
                            }
                        } catch(e) {
                            console.error("No se pudo parsear WKB Hex", e);
                        }
                    }
                } else if (n.ubicacion_origen.coordinates) {
                    lng = n.ubicacion_origen.coordinates[0];
                    lat = n.ubicacion_origen.coordinates[1];
                }
            }
            return {
                nombre_comercial: n.nombre_comercial,
                slug: n.slug,
                lat, lng
            };
        });

        res.json(negociosProcesados);
    } catch (err) {
        console.error("Error al obtener lista de negocios:", err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 5. RUTA ATRAPA-TODO (Debe ir al final de tus rutas)
// Si alguien entra a localhost:3000/carniceria-talamantes, le mandamos la pantalla web
app.get('/:slug', (req, res) => {
    // Aquí no mandamos datos, solo mandamos la estructura visual (el HTML)
    res.sendFile(path.join(__dirname, '../public/pedido.html'));
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log('Servidor local en http://localhost:3000'));
}

module.exports = app;