/**
 * ============================================================================
 * LOGILINK - Lógica Central del Panel de Administración
 * ============================================================================
 * Este archivo contiene toda la lógica frontend del dashboard:
 * - Autenticación y cierre de sesión.
 * - Navegación SPA (Single Page Application) entre vistas.
 * - Peticiones a la API de Supabase (CRUD de negocios).
 * - Renderizado de Leaflet Maps y marcadores dinámicos.
 * - Procesamiento y compresión local de imágenes en Base64.
 */

// ============================================================================
// 1. AUTENTICACIÓN Y SEGURIDAD
// ============================================================================

// Verificación temprana del token
const tokenAdmin = localStorage.getItem('admin_token');
if (!tokenAdmin) {
    window.location.href = '/login.html'; // Redirigir si no hay sesión
}

/**
 * Cierra la sesión eliminando el token del almacenamiento local y redirige al login.
 */
function cerrarSesion() {
    localStorage.removeItem('admin_token');
    window.location.href = '/login.html';
}

// Inicializar iconos Feather al cargar el script
feather.replace();

// ============================================================================
// 2. SISTEMA DE NAVEGACIÓN (SPA - SINGLE PAGE APPLICATION)
// ============================================================================

/**
 * Gestiona el cambio de pantallas sin recargar la página.
 * @param {string} vistaId - El ID de la vista a mostrar ('resumen', 'negocios', etc.)
 */
