import { tokenAdmin, cerrarSesion } from './auth.js';

export async function cargarConfiguracionGlobal() {
    const costoInput = document.getElementById('global_costo_envio_base');
    const distInput = document.getElementById('global_distancia_base');
    const incrInput = document.getElementById('global_costo_incremento');
    const form = document.getElementById('formConfiguracionGlobal');

    // Deshabilitar inputs mientras se cargan los datos
    costoInput.disabled = true;
    distInput.disabled = true;
    incrInput.disabled = true;

    try {
        const res = await fetch('/api/configuracion');
        if (!res.ok) throw new Error('Error al cargar configuración.');

        const data = await res.json();
        
        costoInput.value = data.costo_envio_base !== undefined ? data.costo_envio_base : 35;
        distInput.value = data.distancia_base !== undefined ? data.distancia_base : 2;
        incrInput.value = data.costo_incremento !== undefined ? data.costo_incremento : 10;

    } catch (error) {
        console.error(error);
        if (typeof notificar === 'function') {
            notificar("No se pudo cargar la configuración de tarifas.", 'error');
        }
    } finally {
        costoInput.disabled = false;
        distInput.disabled = false;
        incrInput.disabled = false;
    }

    // Configurar listener para guardar los cambios
    if (form && !form.dataset.listenerSet) {
        form.dataset.listenerSet = "true";
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            await guardarConfiguracionGlobal();
        });
    }
}

export async function guardarConfiguracionGlobal() {
    const btn = document.getElementById('btnSubmitConfigGlobal');
    const originalHtml = btn.innerHTML;

    btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';
    btn.disabled = true;

    const costo_envio_base = document.getElementById('global_costo_envio_base').value;
    const distancia_base = document.getElementById('global_distancia_base').value;
    const costo_incremento = document.getElementById('global_costo_incremento').value;

    try {
        const response = await fetch('/api/configuracion', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenAdmin}`
            },
            body: JSON.stringify({ costo_envio_base, distancia_base, costo_incremento })
        });

        if (response.status === 401) {
            if (typeof notificar === 'function') notificar("Tu sesión expiró. Inicia sesión de nuevo.", 'error');
            cerrarSesion();
            return;
        }

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "No se pudo guardar la configuración.");
        }

        if (typeof notificar === 'function') {
            notificar("¡Configuración global guardada correctamente!");
        }

    } catch (error) {
        if (typeof notificar === 'function') {
            notificar(error.message, 'error');
        }
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}
