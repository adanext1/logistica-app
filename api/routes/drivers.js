// api/routes/drivers.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { supabase, JWT_SECRET } = require('../config');
const { protegerRutaDriver } = require('../middlewares/auth');
const { parsearCoordenadas } = require('../utils/helpers');

// Login Repartidor
router.post('/login', async (req, res) => {
    try {
        const { telefono, pin } = req.body;
        
        if (!telefono || !pin) {
            return res.status(400).json({ error: 'Teléfono y PIN son requeridos.' });
        }

        const { data: driver, error } = await supabase
            .from('repartidores')
            .select('id, nombre, telefono, vehiculo, placas, estado')
            .eq('telefono', telefono)
            .eq('pin', pin)
            .single();

        if (error || !driver) {
            return res.status(401).json({ error: 'Credenciales inválidas o repartidor inexistente.' });
        }

        if (driver.estado !== 'activo') {
            return res.status(403).json({ error: 'El repartidor no está activo. Contacta al administrador.' });
        }

        // Generar JWT para el driver (30 días)
        const token = jwt.sign(
            { id: driver.id, role: 'driver', telefono: driver.telefono },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({ token, driver });
    } catch (err) {
        console.error("Error en login driver:", err);
        res.status(500).json({ error: 'Error del servidor en el login.' });
    }
});

// Obtener pedidos pendientes para el radar del repartidor
router.get('/pedidos', protegerRutaDriver, async (req, res) => {
    try {
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
router.patch('/pedidos/:id/estado', protegerRutaDriver, async (req, res) => {
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

module.exports = router;
