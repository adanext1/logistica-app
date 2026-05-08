import { state } from './state.js';
import { tokenAdmin, cerrarSesion } from './auth.js';
import { cambiarVista } from './navigation.js';
import { cargarDatosDashboard } from './dashboard.js';

/**
 * Genera el HTML de la lista de negocios y actualiza los pines del mapa global.
 * @param {Array} negociosAMostrar - Arreglo de objetos negocio
 */
export function renderizarNegocios(negociosAMostrar) {
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
        if (state.mapaGlobal) {
            state.pinesGlobales.forEach(p => state.mapaGlobal.removeLayer(p));
            state.pinesGlobales = [];
        }
        feather.replace();
        return;
    }

    // --- ACTUALIZAR MAPA GLOBAL ---
    if (state.mapaGlobal) {
        // Borrar pines antiguos antes de pintar
        state.pinesGlobales.forEach(p => state.mapaGlobal.removeLayer(p));
        state.pinesGlobales = [];
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

                const marker = L.marker([n.lat, n.lng], {icon: customIcon}).addTo(state.mapaGlobal)
                    .bindPopup(popupHtml, { minWidth: 130 });
                state.pinesGlobales.push(marker);
                bounds.extend([n.lat, n.lng]);
            }
        });

        // Auto-encuadrar el mapa para que todos los pines quepan en la pantalla
        if (state.pinesGlobales.length > 0) {
            state.mapaGlobal.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        }
        setTimeout(() => state.mapaGlobal.invalidateSize(), 100);
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
                    <!-- Dropdown menu -->
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
    
    feather.replace(); // Volver a renderizar iconos
}

