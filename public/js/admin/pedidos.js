import { state } from './state.js';
import { fetchConAuth } from './auth.js';

let filtroEstadoRadar = 'todos';
let busquedaRadar = '';

export function setupPedidosRadar() {
    const input = document.getElementById('buscadorPedidos');
    if (input) {
        input.addEventListener('input', (e) => {
            busquedaRadar = e.target.value.toLowerCase();
            aplicarFiltrosRadar();
        });
    }

    // Exponer función de filtrado al objeto window
    window.filtrarPedidosRadar = (estado, btn) => {
        filtroEstadoRadar = estado;
        
        // Actualizar UI de botones
        document.querySelectorAll('.btn-filter-radar').forEach(b => {
            b.classList.remove('bg-brand-600', 'text-white', 'shadow-md');
            b.classList.add('text-slate-500', 'hover:bg-slate-50');
        });
        
        btn.classList.remove('text-slate-500', 'hover:bg-slate-50');
        btn.classList.add('bg-brand-600', 'text-white', 'shadow-md');
        
        aplicarFiltrosRadar();
    };
}

function aplicarFiltrosRadar() {
    let pedidos = state.pedidosGlobales;
    
    // Filtro de estado
    if (filtroEstadoRadar !== 'todos') {
        pedidos = pedidos.filter(p => (p.estado || 'pendiente') === filtroEstadoRadar);
    }
    
    // Filtro de búsqueda
    if (busquedaRadar) {
        pedidos = pedidos.filter(p => 
            (p.nombre_cliente && p.nombre_cliente.toLowerCase().includes(busquedaRadar)) ||
            (p.negocio_slug && p.negocio_slug.toLowerCase().includes(busquedaRadar))
        );
    }
    
    renderizarPedidosRadar(pedidos);
}

export async function cargarPedidosRadar() {
    try {
        const response = await fetchConAuth('/api/pedidos');
        if (!response) return;

        const SLUG_PLATAFORMA = 'plataforma-rcr';
        const rawPedidos = await response.json();
        
        // Filtrar pedidos que no sean del sistema base
        const pedidos = rawPedidos.filter(p => p.negocio_slug !== SLUG_PLATAFORMA);
        
        state.pedidosGlobales = pedidos;
        aplicarFiltrosRadar(); // Usar la función de filtrado para renderizar inicialmente
    } catch (err) {
        console.error("Error al cargar pedidos del radar", err);
    }
}