function cambiarVista(vistaId) {
    // 1. Ocultar todas las pantallas y limpiar estilos de botones
    ['resumen', 'negocios', 'radar', 'clientes', 'formulario-negocio'].forEach(id => {
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
    if (vistaId === 'negocios' && mapaGlobal) {
        setTimeout(() => mapaGlobal.invalidateSize(), 100);
    }
    if (vistaId === 'formulario-negocio' && mapaAdmin) {
        setTimeout(() => mapaAdmin.invalidateSize(), 100);
    }

    // 6. Cargar datos desde la BD solo cuando sea necesario
    if (vistaId === 'resumen' || vistaId === 'negocios') {
        cargarDatosDashboard();
    } else if (vistaId === 'clientes') {
        cargarClientes();
    } else if (vistaId === 'radar') {
        cargarPedidosRadar();
    }
}

// ============================================================================
// 3. ESTADO GLOBAL Y VARIABLES DE MEMORIA
// ============================================================================
let mapaGlobal = null;       // Instancia del mapa de todos los negocios
let pinesGlobales = [];      // Array para rastrear pines y poder borrarlos/actualizarlos
let negociosGlobales = [];   // Caché local de negocios para búsqueda instantánea
let mapaAdmin = null;        // Instancia del mapa para seleccionar coordenadas (Formulario)
let pinActual = null;        // Pin individual en el mapa del formulario
let negocioEditandoSlug = null; // Identificador del negocio en edición
let logoBase64 = null;       // Imagen procesada y comprimida lista para subir
let clientesGlobales = [];   // Caché local de clientes para búsqueda instantánea
let pedidosGlobales = [];    // Caché local de pedidos del radar

// ============================================================================
// 4. CARGA DE DATOS PRINCIPAL (DASHBOARD)
// ============================================================================

/**
 * Obtiene la lista de todos los negocios desde la API y renderiza el mapa y la lista.
 */
async function cargarDatosDashboard() {
    try {
        // Ejecutar promesas en paralelo para mayor velocidad
        const [resNegocios, resClientes, resPedidos] = await Promise.all([
            fetch('/api/negocios'),
            fetch('/api/clientes', { headers: { 'Authorization': `Bearer ${tokenAdmin}` } }),
            fetch('/api/pedidos', { headers: { 'Authorization': `Bearer ${tokenAdmin}` } })
        ]);

        const negocios = await resNegocios.json();
        negociosGlobales = negocios;
        
        let clientes = [];
        if (resClientes.ok) {
            clientes = await resClientes.json();
            clientesGlobales = clientes;
        }

        let pedidos = [];
        if (resPedidos.ok) {
            pedidos = await resPedidos.json();
            pedidosGlobales = pedidos;
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
        if (!mapaGlobal && document.getElementById('mapaGlobalNegocios')) {
            mapaGlobal = L.map('mapaGlobalNegocios', { 
                dragging: !L.Browser.mobile, // Bloquear arrastre nativo en móvil para evitar conflictos con scroll
                tap: false
            }).setView([24.1426, -110.3127], 13);
            
            // Habilitar interacción de mapa en móvil solo al tocarlo
            if (L.Browser.mobile) {
                mapaGlobal.on('focus', function() { mapaGlobal.dragging.enable(); });
                mapaGlobal.on('blur', function() { mapaGlobal.dragging.disable(); });
            }

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaGlobal);
        }

        // Renderizar elementos visuales
        renderizarNegocios(negociosGlobales);

    } catch (err) {
        console.error("Error al cargar listado", err);
    }
}

// ============================================================================
// 5. RENDERIZADO VISUAL (LISTA Y MAPA)
// ============================================================================

/**
 * Genera el HTML de la lista de negocios y actualiza los pines del mapa global.
 * Esta función es reutilizable para renderizar búsquedas filtradas.
 * @param {Array} negociosAMostrar - Arreglo de objetos negocio
 */
function renderizarNegocios(negociosAMostrar) {
    const lista = document.getElementById('listaNegocios');
    
    // Estado de "Sin Resultados"
    if (!negociosAMostrar || negociosAMostrar.length === 0) {
        lista.innerHTML = `
            <li class="p-12 text-center text-slate-500">
                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4"><i data-feather="search" class="w-8 h-8 text-slate-300"></i></div>
                <h4 class="font-bold text-slate-700 text-lg">Sin resultados</h4>
                <p class="text-sm mt-1">Prueba con otra búsqueda o agrega uno nuevo.</p>
            </li>`;
        
        // Limpiar mapa si no hay nada que mostrar
        if (mapaGlobal) {
            pinesGlobales.forEach(p => mapaGlobal.removeLayer(p));
            pinesGlobales = [];
        }
        feather.replace();
        return;
    }

    // --- ACTUALIZAR MAPA GLOBAL ---
    if (mapaGlobal) {
        // Borrar pines antiguos antes de pintar
        pinesGlobales.forEach(p => mapaGlobal.removeLayer(p));
        pinesGlobales = [];
        const bounds = L.latLngBounds();

        negociosAMostrar.forEach(n => {
            if (n.lat && n.lng) {
                const inicialPin = n.nombre_comercial.charAt(0).toUpperCase();
                // Determinar si pintamos un logo custom o una letra inicial generada
                const logoElement = n.logo_url ? `<img src="${n.logo_url}" class="w-full h-full object-cover">` : inicialPin;

                // Crear Icono Personalizado con HTML
                const customIcon = L.divIcon({
                    className: 'bg-transparent border-none',
                    html: `
                        <div class="relative flex flex-col items-center group cursor-pointer z-50">
                            <div class="bg-white rounded-full shadow-lg shadow-slate-200/50 border border-slate-100 p-1 pr-3.5 flex items-center gap-2 transition-transform duration-300 transform group-hover:-translate-y-1 group-hover:shadow-xl hover:border-brand-200">
                                <div class="w-7 h-7 rounded-full bg-gradient-to-br from-brand-100 to-brand-50 text-brand-600 flex items-center justify-center font-extrabold text-[11px] shadow-inner overflow-hidden border border-white">
                                    ${logoElement}
                                </div>
                                <span class="font-extrabold text-slate-800 text-[11px] whitespace-nowrap tracking-tight">${n.nombre_comercial}</span>
                            </div>
                            <div class="w-2.5 h-2.5 bg-white transform rotate-45 -mt-1.5 border-b border-r border-slate-100 shadow-sm z-0"></div>
                        </div>
                    `,
                    iconSize: [120, 50],
                    iconAnchor: [60, 48]
                });
                
                // HTML del Tooltip / PopUp al hacer clic
                const popupHtml = `
                    <div class="text-center min-w-[120px] pb-1">
                        <div class="font-bold text-slate-900 text-sm mb-2 border-b border-slate-100 pb-1">${n.nombre_comercial}</div>
                        <a href="${window.location.origin}/${n.slug}" target="_blank" class="inline-block bg-brand-50 text-brand-700 text-xs px-3 py-1.5 rounded-lg font-bold hover:bg-brand-100 transition-colors w-full border border-brand-100 shadow-sm">
                            Ir al Enlace
                        </a>
                    </div>
                `;

                const marker = L.marker([n.lat, n.lng], {icon: customIcon}).addTo(mapaGlobal)
                    .bindPopup(popupHtml, { minWidth: 130 });
                pinesGlobales.push(marker);
                bounds.extend([n.lat, n.lng]);
            }
        });

        // Auto-encuadrar el mapa para que todos los pines quepan en la pantalla
        if (pinesGlobales.length > 0) {
            mapaGlobal.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        }
        setTimeout(() => mapaGlobal.invalidateSize(), 100);
    }

    // --- GENERAR LISTA DE NEGOCIOS (HTML) ---
    lista.innerHTML = negociosAMostrar.map((n, i) => {
        // Paleta de colores para las iniciales dinámicas
        const colores = ['bg-blue-100 text-blue-600', 'bg-brand-100 text-brand-600', 'bg-purple-100 text-purple-600', 'bg-orange-100 text-orange-600'];
        const colorElegido = colores[i % colores.length];
        const inicial = n.nombre_comercial.charAt(0).toUpperCase();
        const linkM = `${window.location.origin}/${n.slug}`;

        return `
        <li class="flex flex-col sm:flex-row sm:items-center justify-between p-5 hover:bg-slate-50 transition-colors gap-4 border-b border-slate-50 last:border-0">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 ${colorElegido} rounded-2xl flex items-center justify-center font-extrabold text-xl shadow-sm overflow-hidden">
                    ${n.logo_url ? `<img src="${n.logo_url}" class="w-full h-full object-cover">` : inicial}
                </div>
                <div class="max-w-[200px] sm:max-w-none">
                    <h4 class="font-bold text-slate-900 text-lg truncate">${n.nombre_comercial}</h4>
                    <a href="${linkM}" target="_blank" class="text-xs text-brand-600 font-medium hover:underline truncate block">${linkM}</a>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="navigator.clipboard.writeText('${linkM}'); alert('¡Enlace copiado exitosamente!');" class="flex-1 sm:flex-none text-center px-4 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                    <i data-feather="copy" class="w-4 h-4"></i> <span class="sm:hidden">Copiar</span>
                </button>
                <div class="relative group">
                    <button class="p-2 text-slate-400 hover:text-slate-900 bg-white shadow-sm border border-slate-200 rounded-lg hover:border-slate-300 transition-all focus:outline-none">
                        <i data-feather="settings" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                    <!-- Dropdown menu (Oculto por defecto, visible en Hover) -->
                    <div class="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden transform origin-top-right scale-95 group-hover:scale-100">
                        <button onclick="abrirFormularioNegocio('${n.slug}')" class="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 font-bold flex items-center gap-2">
                            <i data-feather="edit-2" class="w-4 h-4 text-brand-600"></i> Editar
                        </button>
                        <button onclick="eliminarNegocio('${n.slug}', '${n.nombre_comercial.replace(/'/g, "\\'")}')" class="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-bold flex items-center gap-2 border-t border-slate-50">
                            <i data-feather="trash-2" class="w-4 h-4"></i> Eliminar
                        </button>
                    </div>
                </div>
            </div>
        </li>
    `}).join('');
    
    feather.replace(); // Volver a renderizar iconos ya que se inyectó nuevo HTML
}

// Escuchador del input de Búsqueda
document.getElementById('buscadorNegocios').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    // Filtro instantáneo usando caché en memoria
    const negociosFiltrados = negociosGlobales.filter(n => 
        n.nombre_comercial.toLowerCase().includes(query)
    );
    renderizarNegocios(negociosFiltrados);
});

