// api/index.js — Repartidores Camino Real
// Refactorizado: Modularizado en sub-rutas limpias
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Importar enrutadores
const publicRouter = require('./routes/public');
const adminRouter = require('./routes/admin');
const negociosRouter = require('./routes/negocios');
const driversRouter = require('./routes/drivers');

// Supabase client (solo para la ruta catch-all de renderizado dinámico de tiendas)
const { supabase } = require('./config');

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../public')));

// Registrar enrutadores de la API (El orden es importante)
app.use('/api', publicRouter);
app.use('/api', adminRouter);
app.use('/api', negociosRouter);
app.use('/api/driver', driversRouter);

// =============================================================================
// RUTA ATRAPA-TODO (Debe ir al final para no interferir con las rutas de /api)
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

// Listener local para desarrollo
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log('Servidor local en http://localhost:3000'));
}

module.exports = app;