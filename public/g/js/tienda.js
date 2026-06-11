// Orquestador Principal de la Tienda
import { state } from './modules/state.js';
import { 
    agregarSimpleAlCarrito,
    agregarConfiguradoAlCarrito,
    sumarCarrito,
    restarCarrito,
    actualizarCarrito,
    agregarOfertaAlCarrito,
    continuarPedido
} from './modules/cart.js';
import { 
    initGestures 
} from './modules/gestures.js';
import { 
    cargarNegocio,
    abrirModalHorarios,
    cerrarModalHorarios,
    abrirModalCategorias,
    cerrarModalCategorias,
    manejarClickProducto,
    abrirTikTok,
    cerrarTikTokOverlay,
    actualizarSaborUnico,
    manejarCambioSabor,
    seleccionarSaborAlAzar,
    actualizarConfigTamano,
    cerrarConfigProducto,
    abrirModalCarrito,
    cerrarModalCarrito,
    filtrarPorCategoria,
    compartir,
    cerrarAlerta,
    abrirDetalleProducto,
    cerrarDetalleProducto,
    initUIListeners,
    actualizarTallaDetectada
} from './modules/ui.js';

// Exponer funciones necesarias al scope global (window)
// Esto asegura que los controladores inline HTML (onclick, onchange, etc.) sigan funcionando perfectamente
window.compartir = compartir;
window.abrirModalHorarios = abrirModalHorarios;
window.cerrarModalHorarios = cerrarModalHorarios;
window.abrirModalCategorias = abrirModalCategorias;
window.cerrarModalCategorias = cerrarModalCategorias;
window.filtrarPorCategoria = filtrarPorCategoria;
window.manejarClickProducto = manejarClickProducto;
window.abrirTikTok = abrirTikTok;
window.cerrarTikTokOverlay = cerrarTikTokOverlay;
window.agregarOfertaAlCarrito = agregarOfertaAlCarrito;
window.cerrarConfigProducto = cerrarConfigProducto;
window.actualizarConfigTamano = actualizarConfigTamano;
window.seleccionarSaborAlAzar = seleccionarSaborAlAzar;
window.manejarCambioSabor = manejarCambioSabor;
window.actualizarSaborUnico = actualizarSaborUnico;
window.actualizarTallaDetectada = actualizarTallaDetectada;
window.abrirModalCarrito = abrirModalCarrito;
window.cerrarModalCarrito = cerrarModalCarrito;
window.restarCarrito = restarCarrito;
window.sumarCarrito = sumarCarrito;
window.continuarPedido = continuarPedido;
window.cerrarAlerta = cerrarAlerta;
window.abrirDetalleProducto = abrirDetalleProducto;
window.cerrarDetalleProducto = cerrarDetalleProducto;

// Evitar doble inicialización
let initialized = false;
function init() {
    if (initialized) return;
    initialized = true;
    initUIListeners();
    initGestures();
    cargarNegocio();
}

// Escuchar evento de carga del DOM
document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
}
