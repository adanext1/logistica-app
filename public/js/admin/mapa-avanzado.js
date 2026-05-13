import { state } from './state.js';

let mapaAvanzado = null;
let markersLayer = L.layerGroup();
let radiosLayer = L.layerGroup();
let routesLayer = L.layerGroup();
let currentHeatLayer = null;
let currentRentLayer = null;
let baseLayer = null;
let darkLayer = null;
let satLayer = null;




export function inicializarMapaAvanzado() {
    if (mapaAvanzado) {
        mapaAvanzado.invalidateSize();
        actualizarSelectNegocios();
        return;
    }

    // Inicializar Mapa
    mapaAvanzado = L.map('mapaAvanzadoFull').setView([24.1426, -110.3127], 13);
    
    baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    });
    
    darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    baseLayer.addTo(mapaAvanzado);

    markersLayer.addTo(mapaAvanzado);
    routesLayer.addTo(mapaAvanzado);


    
    // Llenar select de negocios
    actualizarSelectNegocios();
    
    // Renderizar marcadores iniciales
    renderizarMarcadores();
    
    // Exponer funciones globales para el HTML
    window.toggleHeatmapAvanzado = toggleHeatmapAvanzado;
    window.toggleHeatmapRentabilidad = toggleHeatmapRentabilidad;
    window.toggleRadiosCobertura = toggleRadiosCobertura;
    window.toggleCapaNegocios = toggleCapaNegocios;
    window.toggleModoOscuroMapa = toggleModoOscuroMapa;
    window.toggleVistaSatelite = toggleVistaSatelite;
    window.toggleRutasSpider = toggleRutasSpider;
    window.actualizarMapaAvanzado = actualizarMapaAvanzado;
    window.toggleMenuMapa = toggleMenuMapa;
    window.filtrarListaMapa = filtrarListaMapa;


    setTimeout(() => mapaAvanzado.invalidateSize(), 300);
}

export function toggleModoOscuroMapa(activar) {
    if (!mapaAvanzado) return;

    if (activar) {
        mapaAvanzado.removeLayer(baseLayer);
        mapaAvanzado.removeLayer(satLayer);
        darkLayer.addTo(mapaAvanzado);
        document.getElementById('checkSatelite').checked = false;
    } else {
        mapaAvanzado.removeLayer(darkLayer);
        baseLayer.addTo(mapaAvanzado);
    }
}

export function toggleVistaSatelite(activar) {
    if (!mapaAvanzado) return;

    if (activar) {
        mapaAvanzado.removeLayer(baseLayer);
        mapaAvanzado.removeLayer(darkLayer);
        satLayer.addTo(mapaAvanzado);
        document.getElementById('checkOscuro').checked = false;
    } else {
        mapaAvanzado.removeLayer(satLayer);
        baseLayer.addTo(mapaAvanzado);
    }
}




export function toggleMenuMapa() {
    const menu = document.getElementById('menuMapaAvanzado');
    const btnToggle = document.getElementById('btnToggleMapa');
    const estaVisible = !menu.classList.contains('translate-y-full');

    if (estaVisible) {
        // Cerrar menú
        menu.classList.add('translate-y-full');
        btnToggle.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
    } else {
        // Abrir menú
        menu.classList.remove('translate-y-full');
        btnToggle.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
    }
    feather.replace();
}


function actualizarSelectNegocios() {
    const select = document.getElementById('filtroMapaNegocio');
    if (!select) return;

    // Guardar valor actual
    const currentVal = select.value;
    
    select.innerHTML = '<option value="todos" class="bg-slate-900 text-white font-bold">Todos los Negocios</option>';
    state.negociosGlobales.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n.slug;
        opt.textContent = n.nombre_comercial;
        opt.className = "bg-slate-900 text-white py-2"; // Asegurar colores oscuros en las opciones
        select.appendChild(opt);
    });

    select.value = currentVal;
}

export function filtrarListaMapa(query) {
    const select = document.getElementById('filtroMapaNegocio');
    const q = query.toLowerCase();
    
    // Filtrar visualmente el select (en navegadores modernos esto es limitado, 
    // pero podemos reconstruirlo)
    select.innerHTML = '<option value="todos" class="bg-slate-900 text-white font-bold">Todos los Negocios</option>';
    
    state.negociosGlobales
        .filter(n => n.nombre_comercial.toLowerCase().includes(q))
        .forEach(n => {
            const opt = document.createElement('option');
            opt.value = n.slug;
            opt.textContent = n.nombre_comercial;
            opt.className = "bg-slate-900 text-white py-2";
            select.appendChild(opt);
        });
}

function renderizarMarcadores() {
    markersLayer.clearLayers();
    
    state.negociosGlobales.forEach(n => {
        if (n.lat && n.lng) {
            const marker = L.marker([n.lat, n.lng])
                .bindPopup(`<b>${n.nombre_comercial}</b><br>Plan: ${n.plan.toUpperCase()}`);
            markersLayer.addLayer(marker);
        }
    });
}

export function toggleHeatmapAvanzado(activar) {
    if (!mapaAvanzado) return;

    if (currentHeatLayer) {
        mapaAvanzado.removeLayer(currentHeatLayer);
        currentHeatLayer = null;
    }

    if (activar) {
        const slugFiltro = document.getElementById('filtroMapaNegocio').value;
        const puntos = state.pedidosGlobales
            .filter(p => {
                const matchNegocio = (slugFiltro === 'todos' || p.negocio_slug === slugFiltro);
                return matchNegocio && p.lat && p.lng;
            })
            .map(p => [parseFloat(p.lat), parseFloat(p.lng), 0.5]);

        if (puntos.length === 0) {
            alert("No hay pedidos con ubicación para este filtro.");
            document.getElementById('checkHeatmap').checked = false;
            return;
        }

        currentHeatLayer = L.heatLayer(puntos, {
            radius: 25, blur: 15, maxZoom: 17
        }).addTo(mapaAvanzado);
    }
}

