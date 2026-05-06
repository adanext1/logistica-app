import { state } from './state.js';
import { fetchConAuth } from './auth.js';
import { renderizarNegocios } from './negocios.js';

/**
 * Obtiene la lista de todos los negocios desde la API y renderiza el mapa y la lista.
 */
export async function cargarDatosDashboard() {
    try {
        // Ejecutar promesas en paralelo para mayor velocidad
        const [resNegocios, resClientes, resPedidos] = await Promise.all([
            fetch('/api/negocios'),
            fetchConAuth('/api/clientes'),
            fetchConAuth('/api/pedidos')
        ]);

        if (!resClientes || !resPedidos) return; // Session expired, redirecting

        const negocios = await resNegocios.json();
        state.negociosGlobales = negocios;
        
        let clientes = [];
        if (resClientes.ok) {
            clientes = await resClientes.json();
            state.clientesGlobales = clientes;
        }

        let pedidos = [];
        if (resPedidos.ok) {
            pedidos = await resPedidos.json();
            state.pedidosGlobales = pedidos;
        }

        // --- 1. ACTUALIZAR MÉTRICAS ---
        document.getElementById('statNegocios').innerText = negocios.length || 0;
        document.getElementById('statClientes').innerText = clientes.length || 0;
        
        const totalIngresos = pedidos.reduce((acc, p) => acc + (parseFloat(p.costo_envio) || 0), 0);
        document.getElementById('statIngresos').innerText = `$${totalIngresos.toLocaleString('es-MX')}`;

        // --- 2. RENDERIZAR ÚLTIMOS PEDIDOS (Max 5) ---
        const contPedidos = document.getElementById('dashboardUltimosPedidos');
        const ultimosPedidos = pedidos.slice(0, 5);
        if (ultimosPedidos.length === 0) {
            contPedidos.innerHTML = '<p class="text-sm text-slate-500 text-center py-2">No hay pedidos recientes.</p>';
        } else {
            contPedidos.innerHTML = ultimosPedidos.map(p => {
                const fecha = new Date(p.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                return `
                <div class="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors cursor-pointer" onclick="cambiarVista('radar'); setTimeout(()=>abrirDetallePedido('${p.id}'), 100);">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                            <i data-feather="shopping-bag" class="w-4 h-4"></i>
                        </div>
                        <div>
                            <p class="font-bold text-slate-900 text-sm">${p.nombre_cliente}</p>
                            <p class="text-xs text-slate-500">${p.negocio_slug} • ${fecha}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-green-600 text-sm">+$${p.costo_envio}</p>
                    </div>
                </div>`;
            }).join('');
        }

        // --- 3. RENDERIZAR NUEVOS CLIENTES (Max 5) ---
        const contClientes = document.getElementById('dashboardUltimosClientes');
        const ultimosClientes = clientes.slice(0, 5);
        if (ultimosClientes.length === 0) {
            contClientes.innerHTML = '<p class="text-sm text-slate-500 text-center py-2">No hay clientes recientes.</p>';
        } else {
            contClientes.innerHTML = ultimosClientes.map(c => {
                const inicial = c.nombre ? c.nombre.charAt(0).toUpperCase() : '?';
                const fecha = new Date(c.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
                return `
                <div class="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors cursor-pointer" onclick="cambiarVista('clientes'); setTimeout(()=>abrirPerfilCliente('${c.id}'), 100);">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 font-bold flex items-center justify-center">
                            ${inicial}
                        </div>
                        <div>
                            <p class="font-bold text-slate-900 text-sm">${c.nombre}</p>
                            <p class="text-xs text-slate-500"><i data-feather="phone" class="w-3 h-3 inline"></i> ${c.telefono}</p>
                        </div>
                    </div>
                    <div class="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200">
                        ${fecha}
                    </div>
                </div>`;
            }).join('');
        }

        feather.replace();

        // Inicializar Mapa Global si es la primera vez
        if (!state.mapaGlobal && document.getElementById('mapaGlobalNegocios')) {
            state.mapaGlobal = L.map('mapaGlobalNegocios', { 
                dragging: !L.Browser.mobile, // Bloquear arrastre nativo en móvil para evitar conflictos con scroll
                tap: false
            }).setView([24.1426, -110.3127], 13);
            
            // Habilitar interacción de mapa en móvil solo al tocarlo
            if (L.Browser.mobile) {
                state.mapaGlobal.on('focus', function() { state.mapaGlobal.dragging.enable(); });
                state.mapaGlobal.on('blur', function() { state.mapaGlobal.dragging.disable(); });
            }

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.mapaGlobal);
        }

        // Renderizar elementos visuales
        renderizarNegocios(state.negociosGlobales);

    } catch (err) {
        console.error("Error al cargar listado", err);
    }
}
