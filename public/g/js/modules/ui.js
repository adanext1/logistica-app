// Módulo de Interfaz de Usuario (UI) y Control de Modales
import { state } from './state.js';
import { 
    registrarEvento, 
    fetchNegocio, 
    fetchCategorias, 
    fetchProductos, 
    fetchOfertasYEventos 
} from './api.js';
import { 
    agregarSimpleAlCarrito, 
    agregarConfiguradoAlCarrito, 
    sumarCarrito, 
    restarCarrito, 
    continuarPedido 
} from './cart.js';

function checkIfClothing() {
    return (state.negocioCategoria && /ropa|moda|calzado|accesorios|boutique/i.test(state.negocioCategoria)) ||
           (state.slug && /ropa|moda|calzado|accesorios|boutique|clothing|wear/i.test(state.slug));
}

// --- Carga Inicial de Datos del Negocio ---
export async function cargarNegocio() {
    try {
        const negocio = await fetchNegocio(state.slug);
        state.negocioIdGlobal = negocio.id;
        state.negocioCategoria = negocio.categoria;

        // Registrar visita
        registrarEvento(negocio.id, 'view');

        // Título
        document.title = `${negocio.nombre_comercial} | Repartidores Camino Real`;
        document.getElementById('nombreNegocio').textContent = negocio.nombre_comercial;

        // Logo
        const container = document.getElementById('logoContainer');
        const placeholder = document.getElementById('logoPlaceholder');
        if (negocio.logo_url) {
            container.innerHTML = `<img src="${negocio.logo_url}" class="w-full h-full rounded-xl object-cover" alt="Logo">`;
        } else {
            placeholder.textContent = negocio.nombre_comercial.charAt(0);
        }

        // Splash Art (Banner)
        const heroBanner = document.getElementById('heroBanner');
        if (negocio.splash_url) {
            heroBanner.style.backgroundImage = `url('${negocio.splash_url}')`;
            heroBanner.style.backgroundSize = 'cover';
            heroBanner.style.backgroundPosition = 'center';
            heroBanner.innerHTML = ''; // Limpiar el "Cargando..."
        } else {
            heroBanner.innerHTML = `
                <div class="text-center text-white p-6">
                    <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm border border-white/30">
                        <i data-feather="shopping-bag" class="w-8 h-8"></i>
                    </div>
                    <p class="text-brand-100 text-[10px] font-black uppercase tracking-[0.2em] opacity-80">${negocio.categoria || 'Comercio Local'}</p>
                </div>
            `;
        }
        feather.replace();

        // WhatsApp Link
        if (negocio.whatsapp) {
            const waLink = `https://wa.me/52${negocio.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Quiero hacer un pedido en ${negocio.nombre_comercial}`)}`;
            
            const btnWa = document.getElementById('btnWhatsapp');
            if (btnWa) {
                btnWa.href = waLink;
                btnWa.target = '_blank';
            }

            const btnWaCTA = document.getElementById('btnWhatsappCTA');
            if (btnWaCTA) {
                btnWaCTA.href = waLink;
            }
        }

        // Renderizar Horarios
        if (negocio.horarios && negocio.horarios.length > 0) {
            const lista = document.getElementById('listaHorarios');
            const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            
            lista.innerHTML = negocio.horarios.map(h => `
                <div class="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                    <span class="font-bold text-slate-700">${dayNames[h.day_of_week]}</span>
                    <span class="${h.esta_cerrado ? 'text-red-500 font-bold' : 'text-slate-600 font-medium'}">
                        ${h.esta_cerrado ? 'Cerrado' : `${h.open_time.slice(0,5)} - ${h.close_time.slice(0,5)}`}
                    </span>
                </div>
            `).join('');
        }

        // Renderizar Métodos de Pago
        const pagoContainer = document.getElementById('metodosPagoContainer');
        if (pagoContainer) {
            const metodos = negocio.metodos_pago || ['efectivo'];
            if (metodos.length === 0) {
                pagoContainer.classList.add('hidden');
            } else {
                pagoContainer.classList.remove('hidden');
                
                const badgeConfigs = {
                    efectivo: {
                        label: 'Efectivo',
                        bg: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                        icon: 'dollar-sign'
                    },
                    transferencia: {
                        label: 'Transferencia',
                        bg: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
                        icon: 'repeat'
                    },
                    tarjeta: {
                        label: 'Tarjeta',
                        bg: 'bg-sky-50 text-sky-700 border border-sky-200',
                        icon: 'credit-card'
                    }
                };
                
                let html = `<span class="text-slate-400 mr-1.5 text-[11px] uppercase tracking-wider">Acepta:</span>`;
                metodos.forEach(m => {
                    const conf = badgeConfigs[m.toLowerCase().trim()];
                    if (conf) {
                        html += `
                            <span class="${conf.bg} px-2.5 py-1 rounded-lg flex items-center gap-1">
                                <i data-feather="${conf.icon}" class="w-3.5 h-3.5"></i> ${conf.label}
                            </span>
                        `;
                    }
                });
                pagoContainer.innerHTML = html;
            }
        }

        // Cargar productos, categorías y destacados de forma asíncrona
        cargarProductos(negocio.id);
        cargarCategorias(negocio.id);
        cargarOfertasYEventos(negocio.id);

    } catch (err) {
        console.error('Error cargando negocio:', err);
        document.getElementById('nombreNegocio').textContent = 'Negocio no encontrado';
        document.getElementById('gridProductos').innerHTML = '<p class="col-span-2 text-center text-slate-500 py-10">No pudimos cargar la información de esta tienda.</p>';
    } finally {
        document.body.classList.remove('pointer-events-none');
    }
}

export async function cargarCategorias(negocioId) {
    try {
        state.categoriasDB = await fetchCategorias(negocioId);
        renderizarCategorias();
    } catch (e) { console.error(e); }
}

export async function cargarProductos(negocioId) {
    try {
        state.productosDB = await fetchProductos(negocioId);
        renderizarProductos();
    } catch (e) { console.error(e); }
}

export async function cargarOfertasYEventos(negocioId) {
    try {
        const { ofertas, eventos } = await fetchOfertasYEventos(negocioId);
        state.ofertasDB = ofertas;
        state.eventosDB = eventos;
        renderizarDestacados();
    } catch (e) { console.error(e); }
}

// --- Renderizadores del DOM ---
export function renderizarCategorias() {
    const container = document.getElementById('categoriasContainer');
    const gridContainer = document.getElementById('gridCategoriasContainer');
    const gridTrigger = document.getElementById('categoryGridTrigger');
    
    if (!container) return;

    let html = `
        <button class="cat-filter bg-brand-500 text-white px-5 py-2 rounded-full font-bold text-sm whitespace-nowrap shadow-md transition shrink-0" data-cat="todos" onclick="filtrarPorCategoria('todos', this)">
            🛍️ Todo
        </button>
    `;
    
    let gridHtml = `
        <div class="grid grid-cols-2 gap-3">
            <button class="flex flex-col items-center gap-2 p-4 bg-slate-50 rounded-2xl hover:bg-brand-50 transition-colors group" onclick="filtrarPorCategoria('todos', null); cerrarModalCategorias();">
                <div class="w-12 h-12 rounded-full bg-white flex items-center justify-center text-2xl shadow-sm group-hover:scale-110 transition-transform">🛍️</div>
                <span class="text-xs font-bold text-slate-700">Todo</span>
            </button>
    `;
    
    const visibleCats = (state.categoriasDB || []).filter(cat => cat.esta_visible !== false);
    
    visibleCats.forEach(cat => {
        const btnHtml = `
        <button class="cat-filter bg-white text-slate-600 hover:bg-orange-50 border border-orange-200 px-5 py-2 rounded-full font-bold text-sm whitespace-nowrap transition shrink-0" data-cat="${cat.id}" onclick="filtrarPorCategoria('${cat.id}', this)">
            ${cat.nombre}
        </button>`;
        
        html += btnHtml;
        
        gridHtml += `
            <button class="flex flex-col items-center gap-2 p-4 bg-slate-50 rounded-2xl hover:bg-orange-50 transition-colors group" onclick="filtrarPorCategoria('${cat.id}', null); cerrarModalCategorias();">
                <div class="w-12 h-12 rounded-full bg-white flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform">
                    ${cat.nombre.charAt(0).toUpperCase()}
                </div>
                <span class="text-xs font-bold text-slate-700 truncate w-full text-center">${cat.nombre}</span>
            </button>
        `;
    });
    
    gridHtml += `</div>`;
    container.innerHTML = html;
    
    if (gridContainer) gridContainer.innerHTML = gridHtml;
    
    if (gridTrigger) {
        if (visibleCats.length > 5) {
            gridTrigger.classList.remove('hidden');
        } else {
            gridTrigger.classList.add('hidden');
        }
    }

    container.onscroll = function() {
        const maxScroll = container.scrollWidth - container.clientWidth;
        const rightFade = document.getElementById('rightFade');
        if (rightFade) {
            if (container.scrollLeft >= maxScroll - 5) {
                rightFade.classList.add('opacity-0');
            } else {
                rightFade.classList.remove('opacity-0');
            }
        }
    };
}

export function renderizarProductos() {
    const grid = document.getElementById('gridProductos');
    if (!grid) return;
    
    let productosMostrados = state.productosDB.filter(p => p.esta_disponible);
    
    if (state.filtroActual !== 'todos') {
        productosMostrados = productosMostrados.filter(p => p.categoria_id === state.filtroActual);
    }
    
    if (state.busquedaActual.trim() !== '') {
        const query = state.busquedaActual.toLowerCase();
        productosMostrados = productosMostrados.filter(p => 
            p.nombre.toLowerCase().includes(query) || 
            (p.descripcion && p.descripcion.toLowerCase().includes(query))
        );
    }

    if (productosMostrados.length === 0) {
        grid.innerHTML = '<div class="col-span-full py-10 text-center text-slate-500">No se encontraron productos.</div>';
        return;
    }

    grid.innerHTML = productosMostrados.map(p => {
        const imgHtml = p.imagen_url 
            ? `<img src="${p.imagen_url}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full bg-brand-50 flex items-center justify-center text-4xl">🛍️</div>`;
        
        const variaciones = p.variaciones || {};
        const hasTamanos = variaciones.tamanos && variaciones.tamanos.length > 0;
        const hasSabores = variaciones.sabores && variaciones.sabores.length > 0;
        
        let priceDisplay = '';
        if (hasTamanos) {
            const minPrice = Math.min(...variaciones.tamanos.map(t => parseFloat(t.precio)));
            priceDisplay = `<span class="text-xs text-slate-500 font-medium block leading-none mb-1">Desde</span>$${minPrice.toFixed(2)}`;
        } else {
            priceDisplay = `$${parseFloat(p.precio || 0).toFixed(2)}<span class="text-xs text-slate-400 font-medium">/${p.precio_medida_unit || 'pza'}</span>`;
        }
        
        return `
        <div class="bg-white rounded-2xl p-4 border border-orange-100 shadow-sm flex gap-4 hover:shadow-md transition-all group cursor-pointer" onclick="abrirDetalleProducto('${p.id}')">
            <div class="w-24 h-24 rounded-xl flex-shrink-0 overflow-hidden border border-orange-100 group-hover:scale-105 transition-transform">
                ${imgHtml}
            </div>
            <div class="flex-1 flex flex-col justify-between min-w-0">
                <div>
                    <h3 class="font-bold text-slate-900 leading-tight mb-1 break-words">${p.nombre}</h3>
                    <p class="text-xs text-slate-500 line-clamp-2 break-words mb-1">${p.descripcion || ''}</p>
                    ${p.descripcion ? `<span class="text-[10px] text-slate-400 font-bold hover:text-brand-600 transition-colors">Ver más</span>` : ''}
                </div>
                <div class="flex items-end justify-between mt-2">
                    <span class="font-black text-lg text-brand-600 leading-none">${priceDisplay}</span>
                    <div class="flex items-center gap-2">
                        <button onclick="event.stopPropagation(); manejarClickProducto('${p.id}')" class="w-8 h-8 bg-brand-50 text-brand-600 hover:bg-brand-500 hover:text-white rounded-full flex items-center justify-center transition-colors">
                            <i data-feather="plus" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `}).join('');

    feather.replace();
}

export function renderizarDestacados() {
    const container = document.getElementById('ofertasEventosContainer');
    const carrusel = document.getElementById('carruselDestacados');
    if (!container || !carrusel) return;
    
    state.slidePromos = [...state.ofertasDB, ...state.eventosDB];
    
    if (state.slidePromos.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    let html = '';

    state.slidePromos.forEach((of, index) => {
        const isVideo = of.imagen_url && of.imagen_url.match(/\.(mp4|webm|mov|ogg)(\?.*)?$/i);
        let mediaBg = '';
        if (of.imagen_url) {
            if (isVideo) {
                mediaBg = `<video src="${of.imagen_url}" class="absolute inset-0 w-full h-full object-cover opacity-60" autoplay loop muted playsinline></video>`;
            } else {
                mediaBg = `<img src="${of.imagen_url}" class="absolute inset-0 w-full h-full object-cover opacity-60">`;
            }
        }

        const esEvento = of.tipo === 'evento' || of.fecha_evento;
        const bgColor = esEvento ? 'bg-indigo-900' : 'bg-rose-700';
        const gradientColor = esEvento ? 'from-indigo-900 via-indigo-900/60' : 'from-rose-900 via-rose-900/60';
        const tagColor = esEvento ? 'bg-indigo-500' : 'bg-rose-500';
        const tagText = esEvento ? 'Evento' : 'Oferta';

        html += `
            <div class="snap-center shrink-0 w-36 h-56 relative ${bgColor} rounded-2xl overflow-hidden shadow-md flex items-end p-4 border border-white/10 group cursor-pointer" onclick="abrirTikTok(${index})">
                ${mediaBg}
                <div class="absolute inset-0 bg-gradient-to-t ${gradientColor} to-transparent"></div>
                <div class="relative z-10 w-full flex flex-col justify-end h-full">
                    <div class="w-full mt-auto">
                        <span class="inline-block px-2 py-0.5 ${tagColor} text-white text-[10px] font-bold rounded mb-1 uppercase tracking-wider">${tagText}</span>
                        <h4 class="text-white font-bold leading-tight line-clamp-2">${of.titulo}</h4>
                        <div class="overflow-hidden w-full mt-1 h-12 relative">
                            <div class="text-white/80 text-[10px] animate-marquee-up whitespace-pre-wrap">${of.descripcion || 'Toca para ver'}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    carrusel.innerHTML = html;
    feather.replace();
}

