/**
 * Gestión del Perfil del Negocio con Mapa Leaflet (Real Schema)
 */

let map, marker;
const defaultLat = 24.1426; // La Paz, BCS
const defaultLng = -110.3127;

document.addEventListener('DOMContentLoaded', async () => {
    const id = localStorage.getItem('negocio_id');
    if (!id) {
        window.location.href = '/login-negocio.html';
        return;
    }

    initMap();
    cargarPerfil(id);

    const form = document.getElementById('perfilForm');
    if (form) {
        form.addEventListener('submit', (e) => guardarPerfil(e, id));
    }
});

function initMap() {
    map = L.map('map').setView([defaultLat, defaultLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);

    marker.on('dragend', function (e) {
        const pos = marker.getLatLng();
        updateCoords(pos.lat, pos.lng);
    });

    map.on('click', function (e) {
        marker.setLatLng(e.latlng);
        updateCoords(e.latlng.lat, e.latlng.lng);
    });
}

function updateCoords(lat, lng) {
    document.getElementById('store_lat').value = lat.toFixed(6);
    document.getElementById('store_lng').value = lng.toFixed(6);
}

async function cargarPerfil(id) {
    try {
        const response = await fetch(`/api/negocio/${id}`);
        if (!response.ok) throw new Error('No se pudo cargar el perfil');
        const data = await response.json();

        // Llenar campos de texto
        document.getElementById('store_name').value = data.nombre_comercial || '';
        document.getElementById('store_whatsapp').value = data.whatsapp || '';
        document.getElementById('store_description').value = data.description || '';
        document.getElementById('store_description_long').value = data.description_long || '';
        document.getElementById('store_address').value = data.address_text || '';

        // Procesar ubicación GPS
        if (data.lat && data.lng) {
            const lat = parseFloat(data.lat);
            const lng = parseFloat(data.lng);
            marker.setLatLng([lat, lng]);
            map.setView([lat, lng], 16);
            updateCoords(lat, lng);
        }

        // Header dynamic info
        const elNombreHeader = document.getElementById('dashboardNombreNegocio');
        const elLogoHeader = document.getElementById('dashboardLogoNegocio');
        const elPlaceholder = document.getElementById('dashboardLogoPlaceholder');

        if (elNombreHeader) elNombreHeader.innerText = `Hola, ${data.nombre_comercial}`;
        
        // Imágenes
        if (data.logo_url) {
            document.getElementById('preview_logo').src = data.logo_url;
            document.getElementById('preview_logo').classList.remove('hidden');
            document.getElementById('placeholder_logo').classList.add('hidden');
            if (elLogoHeader) {
                elLogoHeader.src = data.logo_url;
                elLogoHeader.classList.remove('hidden');
            }
            if (elPlaceholder) elPlaceholder.classList.add('hidden');
        }

        if (data.splash_url) {
            document.getElementById('preview_splash').src = data.splash_url;
            document.getElementById('preview_splash').classList.remove('hidden');
            document.getElementById('placeholder_splash').classList.add('hidden');
        }

    } catch (error) {
        console.error(error);
    }
}

async function guardarPerfil(e, id) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    const payload = {
        nombre_comercial: document.getElementById('store_name').value,
        whatsapp: document.getElementById('store_whatsapp').value,
        description: document.getElementById('store_description').value,
        description_long: document.getElementById('store_description_long').value,
        address_text: document.getElementById('store_address').value,
        lat: parseFloat(document.getElementById('store_lat').value),
        lng: parseFloat(document.getElementById('store_lng').value)
    };

    const logoFile = document.getElementById('input_logo').files[0];
    const splashFile = document.getElementById('input_splash').files[0];

    if (logoFile) payload.logo_base64 = await toBase64(logoFile);
    if (splashFile) payload.splash_base64 = await toBase64(splashFile);

    btn.innerHTML = "Guardando...";
    btn.disabled = true;

    try {
        const response = await fetch(`/api/negocio/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showToast("¡Perfil actualizado con éxito!", "success");
            setTimeout(() => location.reload(), 2000);
        } else {
            showToast("Error al guardar los cambios", "error");
        }
    } catch (error) {
        console.error(error);
        showToast("Error de conexión con el servidor", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function previewImg(input, previewId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        const placeholderId = previewId === 'preview_logo' ? 'placeholder_logo' : 'placeholder_splash';
        reader.onload = function(e) {
            document.getElementById(previewId).src = e.target.result;
            document.getElementById(previewId).classList.remove('hidden');
            document.getElementById(placeholderId).classList.add('hidden');
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

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600';
    const icon = type === 'success' ? 'check_circle' : 'error';
    
    toast.className = `${bgColor} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 transform translate-x-full transition-all duration-300 opacity-0 pointer-events-auto`;
    
    toast.innerHTML = `
        <span class="material-symbols-outlined">${icon}</span>
        <span class="font-medium">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Animación de entrada
    setTimeout(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    }, 10);
    
    // Auto-eliminar
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
