// api/middlewares/auth.js
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

/**
 * Middleware de protección: Verifica JWT válido y no expirado (rol admin).
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

/**
 * Middleware de protección para NEGOCIOS: Verifica JWT válido (rol negocio o admin).
 */
const protegerRutaNegocio = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'negocio' && decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }
        req.negocioUser = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Sesión expirada. Vuelve a iniciar sesión.', expired: true });
        }
        return res.status(401).json({ error: 'Token inválido.' });
    }
};

module.exports = {
    protegerRutaAdmin,
    protegerRutaDriver,
    protegerRutaNegocio
};