// --- Manejo del Click en Producto (Simple o Configurado) ---
export function manejarClickProducto(id) {
    const p = state.productosDB.find(prod => prod.id === id);
    if (!p) return;
    const requiresConfig = p.variaciones && ((p.variaciones.tamanos && p.variaciones.tamanos.length > 0) || (p.variaciones.sabores && p.variaciones.sabores.length > 0));
    if (requiresConfig) {
        abrirConfigProducto(id);
    } else {
        agregarSimpleAlCarrito(id);
    }
}

// --- Lógica del Visualizador Estilo TikTok (Reels) ---
export function abrirTikTok(startIndex = 0) {
    const overlay = document.getElementById('tiktokOverlay');
    const container = document.getElementById('tiktokReelsContainer');
    if (!overlay || !container) return;
    
    if (!state.negocioPhone) {
        fetchNegocio(state.slug).then(n => { state.negocioPhone = n.whatsapp; }).catch(()=>{});
    }

    let html = '';
    state.slidePromos.forEach((of, index) => {
        const isVideo = of.imagen_url && of.imagen_url.match(/\.(mp4|webm|mov|ogg)(\?.*)?$/i);
        let mediaFull = '';
        const esEvento = of.tipo === 'evento' || of.fecha_evento;
        
        if (of.imagen_url) {
            if (isVideo) {
                mediaFull = `<video src="${of.imagen_url}" class="absolute inset-0 w-full h-full object-cover" autoplay loop muted playsinline></video>`;
            } else {
                mediaFull = `<img src="${of.imagen_url}" class="absolute inset-0 w-full h-full object-cover">`;
            }
        } else {
            mediaFull = `
            <div class="absolute inset-0 w-full h-full bg-gradient-to-br from-brand-600 to-orange-800 flex flex-col items-center justify-center p-8">
                <div class="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center mb-6 shadow-2xl backdrop-blur-sm">
                    <i data-feather="${esEvento ? 'calendar' : 'tag'}" class="w-16 h-16 text-white"></i>
                </div>
            </div>`;
        }

        let buttonHtml = '<div class="flex flex-col gap-3 mt-4">';
        
        if (of.precio) {
            buttonHtml += `
            <button onclick="agregarOfertaAlCarrito('${of.id}')" class="w-full bg-brand-500 hover:bg-brand-600 text-white font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-xl shadow-brand-500/30 text-lg">
                <i data-feather="shopping-bag" class="w-5 h-5"></i>
                Añadir al pedido por $${of.precio}
            </button>`;
        }
        
        if (of.mensaje_whatsapp) {
            const waLink = `https://wa.me/52${(state.negocioPhone || '').replace(/\D/g, '')}?text=${encodeURIComponent(of.mensaje_whatsapp)}`;
            buttonHtml += `
            <a href="${waLink}" target="_blank" class="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-xl shadow-[#25D366]/20 text-lg">
                <i data-feather="message-circle" class="w-5 h-5"></i>
                Enviar WhatsApp
            </a>`;
        }
        
        buttonHtml += '</div>';

        html += `
            <div class="w-full h-[100dvh] snap-start snap-always relative bg-black flex items-center justify-center" id="reel-${index}">
                ${mediaFull}
                <div class="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90 pointer-events-none"></div>
                
                <div class="absolute bottom-0 left-0 w-full p-6 pb-12 z-10 flex flex-col">
                    <span class="inline-block px-3 py-1 bg-white/20 backdrop-blur text-white text-[10px] font-bold rounded-full mb-3 uppercase tracking-wider w-max border border-white/20 shadow-sm">${esEvento ? 'Evento' : 'Oferta'}</span>
                    <h3 class="text-white text-3xl font-black leading-tight mb-2 drop-shadow-lg">${of.titulo}</h3>
                    ${of.descripcion ? `<div class="max-h-32 overflow-y-auto hide-scrollbar text-white/90 text-sm leading-relaxed drop-shadow">${of.descripcion.replace(/\n/g, '<br>')}</div>` : ''}
                    ${buttonHtml}
                </div>
            </div>
        `;
    });

    html += `
        <div class="w-full h-[100dvh] snap-start snap-always relative bg-black flex flex-col items-center justify-center" id="reel-close-trigger">
            <div class="text-white text-center flex flex-col items-center gap-2">
                <div class="animate-bounce">
                    <i data-feather="arrow-down" class="w-8 h-8 mx-auto text-brand-500"></i>
                </div>
                <p class="text-sm font-black uppercase tracking-wider">Volviendo a la tienda</p>
            </div>
        </div>
    `;

    container.innerHTML = html;
    feather.replace();

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    document.querySelectorAll('#carruselDestacados video').forEach(v => v.pause());

    setTimeout(() => {
        overlay.classList.remove('translate-y-full');
        const target = document.getElementById(`reel-${startIndex}`);
        if (target) target.scrollIntoView({behavior: 'instant'});
    }, 10);
    
    container.onscroll = () => {
        clearTimeout(container.scrollTimeout);
        container.scrollTimeout = setTimeout(() => {
            const reels = container.children;
            for(let i = 0; i < reels.length; i++) {
                const rect = reels[i].getBoundingClientRect();
                const video = reels[i].querySelector('video');
                
                if (rect.top >= -50 && rect.top <= window.innerHeight / 2) {
                    if (reels[i].id === 'reel-close-trigger') {
                        cerrarTikTokOverlay();
                        return;
                    }
                    if (video) video.play().catch(()=>{});
                } else {
                    if (video) video.pause();
                }
            }
        }, 100);
    };
    
    setTimeout(() => { container.onscroll(); }, 300);
}

