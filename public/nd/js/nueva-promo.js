const negocioId = localStorage.getItem('negocio_id');
let editPromoId = null;
let currentImageBase64 = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!negocioId) {
        window.location.href = 'login-negocio.html';
        return;
    }

    // Check if editing
    const params = new URLSearchParams(window.location.search);
    editPromoId = params.get('edit');

    if (editPromoId) {
        document.querySelector('h1').innerText = 'Editar Publicación';
        document.getElementById('btnGuardar').innerHTML = '<span class="material-symbols-outlined">save</span> Actualizar Publicación';
        cargarDatosPromo(editPromoId);
    }

    // Image upload handler
    const fileInput = document.getElementById('imagenPromo');
    fileInput.addEventListener('change', handleImageUpload);
    
    // Form submit
    document.getElementById('promoForm').addEventListener('submit', guardarPromo);

    // Actualización dinámica del diseño fallback
    document.getElementById('titulo').addEventListener('input', (e) => {
        document.getElementById('fallbackTitle').innerText = e.target.value || 'TÍTULO';
    });
    document.getElementById('descripcion').addEventListener('input', (e) => {
        document.getElementById('fallbackDesc').innerText = e.target.value || 'Agrega una descripción para ver cómo lucirá tu publicación.';
    });
});

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    if (isVideo) {
        alert("La subida de videos está temporalmente desactivada.");
        e.target.value = '';
        return;
    }

    // Límite de 15MB para videos cortos/reels muy comprimidos
    if (file.size > 15 * 1024 * 1024) {
        alert("El archivo es demasiado pesado (Máx 15MB). Por favor comprímelo.");
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        currentImageBase64 = event.target.result;
        
        const isVideo = file.type.startsWith('video/');
        const imgPreview = document.getElementById('imagePreview');
        const vidPreview = document.getElementById('videoPreview');
        
        if (isVideo) {
            vidPreview.src = currentImageBase64;
            vidPreview.classList.remove('hidden');
            imgPreview.classList.add('hidden');
        } else {
            imgPreview.style.backgroundImage = `url('${currentImageBase64}')`;
            imgPreview.classList.remove('hidden');
            vidPreview.classList.add('hidden');
            vidPreview.src = ''; // Clear video
        }
        
        // Ocultar fallback
        document.getElementById('fallbackPreview').style.opacity = '0';
    };
    reader.readAsDataURL(file);
}

async function cargarDatosPromo(id) {
    try {
        const res = await fetch(`/api/admin/negocio/${negocioId}/ofertas`);
        const ofertas = await res.json();
        const promo = ofertas.find(o => o.id === id);
        
        if (!promo) {
            alert("No se encontró la promoción");
            window.location.href = 'promonovedades.html';
            return;
        }

        // Poblar formulario
        document.getElementById('titulo').value = promo.titulo || '';
        document.getElementById('descripcion').value = promo.descripcion || '';
        if (promo.precio) document.getElementById('precio').value = promo.precio;
        if (promo.mensaje_whatsapp) document.getElementById('mensaje_whatsapp').value = promo.mensaje_whatsapp;
        document.getElementById('esta_activa').checked = promo.esta_activa;
        
        if (promo.tipo === 'evento') {
            document.querySelector('input[name="tipo"][value="evento"]').checked = true;
        } else {
            document.querySelector('input[name="tipo"][value="promocion"]').checked = true;
        }

        if (promo.fecha_inicio) document.getElementById('fecha_inicio').value = promo.fecha_inicio.split('T')[0];
        if (promo.fecha_fin) document.getElementById('fecha_fin').value = promo.fecha_fin.split('T')[0];
        if (promo.hora_inicio) document.getElementById('hora_inicio').value = promo.hora_inicio;
        if (promo.hora_fin) document.getElementById('hora_fin').value = promo.hora_fin;

        if (promo.dias_ciclicos && Array.isArray(promo.dias_ciclicos)) {
            promo.dias_ciclicos.forEach(day => {
                const cb = document.getElementById(`day-${day}`);
                if (cb) cb.checked = true;
            });
        }

        if (promo.imagen_url) {
            const isVideo = promo.imagen_url.match(/\.(mp4|webm|mov|ogg)(\?.*)?$/i);
            const imgPreview = document.getElementById('imagePreview');
            const vidPreview = document.getElementById('videoPreview');
            
            if (isVideo) {
                vidPreview.src = promo.imagen_url;
                vidPreview.classList.remove('hidden');
            } else {
                imgPreview.style.backgroundImage = `url('${promo.imagen_url}')`;
                imgPreview.classList.remove('hidden');
            }
            document.getElementById('fallbackPreview').style.opacity = '0';
        }
        
        // Forzar actualización del fallback por si luego borran la imagen
        document.getElementById('titulo').dispatchEvent(new Event('input'));
        document.getElementById('descripcion').dispatchEvent(new Event('input'));
        
    } catch (e) {
        console.error(e);
        alert("Error al cargar los datos");
    }
}

async function guardarPromo(e) {
    e.preventDefault();
    
    const btnGuardar = document.getElementById('btnGuardar');
    const originalText = btnGuardar.innerHTML;
    btnGuardar.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div> Guardando...';
    btnGuardar.disabled = true;

    try {
        // Recolectar datos
        const titulo = document.getElementById('titulo').value;
        const descripcion = document.getElementById('descripcion').value;
        const precio = document.getElementById('precio').value;
        const mensaje_whatsapp = document.getElementById('mensaje_whatsapp').value;
        const tipo = document.querySelector('input[name="tipo"]:checked').value;
        const esta_activa = document.getElementById('esta_activa').checked;
        const fecha_inicio = document.getElementById('fecha_inicio').value;
        const fecha_fin = document.getElementById('fecha_fin').value;
        const hora_inicio = document.getElementById('hora_inicio').value;
        const hora_fin = document.getElementById('hora_fin').value;

        // Días cíclicos (0-6)
        const dias_ciclicos = [];
        document.querySelectorAll('.day-checkbox:checked').forEach(cb => {
            dias_ciclicos.push(parseInt(cb.value));
        });

        const payload = {
            negocio_id: negocioId,
            titulo,
            descripcion,
            precio: precio || null,
            mensaje_whatsapp: mensaje_whatsapp || null,
            tipo,
            esta_activa,
            fecha_inicio: fecha_inicio || null,
            fecha_fin: fecha_fin || null,
            hora_inicio: hora_inicio || null,
            hora_fin: hora_fin || null,
            dias_ciclicos,
            imagen_base64: currentImageBase64
        };

        const url = editPromoId ? `/api/ofertas/${editPromoId}` : '/api/ofertas';
        const method = editPromoId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            window.location.href = 'promonovedades.html';
        } else {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Error al guardar');
        }

    } catch (error) {
        alert(error.message);
        btnGuardar.innerHTML = originalText;
        btnGuardar.disabled = false;
    }
}
