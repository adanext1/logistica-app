/**
 * Lógica para Crear Producto (Real Schema)
 */

document.addEventListener('DOMContentLoaded', () => {
    const id = localStorage.getItem('negocio_id');
    if (!id) return;

    cargarCategorias(id);

    const form = document.querySelector('form') || document.getElementById('nuevoProductoForm');
    const saveBtn = document.querySelector('button.bg-primary');

    if (saveBtn) {
        saveBtn.addEventListener('click', (e) => guardarProducto(e, id));
    }
});

async function cargarCategorias(negocioId) {
    const select = document.getElementById('product_category');
    if (!select) return;

    try {
        const response = await fetch(`/api/negocio/${negocioId}/categorias`);
        const categorias = await response.json();

        if (categorias.length === 0) {
            select.innerHTML = '<option value="">Sin categorías. Créalas en el catálogo.</option>';
            return;
        }

        select.innerHTML = '<option value="" disabled selected>Selecciona una categoría...</option>' + 
            categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

    } catch (error) {
        console.error("Error al cargar categorías:", error);
    }
}

let variaciones = [];

function addVariation() {
    const input = document.getElementById('variation_input');
    const value = input.value.trim();
    if (!value) return;

    if (variaciones.includes(value)) {
        input.value = '';
        return;
    }

    variaciones.push(value);
    renderVariations();
    input.value = '';
    input.focus();
}

function removeVariation(index) {
    variaciones.splice(index, 1);
    renderVariations();
}

function renderVariations() {
    const container = document.getElementById('variations_container');
    container.innerHTML = variaciones.map((v, i) => `
        <div class="flex items-center gap-2 bg-orange-100 text-orange-900 px-3 py-1.5 rounded-full text-sm font-bold animate-in zoom-in-50 duration-200">
            <span>${v}</span>
            <button onclick="removeVariation(${i})" type="button" class="w-4 h-4 rounded-full bg-orange-200 flex items-center justify-center hover:bg-orange-300 transition-colors">
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
        alert("Por favor completa los campos obligatorios.");
        return;
    }

    let imagen_base64 = null;
    if (fotoFile) {
        imagen_base64 = await toBase64(fotoFile);
    }

    const payload = {
        negocio_id: negocioId,
        nombre,
        precio,
        unidad,
        categoria_id,
        descripcion,
        imagen_base64,
        variaciones,
        disponible: esta_disponible
    };

    btn.innerHTML = "Guardando...";
    btn.disabled = true;

    try {
        const response = await fetch('/api/productos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("Producto guardado con éxito");
            window.location.href = 'catalogo.html';
        } else {
            const data = await response.json();
            alert("Error: " + data.error);
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión");
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
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});