export function cerrarTikTokOverlay() {
    const overlay = document.getElementById('tiktokOverlay');
    if (!overlay) return;
    
    overlay.classList.add('translate-y-full');
    document.body.style.overflow = '';
    
    document.querySelectorAll('#tiktokReelsContainer video').forEach(v => v.pause());
    document.querySelectorAll('#carruselDestacados video').forEach(v => v.play().catch(()=>{}));

    setTimeout(() => {
        overlay.classList.add('hidden');
        document.getElementById('tiktokReelsContainer').innerHTML = '';
    }, 300);
}

// --- Modal Configuración de Producto ---
function esTalla(opt) {
    const clean = opt.trim().toLowerCase();
    const cleanAlpha = clean.replace(/^[^a-z0-9ñáéíóú]+|[^a-z0-9ñáéíóú]+$/g, '');
    
    // Palabras clave explícitas
    const keywords = /\b(talla|tallas|talle|talles|size|sizes|unitalla|medida|medidas|unica|unico|única|único)\b/i;
    if (keywords.test(clean)) return true;
    
    // Abreviaciones comunes solas
    const standardSizeAbbr = /^(xs|s|m|l|xl|x{2,4}l|2xl|3xl|4xl|ch|med|g|eg|xg|sg)$/i;
    if (standardSizeAbbr.test(cleanAlpha)) return true;
    
    // Rangos combinados
    const combinedSizes = /^(xs\/s|s\/m|m\/l|l\/xl|xl\/xxl|ch\/m|m\/g|g\/xg|xs-s|s-m|m-l|l-xl|xl-xxl|ch-m|m-g|g-xg)$/i;
    if (combinedSizes.test(cleanAlpha)) return true;
    
    // Palabras completas en español/inglés
    const fullWords = /\b(chico|chica|mediano|mediana|grande|extragrande|extra-grande|supergrande|super-grande)\b/i;
    if (fullWords.test(clean)) return true;
    
    return false;
}

