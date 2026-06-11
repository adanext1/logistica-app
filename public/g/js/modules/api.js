// Módulo de API y llamadas al servidor

export async function registrarEvento(negocioId, tipo, detalles = {}) {
    try {
        await fetch('/api/eventos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                negocio_id: negocioId,
                tipo_evento: tipo,
                detalles
            })
        });
    } catch (e) { }
}

export async function fetchNegocio(slug) {
    const res = await fetch(`/api/negocio/${slug}`);
    if (!res.ok) throw new Error('No encontrado');
    return await res.json();
}

export async function fetchCategorias(negocioId) {
    const res = await fetch(`/api/negocio/${negocioId}/categorias`);
    if (!res.ok) throw new Error('Error cargando categorías');
    return await res.json();
}

export async function fetchProductos(negocioId) {
    const res = await fetch(`/api/negocio/${negocioId}/productos`);
    if (!res.ok) throw new Error('Error cargando productos');
    return await res.json();
}

export async function fetchOfertasYEventos(negocioId) {
    const [resO, resE] = await Promise.all([
        fetch(`/api/negocio/${negocioId}/ofertas`),
        fetch(`/api/negocio/${negocioId}/eventos`)
    ]);
    const ofertas = resO.ok ? await resO.json() : [];
    const eventos = resE.ok ? await resE.json() : [];
    return { ofertas, eventos };
}
