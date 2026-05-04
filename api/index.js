// api/index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js'); // 1. Importamos Supabase
const axios = require('axios'); // Para hacer peticiones HTTP (OSRM)
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
        const { nombre, whatsapp, lat, lng, logo_base64 } = req.body;

        // Validaciones básicas
        if (!nombre || !whatsapp || !lat || !lng) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        // Generar el "Link Mágico" (Slug). Ej: "Tacos El Gordo" -> "tacos-el-gordo"
        let slug = nombre.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
            .replace(/[^a-z0-9]+/g, '-') // Reemplazar espacios y rarezas con guiones
            .replace(/(^-|-$)+/g, ''); // Quitar guiones al inicio o final

        // Formatear las coordenadas para PostGIS (Formato: 'POINT(longitud latitud)')
        const ubicacion_origen = `POINT(${lng} ${lat})`;

        // Subir logo a Storage si existe
        let logo_url = null;
        if (logo_base64 && logo_base64.startsWith('data:image')) {
            const matches = logo_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                const fileName = `${slug}-${Date.now()}.jpg`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('logos-comercios')
                    .upload(fileName, buffer, { contentType, upsert: true });

                if (!uploadError && uploadData) {
                    const { data: publicUrlData } = supabase.storage.from('logos-comercios').getPublicUrl(fileName);
                    logo_url = publicUrlData.publicUrl;
                }
            }
        }

        // Insertar en Supabase
        const { data, error } = await supabase
            .from('negocios')
            .insert([
                {
                    nombre_comercial: nombre,
                    whatsapp: whatsapp,
                    slug: slug,
                    ubicacion_origen: ubicacion_origen,
                    logo_url: logo_url
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

// --- NUEVAS RUTAS: ACTUALIZAR Y ELIMINAR ---
app.put('/api/negocios/:slug', protegerRutaAdmin, async (req, res) => {
    try {
        const { slug } = req.params;
        const { nombre, whatsapp, lat, lng, logo_base64 } = req.body;

        if (!nombre || !whatsapp || !lat || !lng) {
            return res.status(400).json({ error: 'Faltan datos' });
        }

        const ubicacion_origen = `POINT(${lng} ${lat})`;
        
        let actualizacion = {
            nombre_comercial: nombre,
            whatsapp: whatsapp,
            ubicacion_origen: ubicacion_origen
        };

        // Si mandan un logo nuevo, lo subimos y actualizamos la url
        if (logo_base64 && logo_base64.startsWith('data:image')) {
            const matches = logo_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                const fileName = `${slug}-${Date.now()}.jpg`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('logos-comercios')
                    .upload(fileName, buffer, { contentType, upsert: true });

                if (!uploadError && uploadData) {
                    const { data: publicUrlData } = supabase.storage.from('logos-comercios').getPublicUrl(fileName);
                    actualizacion.logo_url = publicUrlData.publicUrl;
                }
            }
        }

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

app.delete('/api/negocios/:slug', protegerRutaAdmin, async (req, res) => {
    try {
        const { slug } = req.params;

        // 1. Borrado en cascada manual: Eliminar todos los pedidos de este negocio
        const { error: errPedidos } = await supabase
            .from('pedidos')
            .delete()
            .eq('negocio_slug', slug);

        if (errPedidos) {
            console.error("Error al borrar pedidos asociados:", errPedidos);
            return res.status(500).json({ error: 'No se pudieron borrar los pedidos del negocio' });
        }

        // 2. Eliminar el negocio
        const { error: errNegocio } = await supabase
            .from('negocios')
            .delete()
            .eq('slug', slug);

        if (errNegocio) throw errNegocio;

        res.json({ mensaje: 'Negocio y todos sus pedidos fueron eliminados correctamente' });
    } catch (err) {
        console.error("Error al eliminar negocio:", err);
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
            .select('nombre_comercial, whatsapp, ubicacion_origen, logo_url')
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

        // Calcular distancia
        let distanciaKm;
        
        try {
            // Usar OSRM (OpenStreetMap Routing Machine) para obtener la distancia real de manejo por calles
            // Esto es más preciso que la línea recta y se alinea con Google Maps / Apple Maps
            const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${lngOrigen},${latOrigen};${lngDestino},${latDestino}?overview=false`;
            
            // Usamos un timeout corto (3s) para no hacer esperar al usuario si OSRM falla
            const response = await axios.get(osrmUrl, { timeout: 3000 });
            
            if (response.data && response.data.code === 'Ok' && response.data.routes && response.data.routes.length > 0) {
                distanciaKm = response.data.routes[0].distance / 1000; // OSRM devuelve la distancia en metros
            } else {
                throw new Error('Respuesta inválida de OSRM');
            }
        } catch (error) {
            console.warn("No se pudo usar OSRM, usando Haversine de respaldo:", error.message);
            
            // Fórmula Haversine para distancia en kilómetros (línea recta) como respaldo
            const R = 6371; // Radio de la Tierra en km
            const dLat = (latDestino - latOrigen) * Math.PI / 180;
            const dLon = (lngDestino - lngOrigen) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(latOrigen * Math.PI / 180) * Math.cos(latDestino * Math.PI / 180) * 
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            
            // Agregamos un factor multiplicador de 1.3 a la línea recta para aproximar calles urbanas
            distanciaKm = (R * c) * 1.3; 
        }

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
        const { negocio_slug, nombre_cliente, telefono, direccion_detalles, costo_envio, latDestino, lngDestino, fotos } = req.body;

        if (!negocio_slug || !nombre_cliente || !telefono || !latDestino || !lngDestino) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        let fotosUrls = [];

        // Procesar y subir imágenes a Supabase Storage
        if (fotos && Array.isArray(fotos) && fotos.length > 0) {
            for (let i = 0; i < fotos.length; i++) {
                const base64Data = fotos[i];
                const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                
                if (matches && matches.length === 3) {
                    const contentType = matches[1];
                    const buffer = Buffer.from(matches[2], 'base64');
                    const fileName = `pedido_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
                    
                    const { data: uploadData, error: uploadError } = await supabase
                        .storage
                        .from('fotos-pedidos')
                        .upload(fileName, buffer, {
                            contentType: contentType,
                            upsert: false
                        });

                    if (uploadError) {
                        console.error("Error al subir foto a Storage:", uploadError);
                    } else if (uploadData) {
                        const { data: urlData } = supabase
                            .storage
                            .from('fotos-pedidos')
                            .getPublicUrl(fileName);
                            
                        if (urlData && urlData.publicUrl) {
                            fotosUrls.push(urlData.publicUrl);
                        }
                    }
                }
            }
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
                    ubicacion_cliente,
                    fotos: fotosUrls.length > 0 ? fotosUrls : null
                }
            ]);

        if (error) {
            console.error("Error al registrar pedido en Supabase:", error);
            return res.status(500).json({ error: 'Error al registrar pedido' });
        }

        // -------------------------------------------------------------
        // REGISTRO AUTOMÁTICO DEL CLIENTE EN LA TABLA 'clientes'
        // -------------------------------------------------------------
        const { error: errorCliente } = await supabase
            .from('clientes')
            .upsert(
                { 
                    telefono: telefono, 
                    nombre: nombre_cliente, 
                    direccion_detalles: direccion_detalles, 
                    ubicacion_cliente: ubicacion_cliente 
                },
                { onConflict: 'telefono' }
            );

        if (errorCliente) {
            console.error("No se pudo registrar/actualizar el cliente:", errorCliente);
        }

        res.status(201).json({ mensaje: 'Pedido registrado y cliente actualizado' });

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

// 5. NUEVA RUTA API: Obtener todos los pedidos (Radar)
app.get('/api/pedidos', protegerRutaAdmin, async (req, res) => {
    try {
        const { data: pedidos, error } = await supabase
            .from('pedidos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50); // Traemos los últimos 50 pedidos para no saturar

        if (error) throw error;

        // Limpiar coordenadas
        const pedidosProcesados = pedidos.map(p => {
            let lat = null, lng = null;
            if (p.ubicacion_cliente) {
                if (typeof p.ubicacion_cliente === 'string') {
                    const match = p.ubicacion_cliente.match(/POINT\(([^ ]+)\s+([^ ]+)\)/i);
                    if (match) {
                        lng = parseFloat(match[1]);
                        lat = parseFloat(match[2]);
                    } else if (p.ubicacion_cliente.startsWith('0101000020E6100000') || p.ubicacion_cliente.startsWith('0101000000')) {
                        try {
                            const buf = Buffer.from(p.ubicacion_cliente, 'hex');
                            const hasSrid = buf[4] === 0x20;
                            const offset = hasSrid ? 9 : 5;
                            lng = buf.readDoubleLE(offset);
                            lat = buf.readDoubleLE(offset + 8);
                            if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
                                lat = null; lng = null;
                            }
                        } catch(e) {}
                    }
                } else if (p.ubicacion_cliente.coordinates) {
                    lng = p.ubicacion_cliente.coordinates[0];
                    lat = p.ubicacion_cliente.coordinates[1];
                }
            }
            return { ...p, lat, lng };
        });

        res.json(pedidosProcesados);
    } catch (err) {
        console.error("Error al obtener pedidos:", err);
        res.status(500).json({ error: 'Error interno al cargar pedidos' });
    }
});

// --- RUTAS DE CLIENTES ---

app.get('/api/clientes', protegerRutaAdmin, async (req, res) => {
    try {
        // Ordenamos por fecha de creación (los más nuevos primero)
        const { data: clientes, error } = await supabase
            .from('clientes')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Limpiar coordenadas
        const clientesProcesados = clientes.map(c => {
            let lat = null, lng = null;
            if (c.ubicacion_cliente) {
                if (typeof c.ubicacion_cliente === 'string') {
                    const match = c.ubicacion_cliente.match(/POINT\(([^ ]+)\s+([^ ]+)\)/i);
                    if (match) {
                        lng = parseFloat(match[1]);
                        lat = parseFloat(match[2]);
                    } else if (c.ubicacion_cliente.startsWith('01010000')) {
                        try {
                            const buf = Buffer.from(c.ubicacion_cliente, 'hex');
                            const hasSrid = buf[4] === 0x20;
                            const offset = hasSrid ? 9 : 5;
                            lng = buf.readDoubleLE(offset);
                            lat = buf.readDoubleLE(offset + 8);
                        } catch(e) {}
                    }
                }
            }
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

        let ubicacion_cliente = null;
        if (lat && lng) {
            ubicacion_cliente = `POINT(${lng} ${lat})`;
        }

        let fotosUrls = [];

        // Procesar y subir imágenes a Supabase Storage
        if (fotos && Array.isArray(fotos) && fotos.length > 0) {
            for (let i = 0; i < fotos.length; i++) {
                const base64Data = fotos[i];
                const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                
                if (matches && matches.length === 3) {
                    const contentType = matches[1];
                    const buffer = Buffer.from(matches[2], 'base64');
                    const fileName = `cliente_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
                    
                    const { data: uploadData, error: uploadError } = await supabase
                        .storage
                        .from('fotos-pedidos')
                        .upload(fileName, buffer, {
                            contentType: contentType,
                            upsert: false
                        });

                    if (uploadError) {
                        console.error("Error al subir foto a Storage:", uploadError);
                    } else if (uploadData) {
                        const { data: urlData } = supabase
                            .storage
                            .from('fotos-pedidos')
                            .getPublicUrl(fileName);
                            
                        if (urlData && urlData.publicUrl) {
                            fotosUrls.push(urlData.publicUrl);
                        }
                    }
                }
            }
        }

        const { data, error } = await supabase
            .from('clientes')
            .insert([{ nombre, telefono, direccion_detalles, ubicacion_cliente, fotos: fotosUrls.length > 0 ? fotosUrls : null }])
            .select();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Ya existe un cliente con este teléfono.' });
            }
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
        const { telefono } = req.params;
        const { data, error } = await supabase
            .from('pedidos')
            .select('*')
            .eq('telefono', telefono)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Limpiar coordenadas
        const pedidosProcesados = data.map(p => {
            let lat = null, lng = null;
            if (p.ubicacion_cliente) {
                if (typeof p.ubicacion_cliente === 'string') {
                    const match = p.ubicacion_cliente.match(/POINT\(([^ ]+)\s+([^ ]+)\)/i);
                    if (match) {
                        lng = parseFloat(match[1]);
                        lat = parseFloat(match[2]);
                    } else if (p.ubicacion_cliente.startsWith('01010000')) {
                        try {
                            const buf = Buffer.from(p.ubicacion_cliente, 'hex');
                            const hasSrid = buf[4] === 0x20;
                            const offset = hasSrid ? 9 : 5;
                            lng = buf.readDoubleLE(offset);
                            lat = buf.readDoubleLE(offset + 8);
                        } catch(e) {}
                    }
                }
            }
            return { ...p, lat, lng };
        });

        res.json(pedidosProcesados);
    } catch (err) {
        console.error("Error al cargar historial de pedidos:", err);
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

        let ubicacion_cliente = null;
        if (lat && lng) {
            ubicacion_cliente = `POINT(${lng} ${lat})`;
        }

        let actualizacion = { nombre, telefono, direccion_detalles };
        if (ubicacion_cliente) {
            actualizacion.ubicacion_cliente = ubicacion_cliente;
        }

        // Subir nuevas fotos si las hay (esto no borra las anteriores en DB si quieres, o podemos reemplazarlas/concatenarlas. Como enviaremos las nuevas base64, las agregaremos a las existentes).
        let nuevasFotosUrls = [];
        if (fotos && Array.isArray(fotos) && fotos.length > 0) {
            for (let i = 0; i < fotos.length; i++) {
                const base64Data = fotos[i];
                const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                
                if (matches && matches.length === 3) {
                    const contentType = matches[1];
                    const buffer = Buffer.from(matches[2], 'base64');
                    const fileName = `cliente_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
                    
                    const { data: uploadData, error: uploadError } = await supabase
                        .storage
                        .from('fotos-pedidos')
                        .upload(fileName, buffer, { contentType, upsert: false });

                    if (!uploadError && uploadData) {
                        const { data: urlData } = supabase.storage.from('fotos-pedidos').getPublicUrl(fileName);
                        if (urlData && urlData.publicUrl) {
                            nuevasFotosUrls.push(urlData.publicUrl);
                        }
                    }
                }
            }
        }

        if (nuevasFotosUrls.length > 0) {
            // Obtenemos fotos anteriores
            const { data: clientePrevio } = await supabase.from('clientes').select('fotos').eq('id', id).single();
            const fotosExistentes = clientePrevio?.fotos || [];
            actualizacion.fotos = [...fotosExistentes, ...nuevasFotosUrls];
        }

        const { data, error } = await supabase
            .from('clientes')
            .update(actualizacion)
            .eq('id', id)
            .select();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Ya existe otro cliente con este teléfono.' });
            }
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
        const { id } = req.params;

        const { error } = await supabase
            .from('clientes')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ mensaje: 'Cliente eliminado correctamente' });
    } catch (err) {
        console.error("Error al eliminar cliente:", err);
        res.status(500).json({ error: 'Error interno al eliminar cliente' });
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