export function actualizarTallaDetectada(talla) {
    const prod = state.productosDB.find(p => p.id === state.configActual.productoId);
    if (prod) {
        state.configActual.tamano = { nombre: talla, precio: parseFloat(prod.precio || 0) };
    }
}

// --- Modal Configuración de Producto ---
export function abrirConfigProducto(id) {
    const prod = state.productosDB.find(p => p.id === id);
    if (!prod) return;
    const variaciones = prod.variaciones || {};

    let saboresInactivos = [];
    const catsToCheck = [prod.categoria_id, prod.categoria_variaciones_id].filter(id => id);
    
    catsToCheck.forEach(catId => {
        const cat = state.categoriasDB.find(c => c.id === catId);
        if (cat && cat.variaciones && cat.variaciones.sabores) {
            const inactivos = cat.variaciones.sabores
                .filter(s => !s.activo)
                .map(s => s.nombre);
            saboresInactivos = [...new Set([...saboresInactivos, ...inactivos])];
        }
    });
    
    const saboresValidos = (variaciones.sabores || []).filter(s => !saboresInactivos.includes(s));
    variaciones.sabores = saboresValidos;

    const isClothing = checkIfClothing();

    // --- Detección inteligente de Tallas mixtas en Sabores ---
    const hasStandardTamanos = variaciones.tamanos && variaciones.tamanos.length > 0;
    let tallasDetectadas = [];
    let opcionesFiltradas = saboresValidos;

    if (!hasStandardTamanos) {
        tallasDetectadas = saboresValidos.filter(esTalla);
        opcionesFiltradas = saboresValidos.filter(s => !esTalla(s));
    }

    state.configActual = { 
        productoId: id, 
        tamano: hasStandardTamanos 
            ? variaciones.tamanos[0] 
            : (tallasDetectadas.length > 0 ? { nombre: tallasDetectadas[0], precio: parseFloat(prod.precio || 0) } : null), 
        sabores: (opcionesFiltradas.length > 0) ? [opcionesFiltradas[0]] : [] 
    };

    document.getElementById('configProdName').textContent = prod.nombre;
    document.getElementById('configProdDesc').textContent = prod.descripcion || '';
    const imgHtml = prod.imagen_url 
        ? `<img src="${prod.imagen_url}" class="w-full h-full object-cover">`
        : `<div class="w-full h-full bg-brand-50 flex items-center justify-center text-2xl">🛍️</div>`;
    document.getElementById('configProdImg').innerHTML = imgHtml;

    let optionsHtml = '';

    // 1. Tallas Estándar (desde panel de control, con cambio de precio)
    if (hasStandardTamanos) {
        optionsHtml += `
            <div>
                <div class="flex items-baseline justify-between mb-3">
                    <h4 class="font-bold text-slate-900 text-lg">${isClothing ? 'Talla' : 'Tamaño'}</h4>
                    <span class="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider">Obligatorio</span>
                </div>
                <div class="space-y-2">
        `;
        variaciones.tamanos.forEach((t, index) => {
            optionsHtml += `
                <label class="flex items-center justify-between p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <div class="flex items-center gap-3">
                        <input type="radio" name="configTamano" value="${index}" ${index === 0 ? 'checked' : ''} onchange="actualizarConfigTamano(${index})" class="w-5 h-5 text-brand-600 focus:ring-brand-500 border-slate-300">
                        <span class="font-medium text-slate-800">${t.nombre}</span>
                    </div>
                    <span class="font-bold text-slate-900">+$${parseFloat(t.precio).toFixed(2)}</span>
                </label>
            `;
        });
        optionsHtml += `</div></div>`;
    } 
    // 2. Tallas Inteligentes Detectadas (separadas automáticamente)
    else if (tallasDetectadas.length > 0) {
        optionsHtml += `
            <div>
                <div class="flex items-baseline justify-between mb-3">
                    <h4 class="font-bold text-slate-900 text-lg">${isClothing ? 'Talla' : 'Tallas disponibles'}</h4>
                    <span class="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider">Obligatorio</span>
                </div>
                <div class="space-y-2">
        `;
        tallasDetectadas.forEach((t, index) => {
            optionsHtml += `
                <label class="flex items-center justify-between p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <div class="flex items-center gap-3">
                        <input type="radio" name="configTallaDetectada" value="${t}" ${index === 0 ? 'checked' : ''} onchange="actualizarTallaDetectada('${t}')" class="w-5 h-5 text-brand-600 focus:ring-brand-500 border-slate-300">
                        <span class="font-medium text-slate-800">${t}</span>
                    </div>
                </label>
            `;
        });
        optionsHtml += `</div></div>`;
    }

    // 3. Colores / Opciones
    if (opcionesFiltradas.length > 0) {
        if (optionsHtml !== '') optionsHtml += '<hr class="border-slate-100 my-4">';
        
        const maxSabores = variaciones.max_sabores || 1;
        const reqText = maxSabores === 1 ? 'Elige 1' : `Elige hasta ${maxSabores}`;
        const sectionTitle = isClothing ? 'Color / Opciones' : 'Sabores / Opciones';
        const optText = isClothing ? 'color(es)' : 'opción(es)';
        
        optionsHtml += `
            <div>
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-bold text-slate-900 text-lg">${sectionTitle}</h4>
                    <div class="flex items-center gap-2">
                        <span class="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider">${reqText}</span>
                    </div>
                </div>
                <div class="space-y-2" id="saboresListContainer">
        `;
        
        if (maxSabores === 1) {
            opcionesFiltradas.forEach((s, index) => {
                optionsHtml += `
                    <label class="flex items-center justify-between p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                        <div class="flex items-center gap-3">
                            <input type="radio" name="configSabor" value="${s}" ${index === 0 ? 'checked' : ''} onchange="actualizarSaborUnico('${s}')" class="w-5 h-5 text-brand-600 focus:ring-brand-500 border-slate-300">
                            <span class="font-medium text-slate-800">${s}</span>
                        </div>
                    </label>
                `;
            });
        } else {
            opcionesFiltradas.forEach((s, index) => {
                optionsHtml += `
                    <label class="flex items-center justify-between p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                        <div class="flex items-center gap-3">
                            <input type="checkbox" name="configSabor" value="${s}" ${index === 0 ? 'checked' : ''} onchange="manejarCambioSabor(this, '${s}', ${maxSabores})" class="w-5 h-5 text-brand-600 focus:ring-brand-500 border-slate-300 rounded">
                            <span class="font-medium text-slate-800">${s}</span>
                        </div>
                    </label>
                `;
            });
        }
        optionsHtml += `</div></div>`;
    }

    optionsHtml += `
        <hr class="border-slate-100 my-4">
        <div>
            <label for="configProdNotas" class="block text-sm font-bold text-slate-700 mb-2">${isClothing ? 'Notas o instrucciones especiales:' : '¿No te gusta o eres alérgico a algo? Coméntanoslo:'}</label>
            <textarea id="configProdNotas" rows="2" placeholder="${isClothing ? 'Ej. dejar en portería, color alternativo...' : 'Ej. sin cebolla, alérgico a las nueces...'}" class="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm bg-slate-50 focus:bg-white resize-none"></textarea>
        </div>
    `;

    document.getElementById('configProdOptions').innerHTML = optionsHtml;
    feather.replace();
    actualizarPrecioConfigurador();

    document.getElementById('btnConfirmConfig').onclick = () => {
        const notas = document.getElementById('configProdNotas') ? document.getElementById('configProdNotas').value.trim() : null;
        agregarConfiguradoAlCarrito(id, { ...state.configActual, notas });
    };

    const modal = document.getElementById('modalConfigProducto');
    const panel = modal.querySelector('.transform');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0', 'pointer-events-none'), 10);
    setTimeout(() => panel.classList.remove('translate-y-full'), 10);
}