// ============================================================================
// 6. GESTIÓN DE NEGOCIOS (CREAR Y EDITAR PANTALLA COMPLETA)
// ============================================================================

/**
 * Prepara la pantalla de Formulario de Negocio para Crear o Editar.
 * @param {string|null} slug - Identificador del negocio si se va a editar.
 */
function abrirFormularioNegocio(slug = null) {
    negocioEditandoSlug = slug;
    logoBase64 = null; // Reiniciar imagen
    
    // Elementos visuales del logo
    const preview = document.getElementById('logoPreview');
    const placeholder = document.getElementById('logoPlaceholder');
    preview.src = '';
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    
    if (slug) {
        // MODO EDICIÓN: Rellenar datos existentes
        const n = negociosGlobales.find(x => x.slug === slug);
        if (n) {
            document.getElementById('nombre').value = n.nombre_comercial;
            document.getElementById('whatsapp').value = n.whatsapp;
            document.getElementById('lat').value = n.lat || '';
            document.getElementById('lng').value = n.lng || '';
            
            document.getElementById('tituloFormularioNegocio').innerText = 'Editar Negocio';
            document.getElementById('btnSubmitNegocio').innerHTML = '<span>Guardar Cambios</span> <i data-feather="save" class="w-5 h-5"></i>';
            document.getElementById('btnSubmitNegocioMobile').innerHTML = '<span>Guardar Cambios</span> <i data-feather="save" class="w-5 h-5"></i>';
            
            // Si tiene logo, mostrarlo en el preview
            if (n.logo_url) {
                preview.src = n.logo_url;
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');
            }
        }
    } else {
        // MODO CREACIÓN: Limpiar todo
        document.getElementById('formNegocio').reset();
        document.getElementById('lat').value = '';
        document.getElementById('lng').value = '';
        
        document.getElementById('tituloFormularioNegocio').innerText = 'Alta de Negocio';
        document.getElementById('btnSubmitNegocio').innerHTML = '<span>Guardar Negocio</span> <i data-feather="check-circle" class="w-5 h-5"></i>';
        document.getElementById('btnSubmitNegocioMobile').innerHTML = '<span>Guardar Negocio</span> <i data-feather="check-circle" class="w-5 h-5"></i>';
        
        if (pinActual && mapaAdmin) { 
            mapaAdmin.removeLayer(pinActual); 
            pinActual = null; 
        }
    }
    feather.replace();

    cambiarVista('formulario-negocio');

    // Inicializar o ajustar mapa (Se retrasa por el delay de CSS de la pantalla)
    setTimeout(() => {
        if (!mapaAdmin) {
            mapaAdmin = L.map('mapaAdmin', { zoomControl: false }).setView([24.1426, -110.3127], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaAdmin);
            
            // Lógica de creación/movimiento de pin al hacer clic
            mapaAdmin.on('click', function (e) {
                const lat = e.latlng.lat.toFixed(6);
                const lng = e.latlng.lng.toFixed(6);
                
                if (pinActual) {
                    pinActual.setLatLng(e.latlng);
                } else {
                    const customIcon = L.divIcon({
                        className: 'custom-pin',
                        html: `<div class="w-5 h-5 bg-brand-600 rounded-full border-2 border-white shadow-md"></div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });
                    pinActual = L.marker(e.latlng, {icon: customIcon}).addTo(mapaAdmin);
                }
                
                document.getElementById('lat').value = lat;
                document.getElementById('lng').value = lng;
                mapaAdmin.panTo(e.latlng);
            });
        }
        
        // Si estamos editando y hay coordenadas, colocar el pin donde va
        if (slug && document.getElementById('lat').value) {
            const lat = parseFloat(document.getElementById('lat').value);
            const lng = parseFloat(document.getElementById('lng').value);
            const latlng = [lat, lng];
            
            if (pinActual) {
                pinActual.setLatLng(latlng);
            } else {
                const customIcon = L.divIcon({
                    className: 'custom-pin',
                    html: `<div class="w-5 h-5 bg-brand-600 rounded-full border-2 border-white shadow-md"></div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
                pinActual = L.marker(latlng, {icon: customIcon}).addTo(mapaAdmin);
            }
            mapaAdmin.setView(latlng, 15);
        }

        setTimeout(() => mapaAdmin.invalidateSize(), 350);
    }, 100);
}

// ============================================================================
// 7. MOTOR DE COMPRESIÓN DE IMÁGENES CLIENT-SIDE
// ============================================================================

/**
 * Escucha el input de archivo. Si seleccionan imagen, la comprime usando un canvas.
 * Esto es CRÍTICO para ahorrar ancho de banda y espacio en base de datos.
 */
document.getElementById('logoInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const preview = document.getElementById('logoPreview');
    const placeholder = document.getElementById('logoPlaceholder');

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Límite radical: 400x400 max. Ahorro sustancial de DB.
            const maxSize = 400;
            let width = img.width;
            let height = img.height;

            if (width > height && width > maxSize) {
                height *= maxSize / width;
                width = maxSize;
            } else if (height > maxSize) {
                width *= maxSize / height;
                height = maxSize;
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Generar string Base64 al 70% calidad JPEG
            logoBase64 = canvas.toDataURL('image/jpeg', 0.7); 
            
            preview.src = logoBase64;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// ============================================================================
// 8. PETICIONES AL BACKEND (GUARDAR)
// ============================================================================

document.getElementById('formNegocio').addEventListener('submit', async function (e) {
    e.preventDefault();
    
    // Obtener referencias a botones (Desktop y Mobile) para mostrar estado de carga
    const btn = document.getElementById('btnSubmitNegocio');
    const btnM = document.getElementById('btnSubmitNegocioMobile');
    const originalHtml = btn.innerHTML;
    const originalHtmlM = btnM ? btnM.innerHTML : '';
    
    // Bloquear botones y mostrar spinner
    btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';
    btn.disabled = true;
    if(btnM) { 
        btnM.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>'; 
        btnM.disabled = true; 
    }

    const nombre = document.getElementById('nombre').value;
    const whatsapp = document.getElementById('whatsapp').value;
    const lat = document.getElementById('lat').value;
    const lng = document.getElementById('lng').value;

    if (!lat || !lng) {
        alert("Debes tocar el mapa para indicar la ubicación.");
        btn.innerHTML = originalHtml; btn.disabled = false;
        if(btnM) { btnM.innerHTML = originalHtmlM; btnM.disabled = false; }
        return;
    }

    const url = negocioEditandoSlug ? `/api/negocios/${negocioEditandoSlug}` : '/api/negocios';
    const method = negocioEditandoSlug ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenAdmin}`
            },
            body: JSON.stringify({ nombre, whatsapp, lat, lng, logo_base64: logoBase64 })
        });

        // Verificación de expiración de sesión (Token JWT)
        if (response.status === 401) {
            alert("Tu sesión expiró. Inicia sesión de nuevo.");
            cerrarSesion();
            return;
        }

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "No se pudo guardar.");
        }

        // Limpiar form en éxito
        document.getElementById('formNegocio').reset();
        logoBase64 = null;
        document.getElementById('logoPreview').classList.add('hidden');
        document.getElementById('logoPlaceholder').classList.remove('hidden');
        
        if (pinActual) { mapaAdmin.removeLayer(pinActual); pinActual = null; }
        
        // Refrescar y volver
        cargarDatosDashboard(); 
        cambiarVista('negocios');
        setTimeout(() => alert(negocioEditandoSlug ? "¡Negocio actualizado!" : "¡Negocio registrado y en línea!"), 350);

    } catch (error) {
        alert(error.message);
    } finally {
        // Restaurar estado de botones
        btn.innerHTML = originalHtml; btn.disabled = false;
        if(btnM) { btnM.innerHTML = originalHtmlM; btnM.disabled = false; }
    }
});

// ============================================================================
// 9. FLUJO DE BORRADO DE SEGURIDAD (MODAL ALERTA ROJA)
// ============================================================================

let idParaBorrar = null;
let tipoBorrado = null; // 'negocio' o 'cliente'

function eliminarNegocio(slug, nombre) {
    idParaBorrar = slug;
    tipoBorrado = 'negocio';
    document.getElementById('nombreBorrarDestacado').innerText = `"${nombre}"`;
    document.getElementById('textoAdicionalBorrar').classList.remove('hidden');
    const input = document.getElementById('inputConfirmarBorrar');
    input.value = '';
    
    // Deshabilitar botón por defecto hasta que se escriba ELIMINAR
    const btn = document.getElementById('btnConfirmarBorrar');
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    
    // Mostrar modal con animación fluida
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

function cerrarModalBorrar() {
    const overlay = document.getElementById('modalBorrarOverlay');
    const content = document.getElementById('modalBorrarContent');
    overlay.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => {
        overlay.classList.add('hidden', 'pointer-events-none');
        idParaBorrar = null;
        tipoBorrado = null;
    }, 300);
}

// Event Listener para requerir escribir 'ELIMINAR'
document.getElementById('inputConfirmarBorrar').addEventListener('input', function(e) {
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

document.getElementById('btnConfirmarBorrar').addEventListener('click', async function() {
    if (!idParaBorrar) return;
    
    const btn = this;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';
    btn.disabled = true;

    try {
        const url = tipoBorrado === 'negocio' ? `/api/negocios/${idParaBorrar}` : `/api/clientes/${idParaBorrar}`;
        
        const response = await fetch(url, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenAdmin}` }
        });

        if (response.status === 401) { cerrarSesion(); return; }
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || `No se pudo eliminar el ${tipoBorrado}`);
        }

        cerrarModalBorrar();
        setTimeout(() => {
            if (tipoBorrado === 'negocio') {
                cargarDatosDashboard();
            } else if (tipoBorrado === 'cliente') {
                cargarClientes();
            }
        }, 300);
        
    } catch (err) {
        alert(err.message);
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
});

