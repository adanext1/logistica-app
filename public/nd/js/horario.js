/**
 * Gestión Dinámica de Horarios del Negocio
 */

const DIAS_MAP = {
    "lunes": 1,
    "martes": 2,
    "miercoles": 3,
    "jueves": 4,
    "viernes": 5,
    "sabado": 6,
    "domingo": 7
};

document.addEventListener('DOMContentLoaded', async () => {
    const id = localStorage.getItem('negocio_id');
    if (!id) return;

    // Inicializar estados visuales para todos los días
    Object.keys(DIAS_MAP).forEach(dia => toggleDia(dia));

    cargarHorarios(id);

    const btnGuardar = document.querySelector('button.bg-primary');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', () => guardarHorarios(id));
    }
});

/**
 * Controla la visibilidad y estado de los inputs según el switch
 */
function toggleDia(diaId) {
    const row = document.getElementById(`row-${diaId}`);
    const switchEl = document.getElementById(`${diaId}-switch`);
    const timeControls = row.querySelector('.time-controls');
    const inputs = timeControls.querySelectorAll('.flex.items-center');
    const closedMsg = timeControls.querySelector('.closed-msg');

    if (switchEl.checked) {
        // Día Abierto
        row.classList.remove('opacity-60');
        inputs.forEach(i => i.classList.remove('hidden'));
        closedMsg.classList.add('hidden');
    } else {
        // Día Cerrado
        row.classList.add('opacity-60');
        inputs.forEach(i => i.classList.add('hidden'));
        closedMsg.classList.remove('hidden');
    }
}

async function cargarHorarios(id) {
    try {
        const response = await fetch(`/api/negocio/${id}/horario`);
        if (!response.ok) return;
        const data = await response.json();

        if (data && data.length > 0) {
            data.forEach(config => {
                const diaId = Object.keys(DIAS_MAP).find(key => DIAS_MAP[key] === config.day_of_week);
                if (diaId) {
                    const switchEl = document.getElementById(`${diaId}-switch`);
                    const inicioEl = document.getElementById(`${diaId}-inicio`);
                    const finEl = document.getElementById(`${diaId}-fin`);

                    if (switchEl) switchEl.checked = !config.esta_cerrado;
                    if (inicioEl && config.open_time) inicioEl.value = config.open_time.substring(0, 5);
                    if (finEl && config.close_time) finEl.value = config.close_time.substring(0, 5);
                    
                    toggleDia(diaId); // Sincronizar UI
                }
            });
        }
    } catch (error) {
        console.error("Error al cargar horarios:", error);
    }
}

async function guardarHorarios(id) {
    const btn = document.querySelector('button.bg-primary');
    const originalText = btn.innerText;

    const horarios = [];
    Object.keys(DIAS_MAP).forEach(diaId => {
        const switchEl = document.getElementById(`${diaId}-switch`);
        const inicioEl = document.getElementById(`${diaId}-inicio`);
        const finEl = document.getElementById(`${diaId}-fin`);

        horarios.push({
            day_of_week: DIAS_MAP[diaId],
            open_time: inicioEl ? inicioEl.value : "09:00",
            close_time: finEl ? finEl.value : "18:00",
            esta_cerrado: !switchEl.checked
        });
    });

    btn.innerText = "Guardando...";
    btn.disabled = true;

    try {
        const response = await fetch(`/api/negocio/${id}/horario`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ horarios })
        });

        if (response.ok) {
            alert("✅ Horarios actualizados correctamente");
        } else {
            alert("❌ Error al guardar horarios");
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

/**
 * Copia el horario del Lunes a todos los demás días
 */
function copiarATodos() {
    const inicioLunes = document.getElementById('lunes-inicio').value;
    const finLunes = document.getElementById('lunes-fin').value;
    const switchLunes = document.getElementById('lunes-switch').checked;

    Object.keys(DIAS_MAP).forEach(diaId => {
        if (diaId === 'lunes') return;
        
        const switchEl = document.getElementById(`${diaId}-switch`);
        const inicioEl = document.getElementById(`${diaId}-inicio`);
        const finEl = document.getElementById(`${diaId}-fin`);

        if (switchEl) switchEl.checked = switchLunes;
        if (inicioEl) inicioEl.value = inicioLunes;
        if (finEl) finEl.value = finLunes;
        
        toggleDia(diaId); // Sincronizar UI
    });

    // Pequeño feedback visual
    const btn = document.querySelector('button[onclick="copiarATodos()"]');
    const originalText = btn.innerText;
    btn.innerText = "¡COPIADO!";
    btn.classList.add('text-green-600');
    setTimeout(() => {
        btn.innerText = originalText;
        btn.classList.remove('text-green-600');
    }, 2000);
}

// Exponer funciones necesarias globalmente
window.toggleDia = toggleDia;
window.copiarATodos = copiarATodos;
