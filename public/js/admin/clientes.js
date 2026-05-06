import { state } from './state.js';
import { fetchConAuth, tokenAdmin, cerrarSesion } from './auth.js';
import { cargarDatosDashboard } from './dashboard.js';

export async function cargarClientes() {
    try {
        const response = await fetch('/api/clientes', {
            headers: { 'Authorization': `Bearer ${tokenAdmin}` }
        });

        if (response.status === 401) { cerrarSesion(); return; }

        const clientes = await response.json();
        state.clientesGlobales = clientes;
        renderizarClientes(state.clientesGlobales);
    } catch (err) {
        console.error("Error al cargar clientes", err);
    }
}

export function renderizarClientes(clientes) {
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

export async function abrirPerfilCliente(id) {
    const cliente = state.clientesGlobales.find(c => c.id === id);
    if (!cliente) return;

    // Llenar info básica
    const inicial = cliente.nombre ? cliente.nombre.charAt(0).toUpperCase() : '?';
    document.getElementById('perfilClienteInicial').innerText = inicial;
    document.getElementById('perfilClienteNombre').innerText = cliente.nombre;
    document.getElementById('perfilClienteTelefono').querySelector('span').innerText = cliente.telefono;
    document.getElementById('perfilClienteDireccion').innerText = cliente.direccion_detalles || 'No se ha registrado una dirección detallada.';
    
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

    document.getElementById('btnAbrirEdicionDesdePerfil').onclick = function() {
        cerrarPerfilCliente();
        setTimeout(() => abrirModalCliente(cliente.id), 300);
    };

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

    const historialContainer = document.getElementById('perfilClienteHistorial');
    const badgeTotal = document.getElementById('perfilClienteTotalPedidos');
    badgeTotal.innerText = 'Buscando...';
    historialContainer.innerHTML = '<div class="text-center py-8 text-slate-400"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto mb-3"></div>Buscando historial de pedidos...</div>';

    const overlay = document.getElementById('modalPerfilClienteOverlay');
    const content = document.getElementById('modalPerfilClienteContent');
    overlay.classList.remove('hidden', 'pointer-events-none');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);

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

export function cerrarPerfilCliente() {
    const overlay = document.getElementById('modalPerfilClienteOverlay');
    const content = document.getElementById('modalPerfilClienteContent');
    overlay.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => overlay.classList.add('hidden', 'pointer-events-none'), 300);
}

export function inicializarMapaCliente(lat, lng) {
    const latInput = document.getElementById('clienteLat');
    const lngInput = document.getElementById('clienteLng');

    latInput.value = lat || '';
    lngInput.value = lng || '';

    const startLat = lat || 24.1426;
    const startLng = lng || -110.3127;
    const zoom = lat ? 16 : 13;

    if (!state.mapaClienteObj) {
        state.mapaClienteObj = L.map('mapaClienteForm').setView([startLat, startLng], zoom);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(state.mapaClienteObj);

        state.mapaClienteObj.on('click', function(e) {
            const nuevaLat = e.latlng.lat;
            const nuevaLng = e.latlng.lng;
            latInput.value = nuevaLat;
            lngInput.value = nuevaLng;

            if (state.pinClienteObj) {
                state.pinClienteObj.setLatLng([nuevaLat, nuevaLng]);
            } else {
                const redIcon = new L.Icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });
                state.pinClienteObj = L.marker([nuevaLat, nuevaLng], { icon: redIcon }).addTo(state.mapaClienteObj);
            }
        });
    } else {
        state.mapaClienteObj.setView([startLat, startLng], zoom);
        if (state.pinClienteObj) {
            state.mapaClienteObj.removeLayer(state.pinClienteObj);
            state.pinClienteObj = null;
        }
    }

    if (lat && lng) {
        const redIcon = new L.Icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
        state.pinClienteObj = L.marker([lat, lng], { icon: redIcon }).addTo(state.mapaClienteObj);
    }

    setTimeout(() => {
        state.mapaClienteObj.invalidateSize();
    }, 150);
}

export function abrirModalCliente(id) {
    const cliente = state.clientesGlobales.find(c => c.id === id);
    if (!cliente) return;

    document.getElementById('clienteIdEditando').value = cliente.id;
    document.getElementById('clienteNombre').value = cliente.nombre || '';
    document.getElementById('clienteTelefono').value = cliente.telefono || '';
    document.getElementById('clienteDireccion').value = cliente.direccion_detalles || '';

    state.fotosClienteBase64 = [];
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

export function cerrarModalCliente() {
    const overlay = document.getElementById('modalEditarClienteOverlay');
    const content = document.getElementById('modalEditarClienteContent');
    overlay.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => overlay.classList.add('hidden', 'pointer-events-none'), 300);
}

export function abrirModalNuevoCliente() {
    document.getElementById('clienteIdEditando').value = '';
    document.getElementById('clienteNombre').value = '';
    document.getElementById('clienteTelefono').value = '';
    document.getElementById('clienteDireccion').value = '';

    state.fotosClienteBase64 = [];
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

export function eliminarCliente(id, nombre) {
    state.idParaBorrar = id;
    state.tipoBorrado = 'cliente';
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

export function setupClientes() {
    document.getElementById('buscadorClientes')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtrados = state.clientesGlobales.filter(c => 
            (c.nombre && c.nombre.toLowerCase().includes(query)) || 
            (c.telefono && c.telefono.includes(query))
        );
        renderizarClientes(filtrados);
    });

    document.getElementById('clienteFotos')?.addEventListener('change', function(e) {
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
                state.fotosClienteBase64.push(base64);
                
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

    document.getElementById('formEditarCliente')?.addEventListener('submit', async function(e) {
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
                response = await fetch(`/api/clientes/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenAdmin}` },
                    body: JSON.stringify({ nombre, telefono, direccion_detalles, lat, lng, fotos: state.fotosClienteBase64 })
                });
            } else {
                response = await fetch(`/api/clientes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenAdmin}` },
                    body: JSON.stringify({ nombre, telefono, direccion_detalles, lat, lng, fotos: state.fotosClienteBase64 })
                });
            }

            if (response.status === 401) { cerrarSesion(); return; }
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error al guardar el cliente');
            }

            cerrarModalCliente();
            cargarClientes();
            
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
}