// ============================================================================
// 10. MÓDULO DE CLIENTES
// ============================================================================

async function cargarClientes() {
    try {
        const response = await fetch('/api/clientes', {
            headers: { 'Authorization': `Bearer ${tokenAdmin}` }
        });

        if (response.status === 401) { cerrarSesion(); return; }

        const clientes = await response.json();
        clientesGlobales = clientes;
        renderizarClientes(clientesGlobales);
    } catch (err) {
        console.error("Error al cargar clientes", err);
    }
}

function renderizarClientes(clientes) {
    const lista = document.getElementById('listaClientes');

    if (!clientes || clientes.length === 0) {
        lista.innerHTML = `
            <li class="p-12 text-center text-slate-500">
                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4"><i data-feather="users" class="w-8 h-8 text-slate-300"></i></div>
                <h4 class="font-bold text-slate-700 text-lg">Sin clientes registrados</h4>
                <p class="text-sm mt-1">Los clientes aparecerán aquí automáticamente cuando hagan un pedido.</p>
            </li>`;
        feather.replace();
        return;
    }

    lista.innerHTML = clientes.map((c, i) => {
        const inicial = c.nombre ? c.nombre.charAt(0).toUpperCase() : '?';
        const colores = ['bg-green-100 text-green-600', 'bg-blue-100 text-blue-600', 'bg-purple-100 text-purple-600', 'bg-yellow-100 text-yellow-600'];
        const color = colores[i % colores.length];
        
        const fecha = new Date(c.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });

        return `
        <li onclick="abrirPerfilCliente('${c.id}')" class="flex flex-col md:flex-row md:items-center justify-between p-6 hover:bg-slate-50 transition-colors gap-4 cursor-pointer group">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 ${color} rounded-full flex items-center justify-center font-extrabold text-xl shadow-sm group-hover:scale-105 transition-transform">
                    ${inicial}
                </div>
                <div>
                    <h4 class="font-bold text-slate-900 text-lg group-hover:text-brand-600 transition-colors">${c.nombre}</h4>
                    <div class="flex items-center gap-3 text-sm text-slate-500 mt-1">
                        <span class="flex items-center gap-1"><i data-feather="phone" class="w-3.5 h-3.5"></i> ${c.telefono}</span>
                        <span class="flex items-center gap-1"><i data-feather="calendar" class="w-3.5 h-3.5"></i> ${fecha}</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2 mt-2 md:mt-0">
                <button onclick="event.stopPropagation(); abrirModalCliente('${c.id}')" class="px-4 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                    <i data-feather="edit-2" class="w-4 h-4"></i> Editar
                </button>
                <button onclick="event.stopPropagation(); eliminarCliente('${c.id}', '${c.nombre.replace(/'/g, "\\'")}')" class="p-2 text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 shadow-sm border border-slate-200 rounded-lg hover:border-red-200 transition-all focus:outline-none">
                    <i data-feather="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </li>
        `;
    }).join('');

    feather.replace();
}