export function actualizarSaborUnico(sabor) {
    state.configActual.sabores = [sabor];
}

export function manejarCambioSabor(checkbox, sabor, max) {
    if (checkbox.checked) {
        if (state.configActual.sabores.length >= max) {
            checkbox.checked = false;
            mostrarAlerta(`Solo puedes elegir hasta ${max} opción(es).`);
            return;
        }
        state.configActual.sabores.push(sabor);
    } else {
        state.configActual.sabores = state.configActual.sabores.filter(s => s !== sabor);
    }
}

export function seleccionarSaborAlAzar(maxSabores) {
    const prod = state.productosDB.find(p => p.id === state.configActual.productoId);
    if (!prod || !prod.variaciones || !prod.variaciones.sabores) return;
    
    const saboresDisponibles = prod.variaciones.sabores;
    
    const shuffled = [...saboresDisponibles].sort(() => 0.5 - Math.random());
    const seleccionados = shuffled.slice(0, maxSabores);
    
    state.configActual.sabores = seleccionados;
    
    const container = document.getElementById('saboresListContainer');
    const scrollParent = document.getElementById('configProdOptions');
    
    if (container && scrollParent) {
        const currentScroll = scrollParent.scrollTop;
        const labels = Array.from(container.children);
        const selectedLabels = [];
        const unselectedLabels = [];
        
        labels.forEach(label => {
            const input = label.querySelector('input');
            if (input) {
                input.checked = seleccionados.includes(input.value);
                if (input.checked) {
                    selectedLabels.push(label);
                } else {
                    unselectedLabels.push(label);
                }
            }
        });
        
        selectedLabels.forEach(label => container.appendChild(label));
        unselectedLabels.forEach(label => container.appendChild(label));
        
        scrollParent.scrollTop = currentScroll;
        
        container.style.transition = 'transform 0.15s ease-in-out';
        container.style.transform = 'scale(0.97)';
        setTimeout(() => {
            container.style.transform = 'scale(1)';
        }, 150);
    }
}

