/**
 * Lógica del Dashboard de Negocios
 */

document.addEventListener('DOMContentLoaded', async () => {
    const id = localStorage.getItem('negocio_id');
    const slug = localStorage.getItem('negocio_slug');

    if (!id || !slug) {
        window.location.href = '/login-negocio.html';
        return;
    }

    // Cargar Estadísticas Bento Grid
    cargarEstadisticas(id);

    // Cargar Perfil Básico
    cargarPerfil(id);

    // Cargar Top Productos
    cargarTopProductos(id);

    // Activar Smart Advisor (La Campanita)
    activarSmartAdvisor(id);
});

async function cargarTopProductos(id) {
    const container = document.getElementById('top-productos-list');
    if (!container) return;

    try {
        // Usar el endpoint de rendimiento real
        const response = await fetch(`/api/negocio/${id}/product-performance?range=30`);
        let productos = await response.json();

        if (productos.length === 0) {
            // Fallback: si no hay métricas, mostrar los últimos productos
            const resFallback = await fetch(`/api/negocio/${id}/productos`);
            productos = await resFallback.json();
        }

        container.innerHTML = productos.slice(0, 5).map(p => `
            <div class="flex items-center justify-between p-4 bg-surface-container-low rounded-xl border border-outline-variant/30">
                <div class="flex items-center gap-3">
                    <img src="${p.imagen_url || 'https://via.placeholder.com/50'}" class="w-10 h-10 rounded-lg object-cover">
                    <div>
                        <p class="font-bold text-on-surface">${p.nombre}</p>
                        <p class="text-[10px] text-on-surface-variant">${p.count ? `${p.count} interesados` : 'Recién agregado'}</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="px-2 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-full">TOP</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
    }
}

async function activarSmartAdvisor(id) {
    const bell = document.querySelector('button .material-symbols-outlined[data-icon="notifications"]');
    if (!bell) return;

    // Simulación de alertas basadas en los datos que describiste
    const alertas = [
        { tipo: 'fuga', titulo: 'Alerta de Fuga', msg: '15 clientes armaron carrito pero no enviaron WhatsApp.', icon: 'leak_add' },
        { tipo: 'pico', titulo: 'Hora Pico Detectada', msg: 'Viernes 7 PM es tu mejor momento.', icon: 'bolt' }
    ];

    bell.parentElement.addEventListener('click', () => {
        alert("Smart Advisor:\n\n" + alertas.map(a => `📌 ${a.titulo}: ${a.msg}`).join('\n\n'));
    });
}

async function cargarEstadisticas(id) {
    try {
        const response = await fetch(`/api/negocio/${id}/stats`);
        const data = await response.json();

        // Inyectar en el HTML (IDs definidos en dashboard.html)
        const statVisitas = document.getElementById('stat-visitas');
        const statProductos = document.getElementById('stat-productos');
        const statCarts = document.getElementById('stat-carts');
        const progressText = document.getElementById('progresoTexto');
        const progressBar = document.getElementById('progresoBarra');

        if (statVisitas) statVisitas.innerText = data.visitas;
        if (statProductos) statProductos.innerText = data.productos;
        if (statCarts) statCarts.innerText = data.carritos || 0;
        
        if (progressText) progressText.innerText = `${data.pasos}/5 pasos`;
        if (progressBar) progressBar.style.width = `${data.progreso}%`;

    } catch (error) {
        console.error("Error al cargar stats:", error);
    }
}

async function cargarPerfil(id) {
    try {
        const response = await fetch(`/api/negocio/${id}`); 
        const data = await response.json();

        const elNombre = document.getElementById('dashboardNombreNegocio');
        const elLogo = document.getElementById('dashboardLogoNegocio');
        const elPlaceholder = document.getElementById('dashboardLogoPlaceholder');

        if (elNombre) elNombre.innerText = `Hola, ${data.nombre_comercial}`;
        if (data.logo_url) {
            if (elLogo) {
                elLogo.src = data.logo_url;
                elLogo.classList.remove('hidden');
            }
            if (elPlaceholder) elPlaceholder.classList.add('hidden');
        }

    } catch (error) {
        console.error("Error al cargar perfil:", error);
    }
}
