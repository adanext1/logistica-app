import { state } from './state.js';
import { fetchConAuth } from './auth.js';
import { renderizarNegocios } from './negocios.js';

/**
 * Obtiene la lista de todos los negocios desde la API y renderiza el mapa y la lista.
 */
export async function cargarDatosDashboard() {
    try {
        // Ejecutar promesas en paralelo para mayor velocidad
        const [resNegocios, resClientes, resPedidos] = await Promise.all([
            fetch('/api/negocios'),
            fetchConAuth('/api/clientes'),
            fetchConAuth('/api/pedidos')
        ]);

        if (!resClientes || !resPedidos) return; // Session expired, redirecting

        const SLUG_PLATAFORMA = 'plataforma-rcr';

        let rawNegocios = [];
        if (resNegocios.ok) {
            try {
                rawNegocios = await resNegocios.json();
            } catch (e) {
                console.error("Error al parsear negocios:", e);
            }
        }
        
        // Filtrar el negocio base (nosotros mismos) para no ensuciar métricas
        const negocios = Array.isArray(rawNegocios) ? rawNegocios.filter(n => n.slug !== SLUG_PLATAFORMA) : [];
        state.negociosGlobales = negocios;
        
        let clientes = [];
        if (resClientes.ok) {
            clientes = await resClientes.json();
            state.clientesGlobales = clientes;
        }

        let rawPedidos = [];
        if (resPedidos.ok) {
            rawPedidos = await resPedidos.json();
        }
        // Filtrar pedidos que sean del negocio base para que no afecten finanzas
        const pedidos = rawPedidos.filter(p => p.negocio_slug !== SLUG_PLATAFORMA);
        state.pedidosGlobales = pedidos;

        // --- 1. ACTUALIZAR MÉTRICAS ---
        document.getElementById('statNegocios').innerText = negocios.length || 0;
        document.getElementById('statClientes').innerText = clientes.length || 0;
        
        // Ingresos de HOY solamente
        const hoy = new Date().toDateString();
        const pedidosHoy = pedidos.filter(p => new Date(p.created_at).toDateString() === hoy);
        const totalIngresosHoy = pedidosHoy.reduce((acc, p) => acc + (parseFloat(p.costo_envio) || 0), 0);
        document.getElementById('statIngresos').innerText = `$${totalIngresosHoy.toLocaleString('es-MX')}`;

        // Guardar pedidos para uso en el modal de finanzas
        state.pedidosFiltradosFinanzas = pedidos; 


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

        // El panel de "Clientes Recientes" se ha movido o reemplazado en el nuevo diseño de resumen.
        // Solo lo actualizamos si el elemento existe en el DOM.
        const contClientes = document.getElementById('dashboardUltimosClientes');
        if (contClientes) {
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
        }

        feather.replace();

        // Inicializar Mapa Global si es la primera vez
        if (!state.mapaGlobal && document.getElementById('mapaGlobalNegocios')) {
            state.mapaGlobal = L.map('mapaGlobalNegocios', { 
                dragging: !L.Browser.mobile, // Bloquear arrastre nativo en móvil para evitar conflictos con scroll
                tap: false
            }).setView([24.1426, -110.3127], 13);
            
            // Habilitar interacción de mapa en móvil solo al tocarlo
            if (L.Browser.mobile) {
                state.mapaGlobal.on('focus', function() { state.mapaGlobal.dragging.enable(); });
                state.mapaGlobal.on('blur', function() { state.mapaGlobal.dragging.disable(); });
            }

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.mapaGlobal);
        }

        // Renderizar elementos visuales
        renderizarNegocios(state.negociosGlobales);

        // --- 4. INICIALIZAR GRÁFICOS ---
        inicializarGraficos(pedidos, negocios);

    } catch (err) {
        console.error("Error al cargar listado", err);
    }
}

let charts = {}; // Guardar instancias de gráficos para destruirlos antes de recrear

