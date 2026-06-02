import { state } from './state.js';
import { cargarDatosDashboard } from './dashboard.js';
import { cargarClientes } from './clientes.js';
import { cargarRepartidores } from './repartidores.js';
import { cargarPedidosRadar } from './pedidos.js';

/**
 * Gestiona el cambio de pantallas sin recargar la página.
 * @param {string} vistaId - El ID de la vista a mostrar ('resumen', 'negocios', etc.)
 */
export function cambiarVista(vistaId) {
    // 1. Ocultar todas las pantallas y limpiar estilos de botones
    ['resumen', 'negocios', 'radar', 'clientes', 'formulario-negocio', 'repartidores', 'mapa-completo', 'configuracion'].forEach(id => {
        const vista = document.getElementById('vista-' + id);
        if (vista) vista.classList.add('hidden');
        
        // Limpiar Nav Móvil
        const btnM = document.getElementById('btnNavMobile-' + id);
        if (btnM) {
            btnM.classList.remove('text-brand-600');
            btnM.classList.add('text-slate-400');
        }
        
        // Limpiar Nav Escritorio
        const btnD = document.getElementById('btnNavDesktop-' + id);
        if (btnD) {
            btnD.classList.remove('bg-brand-600', 'text-white', 'shadow-md', 'shadow-brand-600/20');
            btnD.classList.add('text-slate-400');
        }
    });

    // 2. Mostrar la pantalla solicitada
    const vistaAMostrar = document.getElementById('vista-' + vistaId);
    if (vistaAMostrar) vistaAMostrar.classList.remove('hidden');
    
    // 3. Resaltar botón de la vista actual (Móvil)
    const btnM = document.getElementById('btnNavMobile-' + vistaId);
    if (btnM) {
        btnM.classList.remove('text-slate-400');
        btnM.classList.add('text-brand-600');
    }
    
    // 4. Resaltar botón de la vista actual (Escritorio)
    const btnD = document.getElementById('btnNavDesktop-' + vistaId);
    if (btnD) {
        btnD.classList.remove('text-slate-400');
        btnD.classList.add('bg-brand-600', 'text-white', 'shadow-md', 'shadow-brand-600/20');
    }

    // 5. Mapear (Refrescar) mapas al cambiar a vistas que los contienen para evitar bugs de Leaflet (Gris)
    if (vistaId === 'negocios' && state.mapaGlobal) {
        setTimeout(() => state.mapaGlobal.invalidateSize(), 100);
    }
    if (vistaId === 'formulario-negocio' && state.mapaAdmin) {
        setTimeout(() => state.mapaAdmin.invalidateSize(), 100);
    }

    // 6. Cargar datos desde la BD solo cuando sea necesario
    if (vistaId === 'resumen' || vistaId === 'negocios') {
        cargarDatosDashboard();
    } else if (vistaId === 'clientes') {
        cargarClientes();
    } else if (vistaId === 'repartidores') {
        cargarRepartidores();
    } else if (vistaId === 'radar') {
        cargarPedidosRadar();
    } else if (vistaId === 'mapa-completo') {
        import('./mapa-avanzado.js').then(m => m.inicializarMapaAvanzado());
    } else if (vistaId === 'configuracion') {
        import('./configuracion.js').then(m => m.cargarConfiguracionGlobal());
    }
}