export function actualizarConfigTamano(index) {
    const prod = state.productosDB.find(p => p.id === state.configActual.productoId);
    state.configActual.tamano = prod.variaciones.tamanos[index];
    actualizarPrecioConfigurador();
}

export function actualizarPrecioConfigurador() {
    const prod = state.productosDB.find(p => p.id === state.configActual.productoId);
    let precioFinal = state.configActual.tamano ? parseFloat(state.configActual.tamano.precio) : parseFloat(prod.precio);
    document.getElementById('configProdPrice').textContent = `$${precioFinal.toFixed(2)}`;
    document.getElementById('configBtnTotal').textContent = `$${precioFinal.toFixed(2)}`;
}

export function cerrarConfigProducto() {
    const modal = document.getElementById('modalConfigProducto');
    const panel = modal.querySelector('.transform');
    if (!modal || !panel) return;
    
    panel.classList.add('translate-y-full');
    setTimeout(() => {
        modal.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }, 300);
}

// --- Modal de Horarios ---
export function abrirModalHorarios() {
    const modal = document.getElementById('modalHorarios');
    const panel = modal.querySelector('.transform');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        panel.classList.remove('scale-95');
        panel.classList.add('scale-100');
    }, 10);
    feather.replace();
}

export function cerrarModalHorarios() {
    const modal = document.getElementById('modalHorarios');
    const panel = modal.querySelector('.transform');
    panel.classList.remove('scale-100');
    panel.classList.add('scale-95');
    modal.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// --- Modal del Carrito ---
export function abrirModalCarrito() {
    const modal = document.getElementById('modalCarrito');
    const panel = modal.querySelector('.transform');
    if (!modal || !panel) return;
    
    modal.classList.remove('hidden');
    renderizarModalCarrito();
    const items = Object.values(state.carrito);
    const totalPrecio = items.reduce((sum, item) => sum + (item.precio * item.qty), 0);
    document.getElementById('modalCarritoTotal').textContent = `$${totalPrecio.toFixed(2)}`;

    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
    }, 10);
    setTimeout(() => {
        panel.classList.remove('translate-y-full');
    }, 10);
}

export function cerrarModalCarrito() {
    const modal = document.getElementById('modalCarrito');
    const panel = modal.querySelector('.transform');
    if (!modal || !panel) return;
    
    panel.classList.add('translate-y-full');
    setTimeout(() => {
        modal.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }, 300);
}