// Buscador de clientes
document.getElementById('buscadorClientes').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtrados = clientesGlobales.filter(c => 
        (c.nombre && c.nombre.toLowerCase().includes(query)) || 
        (c.telefono && c.telefono.includes(query))
    );
    renderizarClientes(filtrados);
});

// Editar Cliente
// Abrir Perfil del Cliente
async function abrirPerfilCliente(id) {
    const cliente = clientesGlobales.find(c => c.id === id);
    if (!cliente) return;

    // Llenar info básica
    const inicial = cliente.nombre ? cliente.nombre.charAt(0).toUpperCase() : '?';
    document.getElementById('perfilClienteInicial').innerText = inicial;
    document.getElementById('perfilClienteNombre').innerText = cliente.nombre;
    document.getElementById('perfilClienteTelefono').querySelector('span').innerText = cliente.telefono;
    document.getElementById('perfilClienteDireccion').innerText = cliente.direccion_detalles || 'No se ha registrado una dirección detallada.';
    
    // Botones de Contacto Rápido
    const telLimpio = cliente.telefono.replace(/\D/g, '');
    const wsMsg = encodeURIComponent(`Hola ${cliente.nombre}, soy el repartidor. ¡Ya estoy en su domicilio con su pedido!`);
    document.getElementById('perfilAccionesContacto').innerHTML = `
        <a href="tel:${telLimpio}" class="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 p-1.5 rounded-md transition-colors shadow-sm" title="Llamar">
            <i data-feather="phone-call" class="w-3.5 h-3.5"></i>
        </a>
        <a href="https://wa.me/52${telLimpio}?text=${wsMsg}" target="_blank" class="bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 p-1.5 rounded-md transition-colors shadow-sm" title="WhatsApp">
            <i data-feather="message-circle" class="w-3.5 h-3.5"></i>
        </a>
    `;

    // Configurar botón editar
    document.getElementById('btnAbrirEdicionDesdePerfil').onclick = function() {
        cerrarPerfilCliente();
        setTimeout(() => abrirModalCliente(cliente.id), 300);
    };

    // Galería Permanente del Cliente
    const galeriaFija = document.getElementById('perfilClienteGaleriaFija');
    const contenedorFija = document.getElementById('perfilClienteGaleriaContenedor');
    if (cliente.fotos && cliente.fotos.length > 0) {
        galeriaFija.classList.remove('hidden');
        contenedorFija.innerHTML = cliente.fotos.map(url => `
            <a href="${url}" target="_blank" class="flex-shrink-0 snap-center">
                <img src="${url}" class="w-20 h-20 object-cover rounded-xl border border-slate-200 shadow-sm hover:opacity-80 transition-opacity">
            </a>
        `).join('');
    } else {
        galeriaFija.classList.add('hidden');
        contenedorFija.innerHTML = '';
    }

    // UI de Carga
    const historialContainer = document.getElementById('perfilClienteHistorial');
    const badgeTotal = document.getElementById('perfilClienteTotalPedidos');
    badgeTotal.innerText = 'Buscando...';
    historialContainer.innerHTML = '<div class="text-center py-8 text-slate-400"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto mb-3"></div>Buscando historial de pedidos...</div>';

    // Abrir Modal
    const overlay = document.getElementById('modalPerfilClienteOverlay');
    const content = document.getElementById('modalPerfilClienteContent');
    overlay.classList.remove('hidden', 'pointer-events-none');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);

    // Cargar historial
    try {
        const response = await fetch(`/api/clientes/${cliente.telefono}/pedidos`, {
            headers: { 'Authorization': `Bearer ${tokenAdmin}` }
        });
        if (response.ok) {
            const pedidos = await response.json();
            badgeTotal.innerText = `${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''}`;
            
            if (pedidos.length === 0) {
                historialContainer.innerHTML = `
                    <div class="text-center py-8 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <i data-feather="shopping-cart" class="w-8 h-8 text-slate-300 mx-auto mb-2"></i>
                        <p class="text-slate-500 font-medium">No hay historial de pedidos</p>
                    </div>`;
            } else {
                historialContainer.innerHTML = pedidos.map(p => {
                    const fechaObj = new Date(p.created_at);
                    const fechaCorto = fechaObj.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
                    const horaCorto = fechaObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                    
                    let fotosHTML = '';
                    if (p.fotos && p.fotos.length > 0) {
                        const imgs = p.fotos.map(url => `
                            <a href="${url}" target="_blank" class="flex-shrink-0 snap-center">
                                <img src="${url}" class="w-16 h-16 object-cover rounded-xl border border-slate-200 shadow-sm hover:opacity-80 transition-opacity">
                            </a>
                        `).join('');
                        fotosHTML = `
                            <div class="mb-3">
                                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Evidencia Fotográfica</p>
                                <div class="flex gap-2 overflow-x-auto pb-1 snap-x">
                                    ${imgs}
                                </div>
                            </div>
                        `;
                    }

                    let btnMapsHTML = '';
                    if (p.lat && p.lng) {
                        btnMapsHTML = `
                            <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" class="text-xs font-bold text-white bg-slate-900 hover:bg-black px-3 py-2 rounded-lg transition-colors flex items-center gap-1 flex-1 justify-center shadow-md">
                                <i data-feather="map-pin" class="w-3 h-3"></i> Trazar Ruta
                            </a>
                        `;
                    }

                    return `
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <i data-feather="shopping-bag" class="w-4 h-4"></i>
                                </div>
                                <div>
                                    <h5 class="font-bold text-slate-900">${p.negocio_slug}</h5>
                                    <p class="text-xs text-slate-500">${fechaCorto} • ${horaCorto}</p>
                                </div>
                            </div>
                            <span class="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-lg">Envío: $${p.costo_envio}</span>
                        </div>
                        <p class="text-sm text-slate-600 mb-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <i data-feather="map-pin" class="w-3 h-3 inline mr-1 text-slate-400"></i>
                            ${p.direccion_detalles || 'Sin detalles'}
                        </p>
                        
                        ${fotosHTML}

                        <div class="flex gap-2 mt-2">
                            <a href="/${p.negocio_slug}" target="_blank" class="text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-2 rounded-lg transition-colors flex items-center gap-1 flex-1 justify-center border border-brand-100">
                                <i data-feather="external-link" class="w-3 h-3"></i> Visitar Tienda
                            </a>
                            ${btnMapsHTML}
                        </div>
                    </div>`;
                }).join('');
            }
            feather.replace();
        } else {
            historialContainer.innerHTML = '<p class="text-sm text-red-500 text-center py-4 bg-red-50 rounded-xl">No se pudo cargar el historial.</p>';
        }
    } catch (err) {
        historialContainer.innerHTML = '<p class="text-sm text-red-500 text-center py-4 bg-red-50 rounded-xl">Error de conexión.</p>';
    }
}

