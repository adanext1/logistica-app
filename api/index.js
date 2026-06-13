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
            .select('id, nombre_comercial, description, logo_url, splash_url, plan')
            .eq('slug', slug)
            .single();

        let filePath;

        // Si se pide explícitamente la vista de pedido (?v=pedido) → servir pedido.html
        if (vistaPedido) {
            filePath = path.join(__dirname, '../public/pedido.html');
        } else if (negocio && negocio.plan === 'premium') {
            // Si es premium, buscar HTML personalizado
            const premiumPath = path.join(__dirname, `../public/p/${slug}.html`);
            if (fs.existsSync(premiumPath)) {
                filePath = premiumPath;
            } else {
                filePath = path.join(__dirname, '../public/g/tienda.html');
            }
        } else if (negocio && negocio.plan === 'generico') {
            filePath = path.join(__dirname, '../public/g/tienda.html');
        } else {
            // Básico o no encontrado → pedido.html
            filePath = path.join(__dirname, '../public/pedido.html');
        }

        if (fs.existsSync(filePath)) {
            let html = fs.readFileSync(filePath, 'utf8');
            if (negocio) {
                html = inyectarMetatags(html, negocio, slug);
            }
            return res.send(html);
        } else {
            return res.status(404).send('No encontrado');
        }
    } catch (err) {
        // Error de BD → fallback a pedido.html
        const filePath = path.join(__dirname, '../public/pedido.html');
        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }
        res.status(500).send('Error interno');
    }
});

function inyectarMetatags(html, negocio, slug) {
    if (!negocio) return html;
    
    const titulo = `Pedir en ${negocio.nombre_comercial} | Repartidores Pandas`;
    const desc = negocio.description || `Pide comida y productos a domicilio en ${negocio.nombre_comercial} a través de Repartidores Pandas por WhatsApp.`;
    const img = negocio.splash_url || negocio.logo_url || 'https://repartidorespandas.com/img/logo.png';
    const url = `https://repartidorespandas.com/${slug}`;
    const logoFavicon = negocio.logo_url || 'https://repartidorespandas.com/img/logo.svg';

    return html
        .replace(/<title>.*?<\/title>/gi, `<title>${titulo}</title>`)
        .replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/gi, `<meta name="description" content="${desc}">`)
        
        .replace(/<meta\s+property="og:url"\s+content=".*?"\s*\/?>/gi, `<meta property="og:url" content="${url}">`)
        .replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/gi, `<meta property="og:title" content="${titulo}">`)
        .replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/gi, `<meta property="og:description" content="${desc}">`)
        .replace(/<meta\s+property="og:image"\s+content=".*?"\s*\/?>/gi, `<meta property="og:image" content="${img}">`)
        
        .replace(/<meta\s+property="twitter:url"\s+content=".*?"\s*\/?>/gi, `<meta property="twitter:url" content="${url}">`)
        .replace(/<meta\s+property="twitter:title"\s+content=".*?"\s*\/?>/gi, `<meta property="twitter:title" content="${titulo}">`)
        .replace(/<meta\s+property="twitter:description"\s+content=".*?"\s*\/?>/gi, `<meta property="twitter:description" content="${desc}">`)
        .replace(/<meta\s+property="twitter:image"\s+content=".*?"\s*\/?>/gi, `<meta property="twitter:image" content="${img}">`)
        
        .replace(/<link\s+[^>]*?rel="icon"[^>]*?>|<link\s+[^>]*?rel="shortcut\s+icon"[^>]*?>/gi, `<link rel="icon" href="${logoFavicon}" type="image/png">`);
}

// Listener local para desarrollo
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log('Servidor local en http://localhost:3000'));
}

module.exports = app;