export function renderizarModalCarrito() {
    const container = document.getElementById('modalCarritoItems');
    if (!container) return;
    
    const items = Object.entries(state.carrito);
    
    if (items.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-500 py-4">Tu carrito está vacío.</p>';
        return;
    }

    const isClothing = checkIfClothing();
    container.innerHTML = items.map(([key, item]) => {
        const imgHtml = item.imagen_url 
            ? `<img src="${item.imagen_url}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full bg-brand-50 flex items-center justify-center text-xl">🛍️</div>`;
        
        let extrasHtml = '';
        const labelTamano = isClothing ? 'Talla' : 'Tamaño';
        const labelSabor = isClothing ? 'Color' : 'Sabor';
        if (item.tamano) extrasHtml += `<span class="block text-[11px] text-slate-500 font-medium leading-tight">${labelTamano}: ${item.tamano}</span>`;
        if (item.sabor) extrasHtml += `<span class="block text-[11px] text-slate-500 font-medium leading-tight">${labelSabor}: ${item.sabor}</span>`;
        if (item.notas) extrasHtml += `<span class="block text-[11px] text-brand-600 font-semibold leading-tight mt-0.5">Nota: ${item.notas}</span>`;

        return `
        <div class="flex items-center gap-4 bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
            <div class="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden border border-slate-100">
                ${imgHtml}
            </div>
            <div class="flex-1">
                <h4 class="font-bold text-slate-900 text-sm leading-tight">${item.nombre}</h4>
                ${extrasHtml}
                <span class="font-black text-brand-600 text-sm block mt-1">$${parseFloat(item.precio || 0).toFixed(2)}</span>
            </div>
            <div class="flex items-center gap-2 bg-slate-50 rounded-full p-1 border border-slate-100">
                <button onclick="restarCarrito('${key}')" class="w-8 h-8 text-slate-600 hover:bg-white rounded-full flex items-center justify-center transition-colors text-lg font-bold shadow-sm">−</button>
                <span class="font-bold text-sm text-slate-900 w-4 text-center">${item.qty}</span>
                <button onclick="sumarCarrito('${key}')" class="w-8 h-8 text-slate-600 hover:bg-white rounded-full flex items-center justify-center transition-colors shadow-sm">
                    <i data-feather="plus" class="w-3 h-3"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');
    
    feather.replace();
}

// --- Filtros por Categoría ---
export function filtrarPorCategoria(catId, btnElement) {
    state.filtroActual = catId;
    
    document.querySelectorAll('.cat-filter').forEach(b => {
        b.classList.remove('bg-brand-500', 'text-white', 'shadow-md');
        b.classList.add('bg-white', 'text-slate-600', 'border', 'border-orange-200');
    });
    
    if (!btnElement) {
        btnElement = document.querySelector(`.cat-filter[data-cat="${catId}"]`);
    }

    if (btnElement) {
        btnElement.classList.remove('bg-white', 'text-slate-600', 'border', 'border-orange-200');
        btnElement.classList.add('bg-brand-500', 'text-white', 'shadow-md');
        btnElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    
    renderizarProductos();
}

export function abrirModalCategorias() {
    const modal = document.getElementById('modalCategoriasGrid');
    const panel = modal.querySelector('.transform');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        panel.classList.remove('translate-y-full');
    }, 10);
}

export function cerrarModalCategorias() {
    const modal = document.getElementById('modalCategoriasGrid');
    const panel = modal.querySelector('.transform');
    panel.classList.add('translate-y-full');
    modal.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => modal.classList.add('hidden'), 500);
}

// --- Compartir Tienda ---
export function compartir() {
    if (navigator.share) {
        navigator.share({ title: document.title, url: window.location.href });
    } else {
        navigator.clipboard.writeText(window.location.href);
        mostrarAlerta('¡Enlace de la tienda copiado al portapapeles!');
    }
}

// --- Alerta Personalizada ---
export function mostrarAlerta(mensaje) {
    document.getElementById('alertaMensaje').textContent = mensaje;
    const modal = document.getElementById('modalAlerta');
    const panel = modal.querySelector('.transform');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        panel.classList.remove('scale-90');
        panel.classList.add('scale-100');
    }, 10);
    feather.replace();
}

export function cerrarAlerta() {
    const modal = document.getElementById('modalAlerta');
    const panel = modal.querySelector('.transform');
    panel.classList.remove('scale-100');
    panel.classList.add('scale-90');
    modal.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// --- Bottom Sheet de Detalle de Producto ---
export function formatDetailDescription(desc) {
    if (!desc) return '<p class="text-slate-400 italic text-sm text-left">Sin descripción disponible.</p>';
    
    let cleanDesc = desc.trim();
    const parts = cleanDesc.split(/(Por dentro|Por fuera|Ingredientes|Materiales|Composición|Cuidado|Detalles)/i);
    
    if (parts.length > 1) {
        let html = '';
        let currentHeader = '';
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (!part) continue;
            
            if (/^(Por dentro|Por fuera|Ingredientes|Materiales|Composición|Cuidado|Detalles)$/i.test(part)) {
                currentHeader = part;
            } else {
                let content = part.replace(/^[:,\-\s\.]+/, '').trim();
                
                if (currentHeader) {
                    const capitalizeHeader = currentHeader.charAt(0).toUpperCase() + currentHeader.slice(1).toLowerCase();
                    html += `<h5 class="font-bold text-slate-800 mt-4 mb-2 text-sm flex items-center justify-start gap-2 text-left w-full"><span class="w-1.5 h-3 bg-brand-500 rounded-full flex-shrink-0"></span><span class="text-left flex-1">${capitalizeHeader}</span></h5>`;
                    currentHeader = '';
                }
                
                let normalized = content.replace(/([a-zñáéíóú])\s+([A-ZÁÉÍÓÚÑ][a-zñáéíóú]+)/g, '$1, $2');
                const items = normalized.split(/,|\by\b|\n/i)
                    .map(item => item.trim())
                    .filter(item => item.length > 1);
                    
                if (items.length > 0) {
                    html += `<ul class="space-y-2 pl-2 text-left w-full">`;
                    items.forEach(item => {
                        const formattedItem = item.charAt(0).toUpperCase() + item.slice(1);
                        html += `<li class="flex items-start justify-start gap-2 text-slate-600 text-sm text-left w-full"><span class="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 flex-shrink-0"></span><span class="text-left flex-1">${formattedItem}</span></li>`;
                    });
                    html += `</ul>`;
                } else {
                    html += `<p class="text-slate-600 text-sm pl-2 text-left w-full">${content}</p>`;
                }
            }
        }
        return html;
    }
    
    let normalized = cleanDesc.replace(/([a-zñáéíóú])\s+([A-ZÁÉÍÓÚÑ][a-zñáéíóú]+)/g, '$1, $2');
    const isClothing = checkIfClothing();
    const headerTitle = isClothing ? 'Detalles del artículo' : 'Ingredientes';
    const items = normalized.split(/,|\by\b|\n/i)
        .map(item => item.trim())
        .filter(item => item.length > 2);
    if (items.length > 1) {
        let html = `<h5 class="font-bold text-slate-800 mb-2 text-sm flex items-center justify-start gap-2 text-left w-full"><span class="w-1.5 h-3 bg-brand-500 rounded-full flex-shrink-0"></span><span class="text-left flex-1">${headerTitle}</span></h5>`;
        html += `<ul class="space-y-2 pl-2 text-left w-full">`;
        items.forEach(item => {
            const formattedItem = item.charAt(0).toUpperCase() + item.slice(1);
            html += `<li class="flex items-start justify-start gap-2 text-slate-600 text-sm text-left w-full"><span class="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 flex-shrink-0"></span><span class="text-left flex-1">${formattedItem}</span></li>`;
        });
        html += `</ul>`;
        return html;
    }
    
    return `<p class="text-slate-600 text-sm leading-relaxed text-left w-full">${cleanDesc.replace(/\n/g, '<br>')}</p>`;
}

export function abrirDetalleProducto(id) {
    const p = state.productosDB.find(prod => prod.id === id);
    if (!p) return;
    
    state.productoDetalleIdGlobal = id;
    registrarEvento(state.negocioIdGlobal, 'view_item', { producto_id: id });

    const inputNotas = document.getElementById('detalleProdNotas');
    if (inputNotas) inputNotas.value = '';

    document.getElementById('detalleProdName').textContent = p.nombre;

    const variaciones = p.variaciones || {};
    const hasTamanos = variaciones.tamanos && variaciones.tamanos.length > 0;
    const hasSabores = variaciones.sabores && variaciones.sabores.length > 0;
    const requiresConfig = hasTamanos || hasSabores;

    let priceText = '';
    let btnTotalText = '';
    let basePrice = parseFloat(p.precio) || 0;

    if (hasTamanos) {
        const minPrice = Math.min(...variaciones.tamanos.map(t => parseFloat(t.precio)));
        priceText = `Desde $${minPrice.toFixed(2)}`;
        btnTotalText = `$${minPrice.toFixed(2)}`;
    } else {
        priceText = `$${basePrice.toFixed(2)}${p.precio_medida_unit ? `/${p.precio_medida_unit}` : '/pza'}`;
        btnTotalText = `$${basePrice.toFixed(2)}`;
    }

    document.getElementById('detalleProdPrice').textContent = priceText;

    const imgContainer = document.getElementById('detalleProdImg');
    if (p.imagen_url) {
        imgContainer.className = "w-full h-auto max-h-[50vh] relative bg-slate-50 flex-shrink-0 overflow-hidden border-b border-orange-50 flex items-center justify-center";
        imgContainer.innerHTML = `<img src="${p.imagen_url}" class="w-full h-auto max-h-[50vh] object-contain block" alt="${p.nombre}">`;
    } else {
        imgContainer.className = "w-full h-64 sm:h-72 relative bg-slate-50 flex-shrink-0 overflow-hidden border-b border-orange-50";
        imgContainer.innerHTML = `<div class="w-full h-full bg-brand-50 flex items-center justify-center text-7xl">🛍️</div>`;
    }

    const descFormatted = formatDetailDescription(p.descripcion);
    document.getElementById('detalleProdDesc').innerHTML = descFormatted;

    const btnAgregar = document.getElementById('btnAgregarDetalle');
    
    if (requiresConfig) {
        btnAgregar.innerHTML = `
            <span>Personalizar pedido</span>
            <div class="flex items-center gap-1">
                <span>Desde ${btnTotalText}</span>
                <i data-feather="chevron-right" class="w-5 h-5"></i>
            </div>
        `;
        btnAgregar.onclick = () => {
            cerrarDetalleProducto();
            abrirConfigProducto(id);
        };
    } else {
        btnAgregar.innerHTML = `
            <span>Agregar al pedido</span>
            <span id="detalleBtnTotal">${btnTotalText}</span>
        `;
        btnAgregar.onclick = () => {
            const notas = document.getElementById('detalleProdNotas') ? document.getElementById('detalleProdNotas').value.trim() : null;
            agregarSimpleAlCarrito(id, notas);
            cerrarDetalleProducto();
        };
    }
    
    // Adaptar textos si es tienda de ropa
    const isClothing = checkIfClothing();
    const descTitle = document.querySelector('#detalleProdDescContainer h4');
    if (descTitle) {
        descTitle.textContent = isClothing ? 'Descripción y Detalles' : 'Descripción e Ingredientes';
    }
    const labelNotas = document.querySelector('label[for="detalleProdNotas"]');
    if (labelNotas) {
        labelNotas.textContent = isClothing ? 'Notas o instrucciones sobre este producto:' : '¿No te gusta o eres alérgico a algo? Coméntanoslo:';
    }
    const textareaNotas = document.getElementById('detalleProdNotas');
    if (textareaNotas) {
        textareaNotas.placeholder = isClothing ? 'Ej. color alternativo si no hay, manga corta...' : 'Ej. sin cebolla, alérgico a las nueces...';
    }

    feather.replace();

    const modal = document.getElementById('modalDetalleProducto');
    const panel = document.getElementById('panelDetalleProducto');
    if (!modal || !panel) return;
    
    panel.style.transform = 'translateY(100%)';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        panel.classList.remove('translate-y-full');
        panel.style.transform = 'translateY(0)';
    }, 10);
}

export function cerrarDetalleProducto() {
    const modal = document.getElementById('modalDetalleProducto');
    const panel = document.getElementById('panelDetalleProducto');
    if (!modal || !panel) return;
    
    panel.classList.add('translate-y-full');
    panel.style.transform = 'translateY(100%)';
    modal.classList.add('opacity-0', 'pointer-events-none');
    document.body.style.overflow = '';

    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('detalleProdName').textContent = '';
        document.getElementById('detalleProdPrice').textContent = '';
        document.getElementById('detalleProdImg').innerHTML = '';
        document.getElementById('detalleProdDesc').innerHTML = '';
        const overlay = document.querySelector('#modalDetalleProducto > div.absolute');
        if (overlay) {
            overlay.style.backgroundColor = '';
        }
    }, 350);
}

export function initUIListeners() {
    // Scroll de la Navbar
    window.addEventListener('scroll', () => {
        const nav = document.getElementById('navbar');
        if (!nav) return;
        if (window.scrollY > 50) {
            nav.classList.add('bg-white', 'shadow-md');
            nav.classList.remove('bg-gradient-to-b', 'from-slate-900/70', 'to-transparent');
            nav.querySelectorAll('a, button').forEach(el => {
                el.classList.remove('bg-white/20', 'text-white', 'border-white/30');
                el.classList.add('bg-orange-50', 'text-slate-800', 'border-orange-200');
            });
        } else {
            nav.classList.remove('bg-white', 'shadow-md');
            nav.classList.add('bg-gradient-to-b', 'from-slate-900/70', 'to-transparent');
            nav.querySelectorAll('a, button').forEach(el => {
                el.classList.add('bg-white/20', 'text-white', 'border-white/30');
                el.classList.remove('bg-orange-50', 'text-slate-800', 'border-orange-200');
            });
        }
    });

    // Buscador
    const searchInput = document.getElementById('buscadorProductos');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.busquedaActual = e.target.value;
            renderizarProductos();
        });
    }
}
