/**
 * Gestión del Catálogo de Productos (Real Schema)
 */

let categoriaActiva = null;
let categoriasGlobal = [];
let catEditActual = null;
let catSaboresTemp = [];

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
        categoriasGlobal = await response.json();

        container.innerHTML = `
            <button onclick="filtrarPorCategoria('todas')" class="px-4 py-2 bg-primary text-on-primary rounded-full text-sm font-bold shadow-sm h-10 flex items-center">Todas</button>
        ` + categoriasGlobal.map(c => `
            <div class="flex items-stretch bg-surface-container-high rounded-full overflow-hidden h-10 border border-outline-variant/30">
                <button onclick="filtrarPorCategoria('${c.id}')" class="px-4 py-2 text-on-surface-variant hover:bg-primary/10 transition-colors text-sm font-medium">
                    ${c.nombre}
                </button>
                <div class="w-[1px] bg-outline-variant/30"></div>
                <button onclick="abrirModalCategoria('${c.id}')" class="px-3 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors" title="Editar Categoría">
                    <span class="material-symbols-outlined text-[18px]">edit</span>
                </button>
            </div>
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
    document.querySelectorAll('#categoriasContainer > button, #categoriasContainer > div').forEach(el => {
        if (el.tagName === 'BUTTON') {
            el.classList.remove('bg-primary', 'text-on-primary');
            el.classList.add('bg-surface-container-high', 'text-on-surface-variant');
        } else {
            const btn = el.querySelector('button');
            btn.classList.remove('text-on-primary');
            el.classList.remove('bg-primary');
            el.classList.add('bg-surface-container-high');
        }
    });
    
    const btnActivo = event ? event.currentTarget : null;
    if (btnActivo) {
        if (btnActivo.tagName === 'BUTTON' && !btnActivo.parentElement.classList.contains('flex')) {
             btnActivo.classList.remove('bg-surface-container-high', 'text-on-surface-variant');
             btnActivo.classList.add('bg-primary', 'text-on-primary');
        } else {
             btnActivo.classList.remove('text-on-surface-variant');
             btnActivo.classList.add('text-on-primary');
             btnActivo.parentElement.classList.remove('bg-surface-container-high');
             btnActivo.parentElement.classList.add('bg-primary');
        }
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

        container.innerHTML = productos.map(p => {
            const imgHtml = p.imagen_url 
                ? `<img src="${p.imagen_url}" alt="${p.nombre}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">`
                : `<div class="w-full h-full bg-surface-container-highest flex items-center justify-center text-4xl group-hover:scale-110 transition-transform duration-500">🛍️</div>`;
                
            return `
            <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-3 flex gap-4 items-center group hover:shadow-md transition-all duration-300">
                <div class="w-20 h-20 shrink-0 rounded-lg overflow-hidden relative bg-surface-container-high">
                    ${imgHtml}
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-h3 text-body-lg font-bold text-on-surface mb-0.5 truncate">${p.nombre}</h3>
                    <p class="text-body-md text-primary font-bold mb-2 leading-none">$${p.precio} <span class="text-[10px] text-on-surface-variant font-normal">/ ${p.precio_medida_unit || 'unid'}</span></p>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold inline-block ${p.esta_disponible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                        ${p.esta_disponible ? 'DISPONIBLE' : 'AGOTADO'}
                    </span>
                </div>
                <div class="flex flex-col gap-2 shrink-0">
                    <a href="nuevo-producto.html?edit=${p.id}" class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-on-primary transition-colors">
                        <span class="material-symbols-outlined text-sm">edit</span>
                    </a>
                    <button onclick="eliminarProducto('${p.id}')" class="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors">
                        <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                </div>
            </div>
        `}).join('');

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

// --- LÓGICA DEL MODAL DE CATEGORÍA ---

function abrirModalCategoria(catId) {
    catEditActual = categoriasGlobal.find(c => c.id === catId);
    if (!catEditActual) return;

    document.getElementById('catEditNombre').value = catEditActual.nombre;
    
    catSaboresTemp = [];
    if (catEditActual.variaciones && catEditActual.variaciones.sabores) {
        catSaboresTemp = JSON.parse(JSON.stringify(catEditActual.variaciones.sabores));
    }
    
    renderizarSaboresCategoria();

    const modal = document.getElementById('modalCategoria');
    const panel = modal.querySelector('.transform');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        panel.classList.remove('scale-95');
        panel.classList.add('scale-100');
    }, 10);
}

function cerrarModalCategoria() {
    const modal = document.getElementById('modalCategoria');
    const panel = modal.querySelector('.transform');
    panel.classList.remove('scale-100');
    panel.classList.add('scale-95');
    modal.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function renderizarSaboresCategoria() {
    const list = document.getElementById('catSaboresLista');
    if (catSaboresTemp.length === 0) {
        list.innerHTML = '<p class="text-[13px] text-on-surface-variant p-2 text-center">No hay sabores configurados. Añade uno arriba.</p>';
        return;
    }

    list.innerHTML = catSaboresTemp.map((sabor, index) => `
        <div class="flex items-center justify-between p-2 rounded-lg ${sabor.activo ? 'bg-surface-container' : 'bg-surface-container-lowest opacity-60'} border border-outline-variant/30 transition-all">
            <div class="flex items-center gap-3">
                <button onclick="toggleSaborCategoria(${index})" class="text-[24px] text-${sabor.activo ? 'primary' : 'on-surface-variant'} focus:outline-none flex items-center justify-center transition-colors">
                    <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' ${sabor.activo ? '1' : '0'}; font-size: 24px;">
                        ${sabor.activo ? 'toggle_on' : 'toggle_off'}
                    </span>
                </button>
                <span class="text-[14px] font-medium text-on-surface ${!sabor.activo ? 'line-through decoration-on-surface-variant/50' : ''}">${sabor.nombre}</span>
            </div>
            <button onclick="eliminarSaborCategoria(${index})" class="text-error hover:bg-error/10 w-8 h-8 rounded-full transition-colors flex items-center justify-center">
                <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
        </div>
    `).join('');
}

function agregarSaborCategoria() {
    const input = document.getElementById('catNuevoSabor');
    const val = input.value.trim();
    if (!val) return;

    if (catSaboresTemp.some(s => s.nombre.toLowerCase() === val.toLowerCase())) {
        alert("Este sabor ya existe en esta categoría.");
        return;
    }

    catSaboresTemp.push({ nombre: val, activo: true });
    input.value = '';
    renderizarSaboresCategoria();
}

function toggleSaborCategoria(index) {
    catSaboresTemp[index].activo = !catSaboresTemp[index].activo;
    renderizarSaboresCategoria();
}

function eliminarSaborCategoria(index) {
    catSaboresTemp.splice(index, 1);
    renderizarSaboresCategoria();
}

async function guardarCategoria() {
    if (!catEditActual) return;
    
    const nombre = document.getElementById('catEditNombre').value.trim();
    if (!nombre) {
        alert("El nombre de la categoría no puede estar vacío.");
        return;
    }

    const payload = {
        nombre: nombre,
        variaciones: { sabores: catSaboresTemp }
    };

    try {
        const res = await fetch(`/api/categorias/${catEditActual.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            cerrarModalCategoria();
            cargarCategorias(localStorage.getItem('negocio_id'));
        } else {
            alert("Error al guardar categoría.");
        }
    } catch (err) {
        console.error(err);
        alert("Error de conexión.");
    }
}