export function renderizarPedidosRadar(pedidos) {
    const lista = document.getElementById('listaPedidos');

    if (!pedidos || pedidos.length === 0) {
        lista.innerHTML = `
            <div class="col-span-full p-12 text-center text-slate-500 bg-white rounded-3xl border border-slate-100 shadow-sm">
                <div class="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4"><i data-feather="package" class="w-8 h-8 text-blue-300"></i></div>
                <h4 class="font-bold text-slate-700 text-lg">Radar Despejado</h4>
                <p class="text-sm mt-1">No hay pedidos recientes. ¡Estás al día!</p>
            </div>`;
        feather.replace();
        return;
    }

    lista.innerHTML = pedidos.map((p) => {
        const fecha = new Date(p.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const estado = p.estado || 'pendiente';
        const esPendiente = estado === 'pendiente';
        const badgeClase = esPendiente 
            ? 'bg-amber-100 text-amber-700 border-amber-200' 
            : 'bg-green-100 text-green-700 border-green-200';
        const badgeTexto = esPendiente ? '⏳ Pendiente' : '✅ Entregado';
        
        return `
        <div onclick="abrirDetallePedido('${p.id}')" class="bg-white rounded-3xl shadow-sm border border-orange-100 p-5 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all group">
            <div class="flex justify-between items-start mb-3">
                <div class="bg-orange-100 text-orange-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                    <i data-feather="clock" class="w-3 h-3"></i> ${fecha}
                </div>
                <div class="${badgeClase} border px-2 py-1 rounded-lg text-xs font-bold">
                    ${badgeTexto}
                </div>
            </div>
            <h3 class="font-bold text-slate-900 text-lg line-clamp-1 mb-1">${p.nombre_cliente || 'Cliente'}</h3>
            <p class="text-sm text-slate-500 flex items-center gap-1.5 mb-3"><i data-feather="shopping-bag" class="w-3.5 h-3.5"></i> ${p.negocio_slug}</p>
            
            <div class="pt-3 border-t border-orange-100 flex justify-between items-center text-sm font-bold">
                <span class="text-slate-600">Envío:</span>
                <span class="text-green-600 bg-green-50 px-2 py-0.5 rounded-md">$${p.costo_envio} MXN</span>
            </div>
        </div>
        `;
    }).join('');

    feather.replace();
}

export function abrirDetallePedido(id) {
    const p = state.pedidosGlobales.find(x => x.id === id);
    if (!p) return;

    document.getElementById('pedidoNombreCliente').innerText = p.nombre_cliente || 'Desconocido';
    document.getElementById('pedidoTelefono').querySelector('span').innerText = p.telefono || 'Sin teléfono';
    document.getElementById('pedidoNegocio').innerText = p.negocio_slug;
    
    if (p.telefono) {
        const telPed = p.telefono.replace(/\D/g, '');
        const wsPedMsg = encodeURIComponent(`Hola ${p.nombre_cliente}, soy el repartidor. ¡Ya estoy en su domicilio con su pedido de ${p.negocio_slug}!`);
        document.getElementById('pedidoAccionesContacto').innerHTML = `
            <a href="tel:${telPed}" class="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 py-2 px-3 rounded-lg font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5">
                <i data-feather="phone-call" class="w-3.5 h-3.5"></i> Llamar
            </a>
            <a href="https://wa.me/52${telPed}?text=${wsPedMsg}" target="_blank" class="flex-1 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 py-2 px-3 rounded-lg font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5">
                <i data-feather="message-circle" class="w-3.5 h-3.5"></i> WhatsApp
            </a>
        `;
    } else {
        document.getElementById('pedidoAccionesContacto').innerHTML = '';
    }

    const fechaFormateada = new Date(p.created_at).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('pedidoFecha').querySelector('span').innerText = fechaFormateada;
    
    document.getElementById('pedidoDireccion').innerText = p.direccion_detalles || 'Sin detalles adicionales';
    document.getElementById('pedidoCosto').innerText = p.costo_envio || '0';

    // Mostrar mensaje de WhatsApp si existe
    const contMensaje = document.getElementById('pedidoContenedorMensaje');
    const txtMensaje = document.getElementById('pedidoMensajeWhatsApp');
    if (p.whatsapp_message) {
        contMensaje.classList.remove('hidden');
        txtMensaje.innerText = p.whatsapp_message;
    } else {
        contMensaje.classList.add('hidden');
        txtMensaje.innerText = '';
    }

    const contenedorFotos = document.getElementById('pedidoContenedorFotos');
    const galeria = document.getElementById('pedidoGaleria');
    if (p.fotos && p.fotos.length > 0) {
        contenedorFotos.classList.remove('hidden');
        galeria.innerHTML = p.fotos.map(url => `
            <a href="${url}" target="_blank" class="flex-shrink-0 snap-center">
                <img src="${url}" class="w-24 h-24 object-cover rounded-xl border border-slate-200 shadow-sm hover:opacity-80 transition-opacity">
            </a>
        `).join('');
    } else {
        contenedorFotos.classList.add('hidden');
        galeria.innerHTML = '';
    }

    const btnMaps = document.getElementById('btnGoogleMapsPedido');
    if (p.lat && p.lng) {
        btnMaps.href = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
        btnMaps.classList.remove('hidden');
    } else {
        btnMaps.classList.add('hidden');
    }

    const overlay = document.getElementById('modalDetallePedidoOverlay');
    const content = document.getElementById('modalDetallePedidoContent');
    overlay.classList.remove('hidden', 'pointer-events-none');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);

    const estado = p.estado || 'pendiente';
    const badge = document.getElementById('pedidoEstadoBadge');
    const btnToggle = document.getElementById('btnToggleEstado');
    
    if (estado === 'pendiente') {
        badge.className = 'px-3 py-1 rounded-lg text-xs font-bold border bg-amber-100 text-amber-700 border-amber-200';
        badge.textContent = '⏳ Pendiente';
        btnToggle.className = 'flex-1 font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95 bg-green-500 hover:bg-green-600 text-white';
        btnToggle.innerHTML = '<i data-feather="check-circle" class="w-5 h-5"></i> Marcar Entregado';
    } else {
        badge.className = 'px-3 py-1 rounded-lg text-xs font-bold border bg-green-100 text-green-700 border-green-200';
        badge.textContent = '✅ Entregado';
        btnToggle.className = 'flex-1 font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95 bg-amber-500 hover:bg-amber-600 text-white';
        btnToggle.innerHTML = '<i data-feather="rotate-ccw" class="w-5 h-5"></i> Marcar Pendiente';
    }
    btnToggle.setAttribute('onclick', `toggleEstadoPedido('${p.id}')`);

    feather.replace();
}

export function cerrarModalPedido() {
    const overlay = document.getElementById('modalDetallePedidoOverlay');
    const content = document.getElementById('modalDetallePedidoContent');
    overlay.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => overlay.classList.add('hidden', 'pointer-events-none'), 300);
}

export async function toggleEstadoPedido(id) {
    const p = state.pedidosGlobales.find(x => x.id === id);
    if (!p) return;

    const nuevoEstado = (p.estado || 'pendiente') === 'pendiente' ? 'entregado' : 'pendiente';
    
    try {
        const res = await fetchConAuth(`/api/pedidos/${id}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        
        if (!res) return;
        if (res.ok) {
            p.estado = nuevoEstado;
            aplicarFiltrosRadar();
            cerrarModalPedido();
            notificar(`Pedido marcado como ${nuevoEstado}`);
        } else {
            notificar('Error al cambiar el estado del pedido.', 'error');
        }
    } catch (err) {
        console.error('Error al cambiar estado:', err);
        notificar('Error de conexión con el servidor.', 'error');
    }
}
