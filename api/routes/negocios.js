// api/routes/negocios.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { supabase, JWT_SECRET } = require('../config');
const { protegerRutaNegocio } = require('../middlewares/auth');
const { parsearCoordenadas, subirImagenBase64 } = require('../utils/helpers');

// =============================================================================
// LOGIN SOCIOS
// =============================================================================

router.post('/login-negocio', async (req, res) => {
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

        const token = jwt.sign(
            { role: 'negocio', negocioId: negocio.id },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({ 
            message: 'Login exitoso', 
            token,
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

// =============================================================================
// ANALÍTICAS Y ESTADÍSTICAS
// =============================================================================

// Obtener estadísticas para el dashboard
router.get('/negocio/:id/stats', protegerRutaNegocio, async (req, res) => {
    try {
        const negocioId = req.params.id;

        if (req.negocioUser.role === 'negocio' && negocioId !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }

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
router.get('/negocio/:id/product-performance', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio' && id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }
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
router.get('/negocio/:id/promo-performance', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio' && id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }
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
router.get('/negocio/:id/analytics', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio' && id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }
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

// =============================================================================
// PERFIL Y CONFIGURACIÓN SOCIO
// =============================================================================

// Obtener perfil por negocio (Partner)
router.get('/negocio/:id', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio' && id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }

        const { data, error } = await supabase
            .from('negocios')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Negocio no encontrado' });

        const { lat, lng } = parsearCoordenadas(data.ubicacion_origen);
        
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

// Actualizar perfil por negocio (Partner)
router.put('/negocio/:id', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio' && id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }
        const { 
            nombre_comercial, 
            whatsapp, 
            description, 
            description_long, 
            address_text,
            lat,
            lng,
            logo_base64,
            splash_base64,
            metodos_pago
        } = req.body;

        let updateData = {
            nombre_comercial,
            whatsapp,
            description,
            description_long,
            address_text,
            metodos_pago
        };

        if (lat && lng) {
            updateData.ubicacion_origen = `POINT(${lng} ${lat})`;
        }

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

// =============================================================================
// HORARIOS SOCIO
// =============================================================================

// Obtener horarios para admin en panel
router.get('/negocio/:id/horario', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio' && id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }

        const { data, error } = await supabase
            .from('horarios_negocio')
            .select('*')
            .eq('negocio_id', id)
            .order('day_of_week', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error al cargar horarios' });
    }
});

// Actualizar horarios
router.post('/negocio/:id/horario', protegerRutaNegocio, async (req, res) => {
    try {
        const { horarios } = req.body; // Array de objetos { day_of_week, open_time, close_time, esta_cerrado }
        const negocio_id = req.params.id;

        if (req.negocioUser.role === 'negocio' && negocio_id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }

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
// CATEGORÍAS SOCIO
// =============================================================================

// Crear categoría
router.post('/categorias', protegerRutaNegocio, async (req, res) => {
    try {
        const { negocio_id, nombre, variaciones } = req.body;
        if (!negocio_id || !nombre) return res.status(400).json({ error: 'Datos insuficientes' });

        if (req.negocioUser.role === 'negocio' && negocio_id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado. No tienes permisos para este negocio.' });
        }

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
router.put('/categorias/:id', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio') {
            const { data: cat } = await supabase
                .from('categorias_productos')
                .select('negocio_id')
                .eq('id', id)
                .single();
            if (!cat || cat.negocio_id !== req.negocioUser.negocioId) {
                return res.status(403).json({ error: 'Acceso denegado. Esta categoría no pertenece a tu negocio.' });
            }
        }

        const { nombre, variaciones } = req.body;
        
        let updateData = {};
        if (nombre) {
            updateData.nombre = nombre;
            updateData.slug = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        }
        if (variaciones !== undefined) {
            updateData.variaciones = variaciones;
        }
        if (req.body.esta_visible !== undefined) {
            updateData.esta_visible = req.body.esta_visible;
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

// =============================================================================
// PRODUCTOS SOCIO
// =============================================================================

// Crear producto
router.post('/productos', protegerRutaNegocio, async (req, res) => {
    try {
        const { negocio_id, nombre, precio, unidad, categoria_id, descripcion, disponible, imagen_base64, variaciones } = req.body;

        if (!negocio_id || !nombre || !precio) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        if (req.negocioUser.role === 'negocio' && negocio_id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado. No tienes permisos para este negocio.' });
        }

        let imagen_url = null;
        if (imagen_base64) {
            const fileName = `prod`;
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
                categoria_variaciones_id: req.body.categoria_variaciones_id || null,
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

// Actualizar producto
router.put('/productos/:id', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;
        const { negocio_id, nombre, precio, unidad, categoria_id, descripcion, disponible, imagen_base64, variaciones } = req.body;

        if (req.negocioUser.role === 'negocio') {
            const { data: prod } = await supabase
                .from('productos')
                .select('negocio_id')
                .eq('id', id)
                .single();
            if (!prod || prod.negocio_id !== req.negocioUser.negocioId) {
                return res.status(403).json({ error: 'Acceso denegado. Este producto no pertenece a tu negocio.' });
            }
        }

        if (!nombre || !precio) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        let updateData = {
            nombre,
            precio,
            precio_medida_unit: unidad,
            categoria_id,
            categoria_variaciones_id: req.body.categoria_variaciones_id || null,
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
            .eq('id', id)
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
router.delete('/productos/:id', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio') {
            const { data: prod } = await supabase
                .from('productos')
                .select('negocio_id')
                .eq('id', id)
                .single();
            if (!prod || prod.negocio_id !== req.negocioUser.negocioId) {
                return res.status(403).json({ error: 'Acceso denegado. Este producto no pertenece a tu negocio.' });
            }
        }

        const { error } = await supabase
            .from('productos')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ mensaje: 'Producto eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar producto' });
    }
});

// =============================================================================
// OFERTAS SOCIO
// =============================================================================

// Listar TODAS las ofertas de un negocio (para el dashboard del socio)
router.get('/admin/negocio/:id/ofertas', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio' && id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }

        const { data, error } = await supabase
            .from('ofertas')
            .select('*')
            .eq('negocio_id', id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("Error al cargar ofertas admin:", err);
        res.status(500).json({ error: 'Error al cargar ofertas' });
    }
});

// Crear oferta/promo/evento
router.post('/ofertas', protegerRutaNegocio, async (req, res) => {
    try {
        const { negocio_id, titulo, descripcion, imagen_base64, fecha_inicio, fecha_fin, tipo, esta_activa, dias_ciclicos, hora_inicio, hora_fin, precio, mensaje_whatsapp } = req.body;

        if (req.negocioUser.role === 'negocio' && negocio_id !== req.negocioUser.negocioId) {
            return res.status(403).json({ error: 'Acceso denegado. No tienes permisos para este negocio.' });
        }
        
        let imagen_url = null;
        if (imagen_base64) {
            imagen_url = await subirImagenBase64(imagen_base64, `promo`, 'productos-negocio', negocio_id);
        }

        const { data, error } = await supabase
            .from('ofertas')
            .insert([{
                negocio_id,
                titulo,
                descripcion,
                imagen_url,
                fecha_inicio: fecha_inicio || null,
                fecha_fin: fecha_fin || null,
                tipo: tipo || 'promocion',
                esta_activa: esta_activa !== undefined ? esta_activa : true,
                dias_ciclicos: dias_ciclicos || [],
                hora_inicio: hora_inicio || null,
                hora_fin: hora_fin || null,
                precio: precio ? parseFloat(precio) : null,
                mensaje_whatsapp: mensaje_whatsapp || null
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        console.error("Error al crear oferta:", err);
        res.status(500).json({ error: err.message || 'Error al crear oferta' });
    }
});

// Actualizar oferta
router.put('/ofertas/:id', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio') {
            const { data: current } = await supabase.from('ofertas').select('negocio_id').eq('id', id).single();
            if (!current || current.negocio_id !== req.negocioUser.negocioId) {
                return res.status(403).json({ error: 'Acceso denegado. Esta oferta no pertenece a tu negocio.' });
            }
        }

        const { titulo, descripcion, imagen_base64, fecha_inicio, fecha_fin, tipo, esta_activa, dias_ciclicos, hora_inicio, hora_fin, precio, mensaje_whatsapp } = req.body;

        let updateData = {
            titulo,
            descripcion,
            fecha_inicio: fecha_inicio || null,
            fecha_fin: fecha_fin || null,
            tipo: tipo || 'promocion',
            esta_activa,
            dias_ciclicos: dias_ciclicos || [],
            hora_inicio: hora_inicio || null,
            hora_fin: hora_fin || null,
            precio: precio ? parseFloat(precio) : null,
            mensaje_whatsapp: mensaje_whatsapp || null
        };

        if (imagen_base64 && (imagen_base64.startsWith('data:image') || imagen_base64.startsWith('data:video'))) {
            const { data: current } = await supabase.from('ofertas').select('negocio_id').eq('id', id).single();
            const url = await subirImagenBase64(imagen_base64, `promo`, 'productos-negocio', current?.negocio_id || 'general');
            if (url) updateData.imagen_url = url;
        }

        const { data, error } = await supabase
            .from('ofertas')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("Error al actualizar oferta:", err);
        res.status(500).json({ error: err.message || 'Error al actualizar oferta' });
    }
});

// Eliminar oferta
router.delete('/ofertas/:id', protegerRutaNegocio, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.negocioUser.role === 'negocio') {
            const { data: current } = await supabase.from('ofertas').select('negocio_id').eq('id', id).single();
            if (!current || current.negocio_id !== req.negocioUser.negocioId) {
                return res.status(403).json({ error: 'Acceso denegado. Esta oferta no pertenece a tu negocio.' });
            }
        }

        const { error } = await supabase
            .from('ofertas')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ mensaje: 'Oferta eliminada' });
    } catch (err) {
        console.error("Error al eliminar oferta:", err);
        res.status(500).json({ error: 'Error al eliminar oferta' });
    }
});

module.exports = router;