function cerrarPerfilCliente() {
    const overlay = document.getElementById('modalPerfilClienteOverlay');
    const content = document.getElementById('modalPerfilClienteContent');
    overlay.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => overlay.classList.add('hidden', 'pointer-events-none'), 300);
}

let mapaClienteObj = null;
let pinClienteObj = null;

function inicializarMapaCliente(lat, lng) {
    const latInput = document.getElementById('clienteLat');
    const lngInput = document.getElementById('clienteLng');

    // Limpiar inputs
    latInput.value = lat || '';
    lngInput.value = lng || '';

    // Coordenadas por defecto (Centro) si no hay lat/lng
    const startLat = lat || 24.1426;
    const startLng = lng || -110.3127;
    const zoom = lat ? 16 : 13;

    if (!mapaClienteObj) {
        mapaClienteObj = L.map('mapaClienteForm').setView([startLat, startLng], zoom);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(mapaClienteObj);

        mapaClienteObj.on('click', function(e) {
            const nuevaLat = e.latlng.lat;
            const nuevaLng = e.latlng.lng;
            latInput.value = nuevaLat;
            lngInput.value = nuevaLng;

            if (pinClienteObj) {
                pinClienteObj.setLatLng([nuevaLat, nuevaLng]);
            } else {
                pinClienteObj = L.marker([nuevaLat, nuevaLng], { icon: redIcon }).addTo(mapaClienteObj);
            }
        });
    } else {
        mapaClienteObj.setView([startLat, startLng], zoom);
        if (pinClienteObj) {
            mapaClienteObj.removeLayer(pinClienteObj);
            pinClienteObj = null;
        }
    }

    if (lat && lng) {
        pinClienteObj = L.marker([lat, lng], { icon: redIcon }).addTo(mapaClienteObj);
    }

    // Workaround para que Leaflet renderice bien dentro de un modal oculto
    setTimeout(() => {
        mapaClienteObj.invalidateSize();
    }, 150);
}

