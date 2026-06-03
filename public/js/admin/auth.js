export const tokenAdmin = localStorage.getItem('admin_token');

if (!tokenAdmin) {
    window.location.replace('/login.html');
}

export function cerrarSesion() {
    localStorage.removeItem('admin_token');
    window.location.replace('/login.html');
}

/**
 * Fetch wrapper que detecta sesiones expiradas (401) y redirige al login.
 */
export async function fetchConAuth(url, options = {}) {
    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${tokenAdmin}`
    };
    const res = await fetch(url, options);
    if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        if (data.expired) {
            alert('Tu sesión ha expirado. Vuelve a iniciar sesión.');
        }
        cerrarSesion();
        return null;
    }
    return res;
}
