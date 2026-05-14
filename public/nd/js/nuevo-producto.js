/**
 * Lógica para Crear Producto (Real Schema)
 */

let editProductId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const id = localStorage.getItem('negocio_id');
    if (!id) return;

    await cargarCategorias(id);

    const urlParams = new URLSearchParams(window.location.search);
    editProductId = urlParams.get('edit');

    if (editProductId) {
        const pageTitle = document.getElementById('page_title');
        const pageSubtitle = document.getElementById('page_subtitle');
        if (pageTitle) pageTitle.textContent = 'Editar Producto';
        if (pageSubtitle) pageSubtitle.textContent = 'Modifica los detalles del producto.';
        
        const saveBtn = document.querySelector('button.bg-primary');
        if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined">save</span> Guardar Cambios';
        
        await cargarProductoParaEditar(editProductId);
    }

    const saveBtn = document.querySelector('button.bg-primary');
    if (saveBtn) {
        saveBtn.addEventListener('click', (e) => guardarProducto(e, id));
    }
});

async function cargarProductoParaEditar(prodId) {
    try {
        const response = await fetch(`/api/productos/${prodId}`);
        if (!response.ok) throw new Error('Producto no encontrado');
        const p = await response.json();

        document.getElementById('product_name').value = p.nombre || '';
        document.getElementById('product_price').value = p.precio || '';
        document.getElementById('product_unit').value = p.precio_medida_unit || 'unid';
        if (p.categoria_id) document.getElementById('product_category').value = p.categoria_id;
        document.getElementById('product_description').value = p.descripcion || '';
        document.getElementById('esta_disponible').checked = p.esta_disponible;

        if (p.imagen_url) {
            document.getElementById('photo_preview').src = p.imagen_url;
            document.getElementById('photo_preview').classList.remove('hidden');
            document.getElementById('photo_placeholder').classList.add('hidden');
        }

        if (p.variaciones) {
            if (p.variaciones.tamanos) {
                tamanos = p.variaciones.tamanos;
                renderTamanos();
            }
            if (p.variaciones.sabores) {
                sabores = p.variaciones.sabores;
                const maxSaboresInput = document.getElementById('max_sabores');
                if (maxSaboresInput) maxSaboresInput.value = p.variaciones.max_sabores || 1;
                renderSabores();
            }
        }
        
        // Disparar cambio de categoría para cargar checkboxes si hay categoría
        if (p.categoria_id) {
            onCategoryChange();
        }
    } catch (err) {
        console.error("Error al cargar producto:", err);
        mostrarNotificacion("Error al cargar el producto para editar", "error");
    }
}

let allCategories = [];

async function cargarCategorias(negocioId) {
    const select = document.getElementById('product_category');
    if (!select) return;

    try {
        const response = await fetch(`/api/negocio/${negocioId}/categorias`);
        allCategories = await response.json();

        if (allCategories.length === 0) {
            select.innerHTML = '<option value="">Sin categorías. Créalas en el catálogo.</option>';
            return;
        }

        select.innerHTML = '<option value="" disabled selected>Selecciona una categoría...</option>' + 
            allCategories.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

    } catch (error) {
        console.error("Error al cargar categorías:", error);
    }
}