let fotosClienteBase64 = [];

// Editar Cliente
function abrirModalCliente(id) {
    const cliente = clientesGlobales.find(c => c.id === id);
    if (!cliente) return;

    document.getElementById('clienteIdEditando').value = cliente.id;
    document.getElementById('clienteNombre').value = cliente.nombre || '';
    document.getElementById('clienteTelefono').value = cliente.telefono || '';
    document.getElementById('clienteDireccion').value = cliente.direccion_detalles || '';

    fotosClienteBase64 = [];
    const previewContainer = document.getElementById('clienteFotosPreview');
    previewContainer.innerHTML = '';
    document.getElementById('clienteFotos').value = '';

    if (cliente.fotos && cliente.fotos.length > 0) {
        previewContainer.classList.remove('hidden');
        cliente.fotos.forEach(url => {
            const imgHTML = `
                <div class="relative w-16 h-16 flex-shrink-0 group rounded-xl overflow-hidden shadow-sm border border-slate-200">
                    <img src="${url}" class="w-full h-full object-cover">
                </div>
            `;
            previewContainer.insertAdjacentHTML('beforeend', imgHTML);
        });
    } else {
        previewContainer.classList.add('hidden');
    }

    const overlay = document.getElementById('modalEditarClienteOverlay');
    const content = document.getElementById('modalEditarClienteContent');
    overlay.classList.remove('hidden', 'pointer-events-none');
    
    inicializarMapaCliente(cliente.lat, cliente.lng);

    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

function cerrarModalCliente() {
    const overlay = document.getElementById('modalEditarClienteOverlay');
    const content = document.getElementById('modalEditarClienteContent');
    overlay.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => overlay.classList.add('hidden', 'pointer-events-none'), 300);
}

