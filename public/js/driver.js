/**
 * REPARTIDORES PANDAS - Driver App Logic
 */

const tokenDriver = localStorage.getItem('driver_token');
const infoDriver = JSON.parse(localStorage.getItem('driver_info') || '{}');

if (!tokenDriver) {
    window.location.href = '/login-driver.html';
}

// Inicializar UI
document.getElementById('driverName').innerText = infoDriver.nombre || 'Repartidor';
if (infoDriver.nombre) {
    document.getElementById('driverInitials').innerText = infoDriver.nombre.substring(0, 2).toUpperCase();
}
feather.replace();

let pedidosDriver = [];
let pedidoActualId = null;
let pollInterval = null;

// ============================================================================
// FUNCIONES NÚCLEO
// ============================================================================

function cerrarSesionDriver() {
    localStorage.removeItem('driver_token');
    localStorage.removeItem('driver_info');
    window.location.href = '/login-driver.html';
}

async function fetchDriver(url, options = {}) {
    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${tokenDriver}`,
        'Content-Type': 'application/json'
    };
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        cerrarSesionDriver();
        return null;
    }
    return res;
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.className = `fixed top-20 inset-x-4 text-white font-bold px-6 py-4 rounded-2xl shadow-2xl transform transition-all duration-300 z-[100] text-center pointer-events-none ${isError ? 'bg-red-500' : 'bg-slate-900'}`;
    
    // Animar entrada
    requestAnimationFrame(() => {
        toast.classList.remove('-translate-y-20', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('-translate-y-20', 'opacity-0');
    }, 3000);
}

// ============================================================================
// CARGA Y RENDERIZADO DEL RADAR
// ============================================================================

async function cargarRadar() {
    try {
        const res = await fetchDriver('/api/driver/pedidos');
        if (!res) return;
        
        const pedidos = await res.json();
        pedidosDriver = pedidos;
        renderizarRadar(pedidos);
    } catch (err) {
        console.error("Error al cargar radar:", err);
    }
}

function renderizarRadar(pedidos) {
    const lista = document.getElementById('listaRadar');
    document.getElementById('contadorPedidos').innerText = pedidos.length;

    if (pedidos.length === 0) {
        lista.innerHTML = `
            <div class="text-center py-16 bg-white rounded-3xl shadow-sm border border-slate-100 fade-in">
                <div class="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-feather="coffee" class="w-10 h-10 text-slate-300"></i>
                </div>
                <h3 class="text-xl font-extrabold text-slate-800">Todo tranquilo</h3>
                <p class="text-slate-500 mt-1">No hay pedidos pendientes en el radar.</p>
            </div>
        `;
        feather.replace();
        return;
    }

    lista.innerHTML = pedidos.map(p => {
        const hora = new Date(p.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        return `
        <div onclick="abrirModalPedido('${p.id}')" class="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 active:scale-95 transition-transform cursor-pointer relative overflow-hidden group fade-in">
            <!-- Barra lateral decorativa -->
            <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-500"></div>
            
            <div class="flex justify-between items-start mb-3 pl-2">
                <div>
                    <span class="text-[10px] font-black bg-brand-50 text-brand-700 px-2 py-1 rounded-md uppercase tracking-wider">${p.negocio_slug}</span>
                    <h3 class="font-black text-xl text-slate-900 mt-1.5 line-clamp-1">${p.nombre_cliente}</h3>
                </div>
                <span class="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">${hora}</span>
            </div>
            
            <div class="pl-2 flex items-center justify-between">
                <p class="text-sm text-slate-500 line-clamp-1 flex-1 pr-4 flex items-center gap-1.5">
                    <i data-feather="map-pin" class="w-3.5 h-3.5 shrink-0"></i> ${p.direccion_detalles || 'Sin detalles'}
                </p>
                <div class="bg-green-100 text-green-700 font-black text-sm px-3 py-1.5 rounded-xl border border-green-200 whitespace-nowrap">
                    $${p.costo_envio}
                </div>
            </div>
        </div>
        `;
    }).join('');
    
    feather.replace();
}

// ============================================================================
// GESTIÓN DEL MODAL DE PEDIDO
// ============================================================================

function abrirModalPedido(id) {
    const p = pedidosDriver.find(x => x.id === id);
    if (!p) return;
    pedidoActualId = id;

    // Llenar info
    document.getElementById('modalNegocio').innerText = p.negocio_slug;
    document.getElementById('modalCliente').innerText = p.nombre_cliente;
    document.getElementById('modalTelefono').innerText = p.telefono;
    document.getElementById('modalDireccion').innerText = p.direccion_detalles || 'Dirección no especificada detalladamente.';
    document.getElementById('modalCosto').innerText = `$${p.costo_envio}`;

    // Configurar botones de contacto
    const tel = p.telefono.replace(/\D/g, '');
    document.getElementById('btnLlamar').href = `tel:${tel}`;
    
    const msgWs = encodeURIComponent(`Hola ${p.nombre_cliente}, soy el repartidor de Repartidores Pandas. ¡Ya estoy en camino a tu domicilio con tu pedido de ${p.negocio_slug}!`);
    document.getElementById('btnWhatsApp').href = `https://wa.me/52${tel}?text=${msgWs}`;

    // Configurar Maps
    const btnMaps = document.getElementById('btnMaps');
    if (p.lat && p.lng) {
        btnMaps.href = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
        btnMaps.classList.remove('opacity-50', 'pointer-events-none');
    } else {
        btnMaps.removeAttribute('href');
        btnMaps.classList.add('opacity-50', 'pointer-events-none');
    }

    // Configurar botón Entregado
    const btnEntregado = document.getElementById('btnEntregado');
    btnEntregado.onclick = () => marcarEntregado(p.id);

    // Animación Modal
    const overlay = document.getElementById('modalPedidoOverlay');
    const content = document.getElementById('modalPedidoContent');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('translate-y-full');
}

function cerrarModalPedido() {
    const overlay = document.getElementById('modalPedidoOverlay');
    const content = document.getElementById('modalPedidoContent');
    content.classList.add('translate-y-full');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    pedidoActualId = null;
}

// ============================================================================
// ACCIONES: MARCAR ENTREGADO
// ============================================================================

async function marcarEntregado(id) {
    const btn = document.getElementById('btnEntregado');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<div class="animate-spin rounded-full h-6 w-6 border-b-4 border-white mx-auto"></div>';
    btn.disabled = true;

    try {
        const res = await fetchDriver(`/api/driver/pedidos/${id}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: 'entregado' })
        });

        if (res && res.ok) {
            showToast('¡Pedido entregado con éxito!');
            cerrarModalPedido();
            // Recargar radar inmediatamente
            cargarRadar();
        } else {
            const data = await res.json();
            showToast(data.error || 'Error al actualizar', true);
        }
    } catch (err) {
        showToast('Error de conexión', true);
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

// ============================================================================
// INICIO (POLLING)
// ============================================================================

// Cargar primera vez
cargarRadar();

// Polling cada 15 segundos para buscar nuevos pedidos
pollInterval = setInterval(() => {
    // Si no hay un modal abierto, recargar
    if (!pedidoActualId) {
        cargarRadar();
    }
}, 15000);