function onCategoryChange() {
    const select = document.getElementById('product_category');
    const catId = select.value;
    const cat = allCategories.find(c => c.id === catId);
    
    const container = document.getElementById('category_flavors_container');
    const list = document.getElementById('category_flavors_list');
    
    if (cat && cat.variaciones && cat.variaciones.sabores && cat.variaciones.sabores.length > 0) {
        let flavorsHtml = '';
        
        cat.variaciones.sabores.forEach(s => {
            if (!s.activo && !sabores.includes(s.nombre)) return; // Ignorar inactivos si no estaban seleccionados
            
            const isChecked = sabores.includes(s.nombre);
            
            // Mover sabor de chips personalizados a los checkboxes
            if (isChecked) {
                sabores = sabores.filter(custom => custom !== s.nombre);
            }
            
            flavorsHtml += `
                <label class="flex items-center gap-2 p-2 rounded border border-outline-variant/30 cursor-pointer hover:bg-surface-container-high transition-colors">
                    <input type="checkbox" value="${s.nombre}" class="cat-flavor-checkbox w-4 h-4 text-primary bg-surface-container-lowest border-outline-variant rounded focus:ring-primary focus:ring-2" ${isChecked ? 'checked' : ''}>
                    <span class="text-[14px] text-on-surface select-none">${s.nombre} ${!s.activo ? '<span class="text-[10px] text-error">(Inactivo)</span>' : ''}</span>
                </label>
            `;
        });
        
        if (flavorsHtml) {
            list.innerHTML = flavorsHtml;
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    } else {
        container.classList.add('hidden');
    }
    
    // Volver a renderizar chips por si se movieron a checkboxes
    renderSabores();
}

function seleccionarTodosSaboresCategoria() {
    document.querySelectorAll('.cat-flavor-checkbox').forEach(cb => {
        cb.checked = true;
    });
}

let tamanos = [];
let sabores = [];

// -- Lógica de Tamaños (Opciones con Precio) --
function addTamano() {
    const inputNombre = document.getElementById('tamano_nombre');
    const inputPrecio = document.getElementById('tamano_precio');
    const nombre = inputNombre.value.trim();
    const precio = parseFloat(inputPrecio.value);

    if (!nombre || isNaN(precio) || precio < 0) return;

    tamanos.push({ nombre, precio });
    renderTamanos();
    
    inputNombre.value = '';
    inputPrecio.value = '';
    inputNombre.focus();
}

function removeTamano(index) {
    tamanos.splice(index, 1);
    renderTamanos();
}

function renderTamanos() {
    const container = document.getElementById('tamanos_container');
    container.innerHTML = tamanos.map((t, i) => `
        <div class="flex items-center justify-between bg-surface-container rounded-lg p-3 border border-outline-variant/30 animate-in fade-in duration-200">
            <div>
                <span class="font-bold text-on-surface">${t.nombre}</span>
                <span class="ml-2 px-2 py-0.5 bg-primary/10 text-primary rounded text-sm font-black">$${t.precio.toFixed(2)}</span>
            </div>
            <button onclick="removeTamano(${i})" type="button" class="w-8 h-8 rounded-full text-error hover:bg-error-container flex items-center justify-center transition-colors">
                <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
        </div>
    `).join('');
}

// -- Lógica de Sabores (Complementos Gratuitos) --
function addSabor(e) {
    if (e && e.type === 'keypress' && e.key !== 'Enter') return;
    if (e) e.preventDefault();

    const input = document.getElementById('sabor_input');
    const value = input.value.trim();
    if (!value) return;

    if (sabores.includes(value)) {
        input.value = '';
        return;
    }

    sabores.push(value);
    renderSabores();
    input.value = '';
    input.focus();
}

function removeSabor(index) {
    sabores.splice(index, 1);
    renderSabores();
}

function renderSabores() {
    const container = document.getElementById('sabores_container');
    container.innerHTML = sabores.map((s, i) => `
        <div class="flex items-center gap-2 bg-surface-variant text-on-surface-variant px-3 py-1.5 rounded-full text-sm font-bold animate-in zoom-in-50 duration-200">
            <span>${s}</span>
            <button onclick="removeSabor(${i})" type="button" class="w-4 h-4 rounded-full bg-outline-variant/30 flex items-center justify-center hover:bg-outline-variant/50 transition-colors">
                <span class="material-symbols-outlined text-[12px] font-black">close</span>
            </button>
        </div>
    `).join('');
}

async function guardarProducto(e, negocioId) {
    e.preventDefault();
    const btn = document.querySelector('button.bg-primary');
    const originalText = btn.innerHTML;

    const nombre = document.getElementById('product_name').value;
    const precio = document.getElementById('product_price').value;
    const unidad = document.getElementById('product_unit').value;
    const categoria_id = document.getElementById('product_category').value;
    const descripcion = document.getElementById('product_description').value;
    const fotoInput = document.getElementById('product_photo');
    const esta_disponible = document.getElementById('esta_disponible').checked;
    
    const dropzoneInput = document.querySelector('input[type="file"]');
    const fotoFile = (fotoInput ? fotoInput.files[0] : null) || (dropzoneInput ? dropzoneInput.files[0] : null);

    if (!nombre || !precio) {
        mostrarNotificacion("Por favor completa el nombre y precio base.", "error");
        return;
    }

    let imagen_base64 = null;
    if (fotoFile) {
        imagen_base64 = await toBase64(fotoFile);
    }

    const maxSaboresInput = document.getElementById('max_sabores');
    const max_sabores = maxSaboresInput ? parseInt(maxSaboresInput.value) || 1 : 1;

    // Recoger sabores de categoría (checkboxes) + libres (chips)
    const checkedCatFlavors = Array.from(document.querySelectorAll('.cat-flavor-checkbox:checked')).map(cb => cb.value);
    const finalSabores = [...new Set([...sabores, ...checkedCatFlavors])];

    // Estructurar las variaciones en el formato JSON esperado
    const variacionesJson = {
        tamanos: tamanos.length > 0 ? tamanos : undefined,
        sabores: finalSabores.length > 0 ? finalSabores : undefined,
        max_sabores: finalSabores.length > 0 ? max_sabores : undefined
    };

    // Si ambos están vacíos, mandamos null
    const hasVariations = variacionesJson.tamanos || variacionesJson.sabores;

    const payload = {
        negocio_id: negocioId,
        nombre,
        precio,
        unidad,
        categoria_id,
        descripcion,
        imagen_base64,
        variaciones: hasVariations ? variacionesJson : null,
        disponible: esta_disponible
    };

    btn.innerHTML = "Guardando...";
    btn.disabled = true;

    const url = editProductId ? `/api/productos/${editProductId}` : '/api/productos';
    const method = editProductId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            mostrarNotificacion("Producto guardado con éxito", "success");
            setTimeout(() => window.location.href = 'catalogo.html', 1500);
        } else {
            const data = await response.json();
            mostrarNotificacion("Error: " + data.error, "error");
        }
    } catch (error) {
        console.error(error);
        mostrarNotificacion("Error de conexión", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('photo_preview').src = e.target.result;
            document.getElementById('photo_preview').classList.remove('hidden');
            document.getElementById('photo_placeholder').classList.add('hidden');
        }
        reader.readAsDataURL(input.files[0]);
    }
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Comprimir a JPEG con 80% de calidad para ahorrar muchísimo espacio
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = error => reject(error);
    };
    reader.onerror = error => reject(error);
});

// -- Sistema de Notificaciones (Toasts) --
function mostrarNotificacion(mensaje, tipo = 'success') {
    const toast = document.createElement('div');
    const isError = tipo === 'error';
    toast.className = `fixed bottom-24 md:bottom-10 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full font-bold text-sm shadow-xl z-[100] transition-all duration-300 translate-y-10 opacity-0 flex items-center gap-2 ${isError ? 'bg-error text-on-error' : 'bg-primary-container text-on-primary-container'}`;
    
    toast.innerHTML = `
        <span class="material-symbols-outlined text-[18px]">${isError ? 'error' : 'check_circle'}</span>
        ${mensaje}
    `;

    document.body.appendChild(toast);

    // Animar entrada
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    });

    // Remover después de 3s
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
