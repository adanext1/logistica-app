// api/routes/admin.js
const express = require('express');
const router = express.Router();
const { supabase } = require('../config');
const { protegerRutaAdmin } = require('../middlewares/auth');
const { parsearCoordenadas, subirImagenBase64, subirMultiplesImagenes } = require('../utils/helpers');

// =============================================================================
// NEGOCIOS ADMIN
// =============================================================================

// Crear negocio
router.post('/negocios', protegerRutaAdmin, async (req, res) => {
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
router.put('/negocios/:slug', protegerRutaAdmin, async (req, res) => {
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
router.delete('/negocios/:slug', protegerRutaAdmin, async (req, res) => {
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

// =============================================================================
// CONFIGURACIÓN GLOBAL
// =============================================================================

// Guardar configuración global
router.put('/configuracion', protegerRutaAdmin, async (req, res) => {
    try {
        const { costo_envio_base, distancia_base, costo_incremento } = req.body;

        const { data, error } = await supabase
            .from('negocios')
            .update({
                costo_envio_base: (costo_envio_base !== undefined && costo_envio_base !== '') ? parseFloat(costo_envio_base) : 35,
                distancia_base: (distancia_base !== undefined && distancia_base !== '') ? parseFloat(distancia_base) : 2,
                costo_incremento: (costo_incremento !== undefined && costo_incremento !== '') ? parseFloat(costo_incremento) : 10
            })
            .eq('slug', 'plataforma-rcr')
            .select('costo_envio_base, distancia_base, costo_incremento')
            .single();

        if (error) throw error;
        res.json({ mensaje: 'Configuración guardada correctamente', configuracion: data });
    } catch (err) {
        console.error("Error al guardar la configuración global:", err);
        res.status(500).json({ error: 'Error al guardar la configuración' });
    }
});

// =============================================================================
// PEDIDOS ADMIN
// =============================================================================

// Listar pedidos
router.get('/pedidos', protegerRutaAdmin, async (req, res) => {
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
router.patch('/pedidos/:id/estado', protegerRutaAdmin, async (req, res) => {
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
// CLIENTES ADMIN
// =============================================================================

// Listar clientes
router.get('/clientes', protegerRutaAdmin, async (req, res) => {
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

// Crear cliente
router.post('/clientes', protegerRutaAdmin, async (req, res) => {
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

// Historial de pedidos por cliente
router.get('/clientes/:telefono/pedidos', protegerRutaAdmin, async (req, res) => {
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

// Actualizar cliente
router.put('/clientes/:id', protegerRutaAdmin, async (req, res) => {
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

// Eliminar cliente
router.delete('/clientes/:id', protegerRutaAdmin, async (req, res) => {
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
// REPARTIDORES ADMIN
// =============================================================================

// Listar repartidores
router.get('/repartidores', protegerRutaAdmin, async (req, res) => {
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

// Crear repartidor
router.post('/repartidores', protegerRutaAdmin, async (req, res) => {
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

// Actualizar repartidor
router.put('/repartidores/:id', protegerRutaAdmin, async (req, res) => {
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

// Eliminar repartidor
router.delete('/repartidores/:id', protegerRutaAdmin, async (req, res) => {
    try {
        const { error } = await supabase.from('repartidores').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ mensaje: 'Repartidor eliminado correctamente' });
    } catch (err) {
        console.error("Error al eliminar repartidor:", err);
        res.status(500).json({ error: 'Error interno al eliminar repartidor' });
    }
});

module.exports = router;
