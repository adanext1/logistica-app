/**
 * Gestión del Catálogo de Productos (Real Schema)
 */

let categoriaActiva = null;

document.addEventListener('DOMContentLoaded', () => {
    const id = localStorage.getItem('negocio_id');
    if (!id) return;

    cargarCategorias(id);
    cargarProductos(id);
});

async function cargarCategorias(id) {
    const container = document.getElementById('categoriasContainer');
    if (!container) return;

    try {
        const response = await fetch(`/api/negocio/${id}/categorias`);
        const categorias = await response.json();

        container.innerHTML = `
            <button onclick="filtrarPorCategoria('todas')" class="px-4 py-2 bg-primary text-on-primary rounded-full text-sm font-bold shadow-sm">Todas</button>
        ` + categorias.map(c => `
            <button onclick="filtrarPorCategoria('${c.id}')" class="px-4 py-2 bg-surface-container-high text-on-surface-variant rounded-full text-sm hover:bg-primary/10 transition-colors">
                ${c.nombre}
            </button>
        `).join('');
    } catch (error) {
        console.error(error);
    }
}

async function crearCategoria() {
    const id = localStorage.getItem('negocio_id');
    const input = document.getElementById('newCategoryName');
    const nombre = input.value.trim();

    if (!nombre) return;

    try {
        const response = await fetch('/api/categorias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ negocio_id: id, nombre })
        });

        if (response.ok) {
            input.value = '';
            cargarCategorias(id);
        }
    } catch (error) {
        console.error(error);
    }
}

async function filtrarPorCategoria(categoriaId) {
    const id = localStorage.getItem('negocio_id');
    categoriaActiva = categoriaId === 'todas' ? null : categoriaId;
    
    // Actualizar estilo visual de los botones
    document.querySelectorAll('#categoriasContainer button').forEach(btn => {
        btn.classList.remove('bg-primary', 'text-on-primary');
        btn.classList.add('bg-surface-container-high', 'text-on-surface-variant');
    });
    
    const btnActivo = event ? event.currentTarget : null;
    if (btnActivo) {
        btnActivo.classList.remove('bg-surface-container-high', 'text-on-surface-variant');
        btnActivo.classList.add('bg-primary', 'text-on-primary');
    }

    ejecutarBusqueda();
}

function ejecutarBusqueda() {
    const id = localStorage.getItem('negocio_id');
    const query = document.getElementById('productSearch').value.toLowerCase();
    cargarProductos(id, categoriaActiva, query);
}

async function cargarProductos(id, catId = null, query = "") {
    const container = document.getElementById('productosContainer');
    if (!container) return;

    try {
        const response = await fetch(`/api/negocio/${id}/productos`);
        let productos = await response.json();

        // Aplicar filtros combinados
        if (catId) {
            productos = productos.filter(p => p.categoria_id === catId);
        }
        if (query) {
            productos = productos.filter(p => p.nombre.toLowerCase().includes(query));
        }

        if (productos.length === 0) {
            container.innerHTML = `
                <div class="col-span-full py-12 text-center">
                    <p class="text-on-surface-variant">No se encontraron productos que coincidan.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = productos.map(p => `
            <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 overflow-hidden group hover:shadow-lg transition-all duration-300">
                <div class="aspect-square relative overflow-hidden bg-surface-container-high">
                    <img src="${p.imagen_url || 'https://via.placeholder.com/300'}" alt="${p.nombre}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                    <div class="absolute top-2 right-2 flex gap-2">
                        <button onclick="eliminarProducto('${p.id}')" class="w-8 h-8 rounded-full bg-white/90 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm">
                            <span class="material-symbols-outlined text-sm">delete</span>
                        </button>
                    </div>
                </div>
                <div class="p-4">
                    <h3 class="font-h3 text-body-lg font-bold text-on-surface mb-1">${p.nombre}</h3>
                    <p class="text-body-md text-primary font-bold mb-2">$${p.precio} <span class="text-xs text-on-surface-variant font-normal">/ ${p.precio_medida_unit || 'unid'}</span></p>
                    <div class="flex items-center justify-between mt-4">
                        <span class="px-2 py-1 rounded-full text-[10px] font-bold ${p.esta_disponible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                            ${p.esta_disponible ? 'DISPONIBLE' : 'AGOTADO'}
                        </span>
                        <a href="nuevo-producto.html?edit=${p.id}" class="text-on-surface-variant hover:text-primary transition-colors">
                            <span class="material-symbols-outlined">edit</span>
                        </a>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error("Error al cargar productos:", error);
    }
}

async function eliminarProducto(productId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este producto?')) return;

    try {
        const response = await fetch(`/api/productos/${productId}`, { method: 'DELETE' });
        if (response.ok) {
            cargarProductos(localStorage.getItem('negocio_id'), categoriaActiva);
        }
    } catch (error) {
        console.error(error);
    }
}
