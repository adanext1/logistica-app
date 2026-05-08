/**
 * Validación y Gestión de sesión para el Panel de Negocios
 */

(function() {
    // Verificamos si existe un ID de negocio en el almacenamiento local
    const id = localStorage.getItem('negocio_id');
    
    // Si no hay ID y no estamos en la página de login, redirigir
    if (!id && !window.location.pathname.includes('login-negocio.html')) {
        window.location.href = '/login-negocio.html';
    }
})();

/**
 * Cierra la sesión del negocio eliminando todos los datos locales
 */
function cerrarSesion() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        // Limpiamos todos los datos relacionados al negocio
        localStorage.removeItem('negocio_id');
        localStorage.removeItem('negocio_slug');
        localStorage.removeItem('negocio_nombre');
        
        // Redirigir al portal de acceso
        window.location.href = '/login-negocio.html';
    }
}

// Aseguramos que sea accesible globalmente para los botones onclick
window.cerrarSesion = cerrarSesion;
