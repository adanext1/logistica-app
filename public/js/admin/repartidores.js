import { state } from './state.js';
import { fetchConAuth } from './auth.js';

export async function cargarRepartidores() {
    try {
        const response = await fetchConAuth('/api/repartidores');
        if (!response) return;

        const repartidores = await response.json();
        state.repartidoresGlobales = repartidores;
        renderizarRepartidores(state.repartidoresGlobales);
    } catch (err) {
        console.error("Error al cargar repartidores", err);
    }
}

export function renderizarRepartidores(repartidores) {
    const lista = document.getElementById('listaRepartidores');

    if (!repartidores || repartidores.length === 0) {
        lista.innerHTML = `
            <li class="p-12 text-center text-slate-500">
                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4"><i data-feather="truck" class="w-8 h-8 text-slate-300"></i></div>
                <h4 class="font-bold text-slate-700 text-lg">Sin repartidores</h4>
                <p class="text-sm mt-1">Registra a tu equipo para comenzar a asignar envíos.</p>
            </li>`;
        feather.replace();
        return;
    }

    lista.innerHTML = repartidores.map((r) => {
        const inicial = r.nombre ? r.nombre.charAt(0).toUpperCase() : '?';
        const color = r.estado === 'activo' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600';
        const badgeText = r.estado === 'activo' ? 'Activo' : 'Inactivo';
        const iconVehiculo = r.vehiculo === 'Moto' ? 'map' : (r.vehiculo === 'Auto' ? 'truck' : 'navigation');
        const fecha = new Date(r.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });

        return `
        <li class="flex flex-col md:flex-row md:items-center justify-between p-6 hover:bg-slate-50 transition-colors gap-4 group">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 ${color} rounded-full flex items-center justify-center font-extrabold text-xl shadow-sm group-hover:scale-105 transition-transform">
                    ${inicial}
                </div>
                <div>
                    <h4 class="font-bold text-slate-900 text-lg group-hover:text-brand-600 transition-colors flex items-center gap-2">
                        ${r.nombre} 
                        <span class="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${r.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${badgeText}</span>
                    </h4>
                    <div class="flex flex-wrap items-center gap-3 text-sm text-slate-500 mt-1">
                        <span class="flex items-center gap-1"><i data-feather="phone" class="w-3.5 h-3.5"></i> ${r.telefono}</span>
                        <span class="flex items-center gap-1"><i data-feather="${iconVehiculo}" class="w-3.5 h-3.5"></i> ${r.vehiculo || 'No especificado'} ${r.placas ? `(${r.placas})` : ''}</span>
                        <span class="flex items-center gap-1 hidden sm:flex"><i data-feather="calendar" class="w-3.5 h-3.5"></i> Ingreso: ${fecha}</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2 mt-2 md:mt-0">
                <button onclick="abrirModalRepartidor('${r.id}')" class="px-4 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                    <i data-feather="edit-2" class="w-4 h-4"></i> Editar
                </button>
                <button onclick="eliminarRepartidor('${r.id}', '${r.nombre.replace(/'/g, "\\'")}')" class="p-2 text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 shadow-sm border border-slate-200 rounded-lg hover:border-red-200 transition-all focus:outline-none">
                    <i data-feather="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </li>
        `;
    }).join('');

    feather.replace();
}

export function abrirModalRepartidor(id = null) {
    state.repartidorEditandoId = id;
    const form = document.getElementById('formEditarRepartidor');
    form.reset();

    if (id) {
        document.getElementById('tituloModalRepartidor').innerText = 'Editar Repartidor';
        const rep = state.repartidoresGlobales.find(r => r.id === id);
        if (rep) {
            document.getElementById('repartidorNombre').value = rep.nombre || '';
            document.getElementById('repartidorTelefono').value = rep.telefono || '';
            document.getElementById('repartidorVehiculo').value = rep.vehiculo || 'Moto';
            document.getElementById('repartidorPlacas').value = rep.placas || '';
            document.getElementById('repartidorEstado').value = rep.estado || 'activo';
            document.getElementById('repartidorPin').value = rep.pin || '';
        }
    } else {
        document.getElementById('tituloModalRepartidor').innerText = 'Nuevo Repartidor';
    }

    const overlay = document.getElementById('modalEditarRepartidorOverlay');
    const content = document.getElementById('modalEditarRepartidorContent');
    overlay.classList.remove('hidden', 'pointer-events-none');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
    feather.replace();
}

export function cerrarModalRepartidor() {
    const overlay = document.getElementById('modalEditarRepartidorOverlay');
    const content = document.getElementById('modalEditarRepartidorContent');
    overlay.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => overlay.classList.add('hidden', 'pointer-events-none'), 300);
}

export function eliminarRepartidor(id, nombre) {
    state.idParaBorrar = id;
    state.tipoBorrado = 'repartidor';
    document.getElementById('nombreBorrarDestacado').innerText = `"${nombre}"`;
    document.getElementById('textoAdicionalBorrar').classList.add('hidden'); // Sin advertencia de borrar pedidos asociados
    const input = document.getElementById('inputConfirmarBorrar');
    input.value = '';
    
    const btn = document.getElementById('btnConfirmarBorrar');
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    
    const overlay = document.getElementById('modalBorrarOverlay');
    const content = document.getElementById('modalBorrarContent');
    overlay.classList.remove('hidden', 'pointer-events-none');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
        input.focus();
    }, 10);
    feather.replace();
}

export function setupRepartidores() {
    document.getElementById('buscadorRepartidores')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtrados = state.repartidoresGlobales.filter(r => 
            (r.nombre && r.nombre.toLowerCase().includes(query)) || 
            (r.telefono && r.telefono.includes(query)) ||
            (r.vehiculo && r.vehiculo.toLowerCase().includes(query))
        );
        renderizarRepartidores(filtrados);
    });

    document.getElementById('formEditarRepartidor')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.getElementById('btnGuardarRepartidor');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';
        btn.disabled = true;

        const body = {
            nombre: document.getElementById('repartidorNombre').value,
            telefono: document.getElementById('repartidorTelefono').value,
            vehiculo: document.getElementById('repartidorVehiculo').value,
            placas: document.getElementById('repartidorPlacas').value,
            estado: document.getElementById('repartidorEstado').value,
            pin: document.getElementById('repartidorPin').value
        };

        const url = state.repartidorEditandoId ? `/api/repartidores/${state.repartidorEditandoId}` : '/api/repartidores';
        const method = state.repartidorEditandoId ? 'PUT' : 'POST';

        try {
            const response = await fetchConAuth(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response) { btn.innerHTML = originalHtml; btn.disabled = false; return; }

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "No se pudo guardar");
            }

            cerrarModalRepartidor();
            cargarRepartidores();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    });
}
