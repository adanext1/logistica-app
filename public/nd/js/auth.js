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

/**
 * Abre la tienda pública del negocio en una nueva pestaña
 */
function irALaTienda() {
    const slug = localStorage.getItem('negocio_slug');
    if (slug) {
        window.open(`/${slug}`, '_blank');
    } else {
        alert('No se pudo encontrar el enlace de tu tienda.');
    }
}

/**
 * Copia el enlace de la tienda al portapapeles
 */
function copiarLinkTienda() {
    const slug = localStorage.getItem('negocio_slug');
    if (slug) {
        const url = `${window.location.origin}/${slug}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('¡Enlace de tu tienda copiado al portapapeles!');
        }).catch(err => {
            console.error('Error al copiar:', err);
        });
    } else {
        alert('No se pudo generar el enlace.');
    }
}

window.irALaTienda = irALaTienda;
window.copiarLinkTienda = copiarLinkTienda;

/**
 * Carga el nombre y logo del negocio en el header (para todas las páginas del panel)
 */
async function cargarPerfilHeader() {
    const id = localStorage.getItem('negocio_id');
    if (!id) return;

    try {
        const response = await fetch(`/api/negocio/${id}`);
        const data = await response.json();

        // Actualizar Header (IDs compartidos en todas las páginas del panel)
        const logoPlaceholder = document.getElementById('dashboardLogoPlaceholder');
        const logoImg = document.getElementById('dashboardLogoNegocio');
        const nombreNegocio = document.getElementById('dashboardNombreNegocio');

        if (logoImg && data.logo_url) {
            if (logoPlaceholder) logoPlaceholder.classList.add('hidden');
            logoImg.src = data.logo_url;
            logoImg.classList.remove('hidden');
        }

        if (nombreNegocio) {
            // Si es el dashboard, ponemos "Hola, "
            if (window.location.pathname.includes('dashboard.html')) {
                nombreNegocio.innerText = `Hola, ${data.nombre_comercial}`;
            } else {
                nombreNegocio.innerText = data.nombre_comercial || 'Mi Negocio';
            }
        }
    } catch (error) {
        console.error("Error al cargar perfil en header:", error);
    }
}

// Ejecutar carga de perfil al cargar el script
document.addEventListener('DOMContentLoaded', cargarPerfilHeader);