export function abrirFormularioNegocio(slug = null) {
    state.negocioEditandoSlug = slug;
    state.logoBase64 = null; // Reiniciar imagen
    
    // Elementos visuales del logo
    const preview = document.getElementById('logoPreview');
    const placeholder = document.getElementById('logoPlaceholder');
    preview.src = '';
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    
    if (slug) {
        // MODO EDICIÓN
        const n = state.negociosGlobales.find(x => x.slug === slug);
        if (n) {
            document.getElementById('nombre').value = n.nombre_comercial;
            document.getElementById('whatsapp').value = n.whatsapp;
            document.getElementById('plan').value = n.plan || 'basico';
            document.getElementById('usuario').value = n.usuario || '';
            document.getElementById('pin').value = n.pin || '';
            document.getElementById('lat').value = n.lat || '';
            document.getElementById('lng').value = n.lng || '';
            
            document.getElementById('tituloFormularioNegocio').innerText = 'Editar Negocio';
            document.getElementById('btnSubmitNegocio').innerHTML = '<span>Guardar Cambios</span> <i data-feather="save" class="w-5 h-5"></i>';
            const btnM = document.getElementById('btnSubmitNegocioMobile');
            if (btnM) btnM.innerHTML = '<span>Guardar Cambios</span> <i data-feather="save" class="w-5 h-5"></i>';
            
            if (n.logo_url) {
                preview.src = n.logo_url;
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');
            }
        }
    } else {
        // MODO CREACIÓN
        document.getElementById('formNegocio').reset();
        document.getElementById('usuario').value = '';
        document.getElementById('pin').value = '';
        document.getElementById('lat').value = '';
        document.getElementById('lng').value = '';
        
        document.getElementById('tituloFormularioNegocio').innerText = 'Alta de Negocio';
        document.getElementById('btnSubmitNegocio').innerHTML = '<span>Guardar Negocio</span> <i data-feather="check-circle" class="w-5 h-5"></i>';
        const btnM = document.getElementById('btnSubmitNegocioMobile');
        if (btnM) btnM.innerHTML = '<span>Guardar Negocio</span> <i data-feather="check-circle" class="w-5 h-5"></i>';
        
        if (state.pinActual && state.mapaAdmin) { 
            state.mapaAdmin.removeLayer(state.pinActual); 
            state.pinActual = null; 
        }
    }
    feather.replace();

    cambiarVista('formulario-negocio');

    // Inicializar o ajustar mapa
    setTimeout(() => {
        if (!state.mapaAdmin) {
            state.mapaAdmin = L.map('mapaAdmin', { zoomControl: false }).setView([24.1426, -110.3127], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.mapaAdmin);
            
            state.mapaAdmin.on('click', function (e) {
                const lat = e.latlng.lat.toFixed(6);
                const lng = e.latlng.lng.toFixed(6);
                
                if (state.pinActual) {
                    state.pinActual.setLatLng(e.latlng);
                } else {
                    const customIcon = L.divIcon({
                        className: 'custom-pin',
                        html: `<div class="w-5 h-5 bg-brand-600 rounded-full border-2 border-white shadow-md"></div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });
                    state.pinActual = L.marker(e.latlng, {icon: customIcon}).addTo(state.mapaAdmin);
                }
                
                document.getElementById('lat').value = lat;
                document.getElementById('lng').value = lng;
                state.mapaAdmin.panTo(e.latlng);
            });
        }
        
        if (slug && document.getElementById('lat').value) {
            const lat = parseFloat(document.getElementById('lat').value);
            const lng = parseFloat(document.getElementById('lng').value);
            const latlng = [lat, lng];
            
            if (state.pinActual) {
                state.pinActual.setLatLng(latlng);
            } else {
                const customIcon = L.divIcon({
                    className: 'custom-pin',
                    html: `<div class="w-5 h-5 bg-brand-600 rounded-full border-2 border-white shadow-md"></div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
                state.pinActual = L.marker(latlng, {icon: customIcon}).addTo(state.mapaAdmin);
            }
            state.mapaAdmin.setView(latlng, 15);
        }

        setTimeout(() => state.mapaAdmin.invalidateSize(), 350);
    }, 100);
}

export function eliminarNegocio(slug, nombre) {
    state.idParaBorrar = slug;
    state.tipoBorrado = 'negocio';
    document.getElementById('nombreBorrarDestacado').innerText = `"${nombre}"`;
    document.getElementById('textoAdicionalBorrar').classList.remove('hidden');
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

// Set up event listeners for this module
export function setupNegocios() {
    // Buscador
    const buscador = document.getElementById('buscadorNegocios');
    if (buscador) {
        buscador.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const negociosFiltrados = state.negociosGlobales.filter(n => 
                n.nombre_comercial.toLowerCase().includes(query)
            );
            renderizarNegocios(negociosFiltrados);
        });
    }

    // Input Logo (Compresión)
    const logoInput = document.getElementById('logoInput');
    if (logoInput) {
        logoInput.addEventListener('change', function(e) {
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

                    state.logoBase64 = canvas.toDataURL('image/jpeg', 0.7); 
                    
                    preview.src = state.logoBase64;
                    preview.classList.remove('hidden');
                    placeholder.classList.add('hidden');
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Submit Form
    const formNegocio = document.getElementById('formNegocio');
    if (formNegocio) {
        formNegocio.addEventListener('submit', async function (e) {
            e.preventDefault();
            
            const btn = document.getElementById('btnSubmitNegocio');
            const btnM = document.getElementById('btnSubmitNegocioMobile');
            const originalHtml = btn.innerHTML;
            const originalHtmlM = btnM ? btnM.innerHTML : '';
            
            btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';
            btn.disabled = true;
            if(btnM) { 
                btnM.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>'; 
                btnM.disabled = true; 
            }

            const nombre = document.getElementById('nombre').value;
            const whatsapp = document.getElementById('whatsapp').value;
            const plan = document.getElementById('plan').value;
            const usuario = document.getElementById('usuario').value;
            const pin = document.getElementById('pin').value;
            const lat = document.getElementById('lat').value;
            const lng = document.getElementById('lng').value;

            if (!lat || !lng) {
                alert("Debes tocar el mapa para indicar la ubicación.");
                btn.innerHTML = originalHtml; btn.disabled = false;
                if(btnM) { btnM.innerHTML = originalHtmlM; btnM.disabled = false; }
                return;
            }

            const url = state.negocioEditandoSlug ? `/api/negocios/${state.negocioEditandoSlug}` : '/api/negocios';
            const method = state.negocioEditandoSlug ? 'PUT' : 'POST';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${tokenAdmin}`
                    },
                    body: JSON.stringify({ nombre, whatsapp, plan, usuario, pin, lat, lng, logo_base64: state.logoBase64 })
                });

                if (response.status === 401) {
                    alert("Tu sesión expiró. Inicia sesión de nuevo.");
                    cerrarSesion();
                    return;
                }

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || "No se pudo guardar.");
                }

                document.getElementById('formNegocio').reset();
                state.logoBase64 = null;
                document.getElementById('logoPreview').classList.add('hidden');
                document.getElementById('logoPlaceholder').classList.remove('hidden');
                
                if (state.pinActual && state.mapaAdmin) { state.mapaAdmin.removeLayer(state.pinActual); state.pinActual = null; }
                
                cargarDatosDashboard(); 
                cambiarVista('negocios');
                setTimeout(() => alert(state.negocioEditandoSlug ? "¡Negocio actualizado!" : "¡Negocio registrado y en línea!"), 350);

            } catch (error) {
                alert(error.message);
            } finally {
                btn.innerHTML = originalHtml; btn.disabled = false;
                if(btnM) { btnM.innerHTML = originalHtmlM; btnM.disabled = false; }
            }
        });
    }
}
