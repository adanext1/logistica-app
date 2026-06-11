// Módulo del Carrito de Compras
import { state } from './state.js';
import { registrarEvento } from './api.js';
import { 
    cerrarConfigProducto, 
    abrirModalCarrito, 
    cerrarModalCarrito, 
    renderizarModalCarrito,
    cerrarTikTokOverlay
} from './ui.js';

export function agregarSimpleAlCarrito(id, notas = null) {
    const prod = state.productosDB.find(p => p.id === id);
    if (!prod) return;
    
    const key = prod.id + '_simple' + (notas ? '_notas_' + notas.replace(/[^a-zA-Z0-9]/g, '_') : '');
    if (state.carrito[key]) {
        state.carrito[key].qty += 1;
    } else {
        state.carrito[key] = {
            id: prod.id,
            nombre: prod.nombre,
            precio: parseFloat(prod.precio),
            tamano: null,
            sabor: null,
            notas: notas || null,
            imagen_url: prod.imagen_url,
            qty: 1
        };
    }
    registrarEvento(state.negocioIdGlobal, 'cart', { producto_id: id });
    actualizarCarrito();
}

export function agregarConfiguradoAlCarrito(prodId, config) {
    const prod = state.productosDB.find(p => p.id === prodId);
    if (!prod) return;

    // Crear un hash único para esta configuración
    const tamStr = config.tamano ? config.tamano.nombre : 'nt';
    const sabStr = (config.sabores && config.sabores.length > 0) ? config.sabores.slice().sort().join(', ') : 'ns';
    const notasStr = config.notas ? `_notas_${config.notas.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    const key = `${prod.id}_${tamStr}_${sabStr}${notasStr}`.replace(/\s+/g, '-');

    if (state.carrito[key]) {
        state.carrito[key].qty += 1;
    } else {
        state.carrito[key] = {
            id: prod.id,
            nombre: prod.nombre,
            precio: config.tamano ? parseFloat(config.tamano.precio) : parseFloat(prod.precio),
            tamano: config.tamano ? config.tamano.nombre : null,
            sabor: (config.sabores && config.sabores.length > 0) ? sabStr : null,
            notas: config.notas || null,
            imagen_url: prod.imagen_url,
            qty: 1
        };
    }
    registrarEvento(state.negocioIdGlobal, 'cart', { producto_id: prodId });
    actualizarCarrito();
    cerrarConfigProducto();
    abrirModalCarrito();
}

export function sumarCarrito(key) {
    if (state.carrito[key]) {
        state.carrito[key].qty++;
        actualizarCarrito();
    }
}

export function restarCarrito(key) {
    if (state.carrito[key]) {
        state.carrito[key].qty--;
        if (state.carrito[key].qty <= 0) delete state.carrito[key];
        actualizarCarrito();
    }
}

export function actualizarCarrito() {
    const items = Object.values(state.carrito);
    const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
    const totalPrecio = items.reduce((sum, item) => sum + (item.precio * item.qty), 0);

    document.getElementById('carritoCount').textContent = totalItems;
    document.getElementById('carritoTotal').textContent = `$${totalPrecio.toFixed(2)}`;

    const barra = document.getElementById('barraCarrito');
    if (totalItems > 0) {
        barra.classList.remove('translate-y-full');
    } else {
        barra.classList.add('translate-y-full');
        cerrarModalCarrito(); // Si se vacía desde el modal, cerrarlo
    }
    
    // Actualizar modal si está abierto
    if (!document.getElementById('modalCarrito').classList.contains('opacity-0')) {
        renderizarModalCarrito();
        document.getElementById('modalCarritoTotal').textContent = `$${totalPrecio.toFixed(2)}`;
    }
}

export function agregarOfertaAlCarrito(id) {
    const of = state.slidePromos.find(p => p.id === id);
    if (!of) return;
    
    const key = of.id + '_oferta';
    if (state.carrito[key]) {
        state.carrito[key].qty += 1;
    } else {
        state.carrito[key] = {
            id: of.id,
            nombre: of.titulo,
            precio: parseFloat(of.precio),
            tamano: null,
            sabor: null,
            imagen_url: of.imagen_url,
            qty: 1
        };
    }
    registrarEvento(state.negocioIdGlobal, 'cart', { oferta_id: id });
    actualizarCarrito();
    cerrarTikTokOverlay();
    abrirModalCarrito();
}

export function continuarPedido() {
    const items = Object.values(state.carrito);
    if (items.length === 0) return;

    let carritoParaGuardar = [];
    let total = 0;

    items.forEach(item => {
        const subtotal = item.precio * item.qty;
        total += subtotal;
        
        let nombreDisplay = item.nombre;
        if (item.tamano) nombreDisplay += ` [${item.tamano}]`;
        if (item.sabor) nombreDisplay += ` [${item.sabor}]`;
        if (item.notas) nombreDisplay += ` (Nota: ${item.notas})`;

        carritoParaGuardar.push({
            id: item.id,
            nombre: nombreDisplay,
            cantidad: item.qty,
            precio_unitario: item.precio,
            subtotal: subtotal
        });
    });

    // Guardar en localStorage aislando por negocio
    localStorage.setItem(`laas_carrito_${state.slug}`, JSON.stringify(carritoParaGuardar));
    localStorage.setItem(`laas_carrito_total_${state.slug}`, total.toFixed(2));

    // Registrar inicio de checkout
    registrarEvento(state.negocioIdGlobal, 'checkout_start', { total: total.toFixed(2) });

    // Redirigir a pedido.html
    window.location.href = `/pedido.html?n=${state.slug}`;
}