function inicializarGraficos(pedidos, negocios) {
    // Destruir gráficos previos si existen para evitar solapamientos
    Object.values(charts).forEach(c => c.destroy());

    // --- A. GRÁFICO DE TENDENCIA (Últimos 7 días) ---
    const ctxTrend = document.getElementById('chartTendencia');
    if (ctxTrend) {
        const dataTrend = agruparPedidosPorDia(pedidos);
        charts.trend = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: dataTrend.labels,
                datasets: [{
                    label: 'Pedidos',
                    data: dataTrend.values,
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#f97316',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { display: false }, ticks: { stepSize: 1 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // --- B. GRÁFICO DE ESTADOS (Dona) ---
    const ctxStatus = document.getElementById('chartEstados');
    if (ctxStatus) {
        const stats = contarEstadosPedidos(pedidos);
        charts.status = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: ['Pendientes', 'Entregados', 'Cancelados'],
                datasets: [{
                    data: [stats.pendiente || 0, stats.entregado || 0, stats.cancelado || 0],
                    backgroundColor: ['#fbbf24', '#22c55e', '#ef4444'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: { legend: { display: false } }
            }
        });
    }

    // --- C. RANKING DE NEGOCIOS ---
    const rankingCont = document.getElementById('topNegociosRanking');
    if (rankingCont) {
        const ranking = calcularIngresosPorNegocio(pedidos, negocios);
        if (ranking.length === 0) {
            rankingCont.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Sin datos de ingresos aún.</p>';
        } else {
            rankingCont.innerHTML = ranking.slice(0, 5).map((n, i) => `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center font-bold text-xs text-slate-400 border border-slate-100">
                        ${i + 1}
                    </div>
                    <div class="flex-1">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-sm font-bold text-slate-800 truncate w-32">${n.nombre}</span>
                            <span class="text-xs font-black text-brand-600">$${n.total.toLocaleString()}</span>
                        </div>
                        <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div class="bg-brand-500 h-full rounded-full" style="width: ${n.porcentaje}%"></div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    // --- D. RANKING DE CLIENTES ---
    const clientesRankingCont = document.getElementById('topClientesRanking');
    if (clientesRankingCont) {
        const rankingClientes = calcularPedidosPorCliente(pedidos, state.clientesGlobales);
        if (rankingClientes.length === 0) {
            clientesRankingCont.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Sin datos de pedidos aún.</p>';
        } else {
            clientesRankingCont.innerHTML = rankingClientes.slice(0, 5).map((c, i) => `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[10px] border border-blue-100">
                        ${i + 1}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-sm font-bold text-slate-800 truncate">${c.nombre}</span>
                            <span class="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">${c.total} pedidos</span>
                        </div>
                        <div class="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div class="bg-blue-500 h-full rounded-full" style="width: ${c.porcentaje}%"></div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }
}

function agruparPedidosPorDia(pedidos) {
    const labels = [];
    const values = [];
    const hoy = new Date();
    
    // Generar últimos 7 días
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(hoy.getDate() - i);
        const dayStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
        labels.push(dayStr);
        
        // Contar pedidos para este día
        const count = pedidos.filter(p => {
            const pDate = new Date(p.created_at);
            return pDate.toDateString() === d.toDateString();
        }).length;
        values.push(count);
    }
    
    return { labels, values };
}

function contarEstadosPedidos(pedidos) {
    return pedidos.reduce((acc, p) => {
        const estado = p.estado || 'pendiente';
        acc[estado] = (acc[estado] || 0) + 1;
        return acc;
    }, {});
}

function calcularIngresosPorNegocio(pedidos, negocios) {
    const ingresos = pedidos.reduce((acc, p) => {
        acc[p.negocio_slug] = (acc[p.negocio_slug] || 0) + (parseFloat(p.costo_envio) || 0);
        return acc;
    }, {});

    const maxIngreso = Math.max(...Object.values(ingresos), 1);

    return Object.entries(ingresos)
        .map(([slug, total]) => {
            const negocio = negocios.find(n => n.slug === slug);
            return {
                nombre: negocio ? negocio.nombre_comercial : slug,
                total,
                porcentaje: (total / maxIngreso) * 100
            };
        })
        .sort((a, b) => b.total - a.total);
}

function calcularPedidosPorCliente(pedidos, clientes) {
    // Agrupar por teléfono del cliente para mayor precisión
    const conteo = pedidos.reduce((acc, p) => {
        acc[p.telefono] = (acc[p.telefono] || 0) + 1;
        return acc;
    }, {});

    const maxPedidos = Math.max(...Object.values(conteo), 1);

    return Object.entries(conteo)
        .map(([tel, total]) => {
            const cliente = clientes.find(c => c.telefono === tel);
            return {
                nombre: cliente ? cliente.nombre : tel,
                total,
                porcentaje: (total / maxPedidos) * 100
            };
        })
        .sort((a, b) => b.total - a.total);
}

// --- LÓGICA DE FINANZAS DETALLADAS ---

export function abrirDetalleFinanzas() {
    const overlay = document.getElementById('modalFinanzasOverlay');
    const content = document.getElementById('modalFinanzasContent');
    
    if (overlay && content) {
        overlay.classList.remove('pointer-events-none');
        overlay.classList.add('opacity-100');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
        
        // Inicializar con vista de "Hoy"
        filtrarFinanzas('hoy');
    }
}

export function cerrarModalFinanzas() {
    const overlay = document.getElementById('modalFinanzasOverlay');
    const content = document.getElementById('modalFinanzasContent');
    
    if (overlay && content) {
        overlay.classList.add('pointer-events-none');
        overlay.classList.remove('opacity-100');
        content.classList.add('scale-95');
        content.classList.remove('scale-100');
    }

    // Resetear custom range al cerrar
    const customInputs = document.getElementById('customRangeInputs');
    if (customInputs) customInputs.classList.add('hidden');
}

export function toggleCustomRange() {
    const inputs = document.getElementById('customRangeInputs');
    if (inputs) {
        inputs.classList.toggle('hidden');
        if (!inputs.classList.contains('hidden')) {
            // Pre-llenar con fechas razonables si están vacías
            const hoy = new Date().toISOString().split('T')[0];
            if (!document.getElementById('finFechaInicio').value) document.getElementById('finFechaInicio').value = hoy;
            if (!document.getElementById('finFechaFin').value) document.getElementById('finFechaFin').value = hoy;
        }
    }
}

export function filtrarFinanzas(rango) {
    const hoy = new Date();
    let pedidosFiltrados = [];
    let labelRango = "";

    // Actualizar estilos de botones de filtro
    document.querySelectorAll('.filter-fin').forEach(btn => {
        const text = btn.innerText.toLowerCase();
        if ((rango === 'custom' && text.includes('personalizado')) || text.includes(rango)) {
            btn.classList.add('bg-brand-600', 'text-white');
            btn.classList.remove('bg-white', 'text-slate-600');
        } else {
            btn.classList.remove('bg-brand-600', 'text-white');
            btn.classList.add('bg-white', 'text-slate-600');
        }
    });

    if (rango === 'hoy') {
        pedidosFiltrados = state.pedidosGlobales.filter(p => new Date(p.created_at).toDateString() === hoy.toDateString());
        labelRango = "Hoy";
        if (document.getElementById('customRangeInputs')) document.getElementById('customRangeInputs').classList.add('hidden');
    } else if (rango === 'semana') {
        const haceUnaSemana = new Date();
        haceUnaSemana.setDate(hoy.getDate() - 7);
        pedidosFiltrados = state.pedidosGlobales.filter(p => new Date(p.created_at) >= haceUnaSemana);
        labelRango = "Últimos 7 días";
        if (document.getElementById('customRangeInputs')) document.getElementById('customRangeInputs').classList.add('hidden');
    } else if (rango === 'mes') {
        const haceUnMes = new Date();
        haceUnMes.setMonth(hoy.getMonth() - 1);
        pedidosFiltrados = state.pedidosGlobales.filter(p => new Date(p.created_at) >= haceUnMes);
        labelRango = "Último Mes";
        if (document.getElementById('customRangeInputs')) document.getElementById('customRangeInputs').classList.add('hidden');
    } else if (rango === 'custom') {
        const inicio = new Date(document.getElementById('finFechaInicio').value);
        inicio.setHours(0, 0, 0, 0);
        const fin = new Date(document.getElementById('finFechaFin').value);
        fin.setHours(23, 59, 59, 999);
        
        pedidosFiltrados = state.pedidosGlobales.filter(p => {
            const d = new Date(p.created_at);
            return d >= inicio && d <= fin;
        });
        labelRango = `${inicio.toLocaleDateString()} - ${fin.toLocaleDateString()}`;
    } else {
        pedidosFiltrados = state.pedidosGlobales;
        labelRango = "Histórico Total";
        if (document.getElementById('customRangeInputs')) document.getElementById('customRangeInputs').classList.add('hidden');
    }

    const labelElem = document.getElementById('finLabelRango');
    if (labelElem) labelElem.innerText = labelRango;
    
    actualizarMetricasFinanzas(pedidosFiltrados, rango);
}

function actualizarMetricasFinanzas(pedidos, rango) {
    const total = pedidos.reduce((acc, p) => acc + (parseFloat(p.costo_envio) || 0), 0);
    const count = pedidos.length;
    const promedio = count > 0 ? (total / count) : 0;

    const ingElem = document.getElementById('finStatIngresos');
    const pedElem = document.getElementById('finStatPedidos');
    const proElem = document.getElementById('finStatPromedio');

    if (ingElem) ingElem.innerText = `$${total.toLocaleString('es-MX')}`;
    if (pedElem) pedElem.innerText = count;
    if (proElem) proElem.innerText = `$${promedio.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;

    renderizarGraficoFinanzas(pedidos, rango);
}

function renderizarGraficoFinanzas(pedidos, rango) {
    const ctx = document.getElementById('chartFinanzas');
    if (!ctx) return;

    if (charts.finanzas) charts.finanzas.destroy();

    let dataLabels = [];
    let dataValues = [];

    if (rango === 'hoy') {
        // Por horas
        for (let i = 0; i < 24; i++) {
            dataLabels.push(`${i}:00`);
            const sum = pedidos.filter(p => new Date(p.created_at).getHours() === i)
                               .reduce((acc, p) => acc + (parseFloat(p.costo_envio) || 0), 0);
            dataValues.push(sum);
        }
    } else {
        // Por días (agrupar)
        const grupos = pedidos.reduce((acc, p) => {
            const d = new Date(p.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
            acc[d] = (acc[d] || 0) + (parseFloat(p.costo_envio) || 0);
            return acc;
        }, {});
        dataLabels = Object.keys(grupos);
        dataValues = Object.values(grupos);
    }

    charts.finanzas = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dataLabels,
            datasets: [{
                label: 'Ingresos ($)',
                data: dataValues,
                backgroundColor: '#f97316',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// Exponer funciones al objeto window para que los onclick del HTML funcionen
window.abrirDetalleFinanzas = abrirDetalleFinanzas;
window.cerrarModalFinanzas = cerrarModalFinanzas;
window.filtrarFinanzas = filtrarFinanzas;
window.toggleCustomRange = toggleCustomRange;

export function toggleExpandirMapa() {
    const contenedor = document.getElementById('contenedorMapaGlobal');
    const icono = document.getElementById('iconoExpandirMapa');
    const esExpandido = contenedor.classList.contains('h-[250px]');

    if (esExpandido) {
        // Expandir
        contenedor.classList.remove('h-[250px]');
        contenedor.classList.add('h-[600px]');
        icono.setAttribute('data-feather', 'minimize');
    } else {
        // Contraer
        contenedor.classList.add('h-[250px]');
        contenedor.classList.remove('h-[600px]');
        icono.setAttribute('data-feather', 'maximize');
    }

    feather.replace();

    // Importante: Avisar a Leaflet que el tamaño cambió para que se redibuje bien
    if (state.mapaGlobal) {
        setTimeout(() => {
            state.mapaGlobal.invalidateSize({ animate: true });
        }, 500); // Esperar a que termine la animación de CSS
    }
}

window.toggleExpandirMapa = toggleExpandirMapa;

export function toggleHeatmap() {
    if (!state.mapaGlobal) return;

    const btn = document.getElementById('btnHeatmap');
    
    if (state.heatmapLayer) {
        // Quitar Mapa de Calor
        state.mapaGlobal.removeLayer(state.heatmapLayer);
        state.heatmapLayer = null;
        btn.classList.remove('text-brand-600', 'bg-brand-50');
        btn.classList.add('text-slate-700', 'bg-white/90');
    } else {
        // Activar Mapa de Calor
        // Extraer coordenadas de los pedidos (asumiendo que vienen en la propiedad 'ubicacion_cliente' o lat/lng)
        const puntos = state.pedidosGlobales
            .filter(p => p.lat && p.lng)
            .map(p => [parseFloat(p.lat), parseFloat(p.lng), 0.5]); // [lat, lng, intensidad]

        if (puntos.length === 0) {
            notificar("No hay suficientes datos de ubicación en los pedidos para generar el mapa de calor.", 'info');
            return;
        }

        state.heatmapLayer = L.heatLayer(puntos, {
            radius: 25,
            blur: 15,
            maxZoom: 17,
            gradient: {0.4: 'blue', 0.65: 'lime', 1: 'red'}
        }).addTo(state.mapaGlobal);

        btn.classList.add('text-brand-600', 'bg-brand-50');
        btn.classList.remove('text-slate-700', 'bg-white/90');
    }
}

window.toggleHeatmap = toggleHeatmap;