// Nuevo Cliente
function abrirModalNuevoCliente() {
    document.getElementById('clienteIdEditando').value = '';
    document.getElementById('clienteNombre').value = '';
    document.getElementById('clienteTelefono').value = '';
    document.getElementById('clienteDireccion').value = '';

    fotosClienteBase64 = [];
    document.getElementById('clienteFotosPreview').innerHTML = '';
    document.getElementById('clienteFotosPreview').classList.add('hidden');
    document.getElementById('clienteFotos').value = '';

    const overlay = document.getElementById('modalEditarClienteOverlay');
    const content = document.getElementById('modalEditarClienteContent');
    overlay.classList.remove('hidden', 'pointer-events-none');
    
    inicializarMapaCliente(null, null);

    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

// Lógica de carga de fotos
document.getElementById('clienteFotos').addEventListener('change', function(e) {
    const files = e.target.files;
    const previewContainer = document.getElementById('clienteFotosPreview');
    
    if (files.length > 0) {
        previewContainer.classList.remove('hidden');
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        const reader = new FileReader();
        reader.onload = function(event) {
            const base64 = event.target.result;
            fotosClienteBase64.push(base64);
            
            const imgHTML = `
                <div class="relative w-16 h-16 flex-shrink-0 group rounded-xl overflow-hidden shadow-sm">
                    <img src="${base64}" class="w-full h-full object-cover">
                </div>
            `;
            previewContainer.insertAdjacentHTML('beforeend', imgHTML);
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('formEditarCliente').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('clienteIdEditando').value;
    const nombre = document.getElementById('clienteNombre').value;
    const telefono = document.getElementById('clienteTelefono').value;
    const direccion_detalles = document.getElementById('clienteDireccion').value;
    const lat = document.getElementById('clienteLat').value;
    const lng = document.getElementById('clienteLng').value;

    const btn = document.getElementById('btnGuardarCliente');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';
    btn.disabled = true;

    try {
        let response;
        if (id) {
            // Actualizar
            response = await fetch(`/api/clientes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenAdmin}` },
                body: JSON.stringify({ nombre, telefono, direccion_detalles, lat, lng, fotos: fotosClienteBase64 })
            });
        } else {
            // Crear
            response = await fetch(`/api/clientes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenAdmin}` },
                body: JSON.stringify({ nombre, telefono, direccion_detalles, lat, lng, fotos: fotosClienteBase64 })
            });
        }

        if (response.status === 401) { cerrarSesion(); return; }
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error al guardar el cliente');
        }

        cerrarModalCliente();
        cargarClientes();
        
        // Refrescar el Dashboard también si estamos creando un nuevo cliente
        if (!id && document.getElementById('vista-resumen') && !document.getElementById('vista-resumen').classList.contains('hidden')) {
            cargarDatosDashboard();
        }
    } catch (err) {
        alert(err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

// Eliminar Cliente
function eliminarCliente(id, nombre) {
    idParaBorrar = id;
    tipoBorrado = 'cliente';
    document.getElementById('nombreBorrarDestacado').innerText = `"${nombre}"`;
    document.getElementById('textoAdicionalBorrar').classList.add('hidden'); // Ocultar texto de 'TODOS SUS PEDIDOS'
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
}

// ============================================================================
// 11. MÓDULO DE RADAR / PEDIDOS
// ============================================================================

async function cargarPedidosRadar() {
    try {
        const response = await fetch('/api/pedidos', {
            headers: { 'Authorization': `Bearer ${tokenAdmin}` }
        });

        if (response.status === 401) { cerrarSesion(); return; }

        const pedidos = await response.json();
        pedidosGlobales = pedidos;
        renderizarPedidosRadar(pedidosGlobales);
    } catch (err) {
        console.error("Error al cargar pedidos del radar", err);
    }
}

function renderizarPedidosRadar(pedidos) {
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
        
        return `
        <div onclick="abrirDetallePedido('${p.id}')" class="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all group">
            <div class="flex justify-between items-start mb-3">
                <div class="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                    <i data-feather="clock" class="w-3 h-3"></i> ${fecha}
                </div>
                <div class="text-slate-400 group-hover:text-blue-500 transition-colors">
                    <i data-feather="chevron-right" class="w-5 h-5"></i>
                </div>
            </div>
            <h3 class="font-bold text-slate-900 text-lg line-clamp-1 mb-1">${p.nombre_cliente || 'Cliente'}</h3>
            <p class="text-sm text-slate-500 flex items-center gap-1.5 mb-3"><i data-feather="shopping-bag" class="w-3.5 h-3.5"></i> ${p.negocio_slug}</p>
            
            <div class="pt-3 border-t border-slate-100 flex justify-between items-center text-sm font-bold">
                <span class="text-slate-600">Envío:</span>
                <span class="text-green-600 bg-green-50 px-2 py-0.5 rounded-md">$${p.costo_envio} MXN</span>
            </div>
        </div>
        `;
    }).join('');

    feather.replace();
}

function abrirDetallePedido(id) {
    const p = pedidosGlobales.find(x => x.id === id);
    if (!p) return;

    // Llenar Modal
    document.getElementById('pedidoNombreCliente').innerText = p.nombre_cliente || 'Desconocido';
    document.getElementById('pedidoTelefono').querySelector('span').innerText = p.telefono || 'Sin teléfono';
    document.getElementById('pedidoNegocio').innerText = p.negocio_slug;
    
    // Botones de Contacto
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

    // Fotos
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

    // Maps Link
    const btnMaps = document.getElementById('btnGoogleMapsPedido');
    if (p.lat && p.lng) {
        btnMaps.href = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
        btnMaps.classList.remove('hidden');
    } else {
        btnMaps.classList.add('hidden');
    }

    // Mostrar modal
    const overlay = document.getElementById('modalDetallePedidoOverlay');
    const content = document.getElementById('modalDetallePedidoContent');
    overlay.classList.remove('hidden', 'pointer-events-none');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
    feather.replace();
}

function cerrarModalPedido() {
    const overlay = document.getElementById('modalDetallePedidoOverlay');
    const content = document.getElementById('modalDetallePedidoContent');
    overlay.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => overlay.classList.add('hidden', 'pointer-events-none'), 300);
}

// ============================================================================
// BOOTSTRAP (ARRANQUE DE LA APP)
// ============================================================================
cambiarVista('resumen'); // Comienza siempre en la vista de resumen al cargar la página
