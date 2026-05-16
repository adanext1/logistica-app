let todasLasPromos = [];
const negocioId = localStorage.getItem('negocio_id');

document.addEventListener('DOMContentLoaded', () => {
    if (!negocioId) {
        window.location.href = 'login-negocio.html';
        return;
    }
    cargarPromos();
});

async function cargarPromos() {
    const container = document.getElementById('promosContainer');
    try {
        const res = await fetch(`/api/admin/negocio/${negocioId}/ofertas`);
        if (!res.ok) throw new Error('Error al cargar promos');
        
        todasLasPromos = await res.json();
        renderPromos(todasLasPromos);
    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="col-span-full text-center py-12 text-error">Ocurrió un error al cargar las promociones.</div>`;
    }
}

function renderPromos(promos) {
    const container = document.getElementById('promosContainer');
    container.innerHTML = '';

    if (promos.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 bg-surface-container-low rounded-2xl border border-dashed border-outline-variant">
                <span class="material-symbols-outlined text-4xl text-outline-variant mb-2">campaign</span>
                <p class="font-bold text-on-surface">No tienes publicaciones aún</p>
                <p class="text-sm text-on-surface-variant">Crea tu primera promoción o evento para atraer más clientes.</p>
            </div>`;
        return;
    }

    promos.forEach(p => {
        // Formatear tipo
        const iconoTipo = p.tipo === 'evento' ? 'campaign' : 'sell';
        const textoTipo = p.tipo === 'evento' ? 'Evento/Novedad' : 'Promoción';
        
        // Estado
        const isActiva = p.esta_activa;
        const colorEstado = isActiva ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
        const textoEstado = isActiva ? 'Activa' : 'Inactiva';

        // Media Handling (Image, Video, or Fallback gradient)
        let mediaHtml = '';
        if (p.imagen_url) {
            const isVideo = p.imagen_url.match(/\.(mp4|webm|mov|ogg)(\?.*)?$/i);
            if (isVideo) {
                mediaHtml = `<video src="${p.imagen_url}" class="w-full h-full object-cover" autoplay loop muted playsinline></video>`;
            } else {
                mediaHtml = `<div class="w-full h-full bg-cover bg-center" style="background-image: url('${p.imagen_url}')"></div>`;
            }
        } else {
            mediaHtml = `
            <div class="w-full h-full bg-gradient-to-br from-primary to-secondary p-4 flex flex-col justify-center items-center text-center">
                <h4 class="text-white font-extrabold text-lg drop-shadow-md line-clamp-2 leading-tight">${p.titulo || 'Sin título'}</h4>
                <p class="text-white/90 text-xs drop-shadow line-clamp-2 mt-2">${p.descripcion || ''}</p>
            </div>`;
        }
        
        // Detalles de programación
        let programacion = '';
        if (p.precio) {
            programacion += `<div class="flex items-center gap-1 text-xs text-primary font-bold mb-1"><span class="material-symbols-outlined text-[14px]">payments</span> Precio Especial: $${parseFloat(p.precio).toFixed(2)}</div>`;
        }
        if (p.mensaje_whatsapp) {
            programacion += `<div class="flex items-center gap-1 text-xs text-green-600 font-medium mb-1"><span class="material-symbols-outlined text-[14px]">chat</span> Respuesta WhatsApp configurada</div>`;
        }
        if (p.fecha_inicio || p.fecha_fin) {
            programacion += `<div class="flex items-center gap-1 text-xs text-on-surface-variant mb-1"><span class="material-symbols-outlined text-[14px]">calendar_today</span> Fechas configuradas</div>`;
        }
        if (p.dias_ciclicos && p.dias_ciclicos.length > 0) {
            programacion += `<div class="flex items-center gap-1 text-xs text-on-surface-variant mb-1"><span class="material-symbols-outlined text-[14px]">event_repeat</span> Días cíclicos</div>`;
        }
        if (p.hora_inicio || p.hora_fin) {
            programacion += `<div class="flex items-center gap-1 text-xs text-on-surface-variant mb-1"><span class="material-symbols-outlined text-[14px]">schedule</span> Horario específico</div>`;
        }
        if (!programacion) {
            programacion = `<div class="text-xs text-on-surface-variant italic">Siempre visible (si está activa)</div>`;
        }

        const card = document.createElement('div');
        card.className = `bg-surface-container-lowest border border-outline-variant/30 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-all hover:shadow-md ${!isActiva ? 'opacity-75 grayscale-[50%]' : ''}`;
        
        card.innerHTML = `
            <div class="h-56 w-full relative border-b border-outline-variant/30 bg-surface-container overflow-hidden">
                ${mediaHtml}
                <div class="absolute top-3 left-3 bg-white/90 backdrop-blur text-xs font-bold px-2 py-1 rounded flex items-center gap-1 text-on-surface shadow-sm z-10">
                    <span class="material-symbols-outlined text-[16px]">${iconoTipo}</span> ${textoTipo}
                </div>
                <div class="absolute top-3 right-3 ${colorEstado} text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider shadow-sm z-10">
                    ${textoEstado}
                </div>
            </div>
            <div class="p-4 flex-1 flex flex-col">
                <h3 class="font-bold text-lg text-on-surface mb-1 truncate" title="${p.titulo}">${p.titulo}</h3>
                <p class="text-sm text-on-surface-variant line-clamp-2 mb-3 flex-1">${p.descripcion || 'Sin descripción'}</p>
                
                <div class="bg-surface-container-low p-2 rounded-lg mb-4">
                    ${programacion}
                </div>

                <div class="flex items-center justify-between border-t border-outline-variant/30 pt-3 mt-auto">
                    <button onclick="toggleActiva('${p.id}', ${!isActiva})" class="text-sm font-bold ${!isActiva ? 'text-green-600' : 'text-gray-500'} hover:underline flex items-center gap-1">
                        <span class="material-symbols-outlined text-[18px]">${!isActiva ? 'play_circle' : 'pause_circle'}</span>
                        ${!isActiva ? 'Activar' : 'Pausar'}
                    </button>
                    <div class="flex gap-2">
                        <a href="nueva-promo.html?edit=${p.id}" class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors" title="Editar">
                            <span class="material-symbols-outlined text-[18px]">edit</span>
                        </a>
                        <button onclick="eliminarPromo('${p.id}')" class="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors" title="Eliminar">
                            <span class="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function filtrarPromos() {
    const query = document.getElementById('promoSearch').value.toLowerCase();
    const filtradas = todasLasPromos.filter(p => 
        (p.titulo && p.titulo.toLowerCase().includes(query)) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(query))
    );
    renderPromos(filtradas);
}

async function toggleActiva(id, nuevoEstado) {
    // Buscar los datos actuales de la promo para no machacar lo demás
    const promo = todasLasPromos.find(p => p.id === id);
    if (!promo) return;

    try {
        const res = await fetch(`/api/ofertas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...promo, esta_activa: nuevoEstado })
        });
        
        if (res.ok) {
            cargarPromos(); // Recargar para mostrar el nuevo estado
        } else {
            alert("Error al actualizar el estado");
        }
    } catch (e) {
        console.error(e);
        alert("Error de red");
    }
}

async function eliminarPromo(id) {
    if (!confirm('¿Estás seguro de eliminar esta publicación de forma permanente?')) return;

    try {
        const res = await fetch(`/api/ofertas/${id}`, { method: 'DELETE' });
        if (res.ok) {
            cargarPromos();
        } else {
            alert('Error al eliminar');
        }
    } catch (e) {
        console.error(e);
        alert('Error de red');
    }
}