export function toggleHeatmapRentabilidad(activar) {
    if (!mapaAvanzado) return;

    if (currentRentLayer) {
        mapaAvanzado.removeLayer(currentRentLayer);
        currentRentLayer = null;
    }

    if (activar) {
        const slugFiltro = document.getElementById('filtroMapaNegocio').value;
        const pedidos = state.pedidosGlobales.filter(p => {
            const matchNegocio = (slugFiltro === 'todos' || p.negocio_slug === slugFiltro);
            return matchNegocio && p.lat && p.lng;
        });

        if (pedidos.length === 0) {
            alert("No hay pedidos con ubicación para este filtro.");
            document.getElementById('checkRentabilidad').checked = false;
            return;
        }

        // Encontrar el valor máximo para normalizar intensidad
        const maxVal = Math.max(...pedidos.map(p => parseFloat(p.total_pedido) || parseFloat(p.costo_envio) || 0), 1);

        const puntos = pedidos.map(p => {
            const val = parseFloat(p.total_pedido) || parseFloat(p.costo_envio) || 0;
            return [parseFloat(p.lat), parseFloat(p.lng), val / maxVal]; // Intensidad basada en dinero
        });

        currentRentLayer = L.heatLayer(puntos, {
            radius: 30, blur: 20, maxZoom: 17,
            gradient: {0.4: '#c0c0c0', 0.6: '#32cd32', 0.9: '#10b981', 1: '#059669'} // Colores de "Dinero" (Plata -> Lima -> Esmeralda -> Verde)
        }).addTo(mapaAvanzado);
    }
}

export function toggleRadiosCobertura(activar) {
    if (!mapaAvanzado) return;

    radiosLayer.clearLayers();
    if (activar) {
        const slugFiltro = document.getElementById('filtroMapaNegocio').value;
        state.negociosGlobales.forEach(n => {
            if (n.lat && n.lng && (slugFiltro === 'todos' || n.slug === slugFiltro)) {
                // Calcular el pedido más lejano registrado para este negocio
                const pedidosNegocio = state.pedidosGlobales.filter(p => p.negocio_slug === n.slug && p.lat && p.lng);
                
                let radioMts = 1000; // Radio mínimo por defecto (1km)
                
                if (pedidosNegocio.length > 0) {
                    const centro = L.latLng(n.lat, n.lng);
                    const distancias = pedidosNegocio.map(p => centro.distanceTo(L.latLng(p.lat, p.lng)));
                    radioMts = Math.max(...distancias);
                }

                let colorRadio = '#8b5cf6'; // Violeta por defecto
                if (n.plan === 'premium') colorRadio = '#f59e0b';
                if (n.plan === 'basic') colorRadio = '#64748b';

                const circle = L.circle([n.lat, n.lng], {
                    radius: radioMts,
                    color: colorRadio,
                    fillColor: colorRadio,
                    fillOpacity: 0.05,
                    weight: 2,
                    dashArray: '10, 10'
                }).bindPopup(`
                    <div class="p-2">
                        <b class="text-slate-900">${n.nombre_comercial}</b><br>
                        <span class="text-xs text-slate-500">Radio Histórico: ${(radioMts/1000).toFixed(2)} km</span><br>
                        <span class="text-xs text-slate-500">Total Pedidos: ${pedidosNegocio.length}</span>
                    </div>
                `);
                radiosLayer.addLayer(circle);
            }
        });
        radiosLayer.addTo(mapaAvanzado);
    }
}

export function toggleRutasSpider(activar) {
    if (!mapaAvanzado) return;

    routesLayer.clearLayers();
    if (activar) {
        const slugFiltro = document.getElementById('filtroMapaNegocio').value;
        
        state.negociosGlobales.forEach(n => {
            if (n.lat && n.lng && (slugFiltro === 'todos' || n.slug === slugFiltro)) {
                const pedidosNegocio = state.pedidosGlobales.filter(p => p.negocio_slug === n.slug && p.lat && p.lng);
                
                pedidosNegocio.forEach(p => {
                    const latlngs = [
                        [n.lat, n.lng],
                        [p.lat, p.lng]
                    ];
                    const polyline = L.polyline(latlngs, {
                        color: n.plan === 'premium' ? '#fbbf24' : '#3b82f6', // Ambar brillante o Azul vibrante
                        weight: 2,
                        opacity: 0.8,
                        dashArray: '5, 10'
                    });
                    routesLayer.addLayer(polyline);
                });
            }
        });
    }
}

export function toggleCapaNegocios(activar) {
    if (activar) {
        markersLayer.addTo(mapaAvanzado);
    } else {
        markersLayer.removeFrom(mapaAvanzado);
    }
}

export function actualizarMapaAvanzado() {
    // Si el heatmap de actividad está activo, refrescarlo
    if (document.getElementById('checkHeatmap').checked) {
        toggleHeatmapAvanzado(true);
    }
    // Si el heatmap de rentabilidad está activo, refrescarlo
    if (document.getElementById('checkRentabilidad').checked) {
        toggleHeatmapRentabilidad(true);
    }
    // Si los radios de cobertura están activos, refrescarlos
    if (document.getElementById('checkRadios').checked) {
        toggleRadiosCobertura(true);
    }
    // Si las rutas araña están activas, refrescarlas
    if (document.getElementById('checkRutas').checked) {
        toggleRutasSpider(true);
    }
}
