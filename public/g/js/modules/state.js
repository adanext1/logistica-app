// Estado global de la tienda
export const state = {
    slug: window.location.pathname.replace(/^\//, '').replace(/\/$/, ''),
    negocioIdGlobal: null,
    productosDB: [],
    categoriasDB: [],
    ofertasDB: [],
    eventosDB: [],
    carrito: {},
    filtroActual: 'todos',
    busquedaActual: '',
    slidePromos: [],
    negocioPhone: null,
    configActual: { productoId: null, tamano: null, sabores: [] },
    productoDetalleIdGlobal: null
};
