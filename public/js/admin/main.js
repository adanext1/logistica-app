import { state } from './state.js';
import { cerrarSesion, tokenAdmin } from './auth.js';
import { cambiarVista } from './navigation.js';
import { cargarDatosDashboard } from './dashboard.js';
import { setupNegocios, abrirFormularioNegocio, eliminarNegocio } from './negocios.js';
import { setupClientes, cargarClientes, abrirPerfilCliente, cerrarPerfilCliente, abrirModalCliente, cerrarModalCliente, abrirModalNuevoCliente, eliminarCliente } from './clientes.js';
import { abrirDetallePedido, cerrarModalPedido, toggleEstadoPedido } from './pedidos.js';
import { setupRepartidores, cargarRepartidores, abrirModalRepartidor, cerrarModalRepartidor, eliminarRepartidor } from './repartidores.js';

// --- Exponer funciones al objeto window para compatibilidad con inline onclick en admin.html ---
window.cerrarSesion = cerrarSesion;
window.cambiarVista = cambiarVista;

window.abrirFormularioNegocio = abrirFormularioNegocio;
window.eliminarNegocio = eliminarNegocio;

window.abrirPerfilCliente = abrirPerfilCliente;
window.cerrarPerfilCliente = cerrarPerfilCliente;
window.abrirModalCliente = abrirModalCliente;
window.cerrarModalCliente = cerrarModalCliente;
window.abrirModalNuevoCliente = abrirModalNuevoCliente;
window.eliminarCliente = eliminarCliente;

window.abrirDetallePedido = abrirDetallePedido;
window.cerrarModalPedido = cerrarModalPedido;
window.toggleEstadoPedido = toggleEstadoPedido;

window.abrirModalRepartidor = abrirModalRepartidor;
window.cerrarModalRepartidor = cerrarModalRepartidor;
window.eliminarRepartidor = eliminarRepartidor;

// Lógica de Modal de Borrado General
window.cerrarModalBorrar = function() {
    const overlay = document.getElementById('modalBorrarOverlay');
    const content = document.getElementById('modalBorrarContent');
    overlay.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => {
        overlay.classList.add('hidden', 'pointer-events-none');
        state.idParaBorrar = null;
        state.tipoBorrado = null;
    }, 300);
};

// --- Configuración e Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar iconos Feather
    if (typeof feather !== 'undefined') {
        feather.replace();
    }

    // Configurar módulos
    setupNegocios();
    setupClientes();
    setupRepartidores();

    // Event Listener para Input Modal Borrar
    const inputConfirmar = document.getElementById('inputConfirmarBorrar');
    if (inputConfirmar) {
        inputConfirmar.addEventListener('input', function(e) {
            const val = e.target.value.trim().toUpperCase();
            const btn = document.getElementById('btnConfirmarBorrar');
            if (val === 'ELIMINAR') {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        });
    }

    // Event Listener para Botón Modal Borrar
    const btnConfirmar = document.getElementById('btnConfirmarBorrar');
    if (btnConfirmar) {
        btnConfirmar.addEventListener('click', async function() {
            if (!state.idParaBorrar) return;
            
            const btn = this;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';
            btn.disabled = true;

            try {
                let url = '';
                if (state.tipoBorrado === 'negocio') url = `/api/negocios/${state.idParaBorrar}`;
                else if (state.tipoBorrado === 'cliente') url = `/api/clientes/${state.idParaBorrar}`;
                else if (state.tipoBorrado === 'repartidor') url = `/api/repartidores/${state.idParaBorrar}`;
                
                const response = await fetch(url, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${tokenAdmin}` }
                });

                if (response.status === 401) { cerrarSesion(); return; }
                
                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || `No se pudo eliminar el ${state.tipoBorrado}`);
                }

                window.cerrarModalBorrar();
                setTimeout(() => {
                    if (state.tipoBorrado === 'negocio') {
                        cargarDatosDashboard();
                    } else if (state.tipoBorrado === 'cliente') {
                        cargarClientes();
                    } else if (state.tipoBorrado === 'repartidor') {
                        cargarRepartidores();
                    }
                }, 300);
                
            } catch (err) {
                alert(err.message);
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        });
    }

    // Bootstrapping App
    cambiarVista('resumen');
});
