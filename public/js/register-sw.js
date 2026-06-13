// public/js/register-sw.js - Registro de Service Worker e Instalador PWA para Repartidores Pandas

// ─────────────────────────────────────────────────────────────────────────────
// 1. Registro del Service Worker
// ─────────────────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('Service Worker registrado. Ámbito:', registration.scope);
            })
            .catch((error) => {
                console.error('Error al registrar el Service Worker:', error);
            });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Detección de estado de instalación
// ─────────────────────────────────────────────────────────────────────────────
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Control del prompt nativo (Android / Chromium)
// ─────────────────────────────────────────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (!isStandalone) {
        // Mostrar botones permanentes inline
        showInlineButtons();
        // Mostrar el banner flotante si no fue descartado
        if (!localStorage.getItem('pwa_banner_dismissed')) {
            showInstallBanner('android');
        }
    }
});

// Detectar si el usuario lo instaló: ocultar botones inline
window.addEventListener('appinstalled', () => {
    hideInlineButtons();
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
    deferredPrompt = null;
    console.log('PWA instalada exitosamente');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Flujo para iOS  
// ─────────────────────────────────────────────────────────────────────────────
if (isIOS && !isStandalone) {
    window.addEventListener('load', () => {
        // Mostrar botones inline siempre en iOS si no está instalada
        showInlineButtons();
        // Banner flotante con retraso si no fue descartado
        if (!localStorage.getItem('pwa_ios_prompt_dismissed')) {
            setTimeout(() => {
                if (!document.getElementById('pwa-install-banner')) {
                    showInstallBanner('ios');
                }
            }, 4000);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Función global para disparar instalación (usada por botones inline)
// ─────────────────────────────────────────────────────────────────────────────
window.triggerPwaInstall = function () {
    if (isIOS) {
        // En iOS: mostrar el banner con instrucciones
        const existing = document.getElementById('pwa-install-banner');
        if (existing) existing.remove(); // refrescar si ya estaba
        showInstallBanner('ios');
    } else if (deferredPrompt) {
        // En Android/Chromium: disparar el prompt nativo
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((result) => {
            if (result.outcome === 'accepted') {
                hideInlineButtons();
            }
            deferredPrompt = null;
        });
    } else {
        // Fallback: mostrar el banner flotante
        const existing = document.getElementById('pwa-install-banner');
        if (!existing) showInstallBanner('android');
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Visibilidad de botones inline permanentes
// ─────────────────────────────────────────────────────────────────────────────
function showInlineButtons() {
    // Panel Admin Maestro
    const adminBtn = document.getElementById('pwa-inline-btn-admin');
    if (adminBtn) {
        adminBtn.classList.remove('hidden');
        adminBtn.classList.add('flex');
    }
    // Panel Negocios
    const negocioBtn = document.getElementById('pwa-inline-btn-negocio');
    if (negocioBtn) {
        negocioBtn.classList.remove('hidden');
        negocioBtn.classList.add('flex');
    }
}

function hideInlineButtons() {
    const adminBtn = document.getElementById('pwa-inline-btn-admin');
    if (adminBtn) {
        adminBtn.classList.add('hidden');
        adminBtn.classList.remove('flex');
    }
    const negocioBtn = document.getElementById('pwa-inline-btn-negocio');
    if (negocioBtn) {
        negocioBtn.classList.add('hidden');
        negocioBtn.classList.remove('flex');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Banner flotante premium
// ─────────────────────────────────────────────────────────────────────────────
function showInstallBanner(platform) {
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';

    banner.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 16px;
        right: 16px;
        background-color: rgba(15, 23, 42, 0.97);
        color: #ffffff;
        padding: 16px;
        border-radius: 20px;
        box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(249, 115, 22, 0.2);
        z-index: 99999;
        font-family: 'Outfit', sans-serif;
        border: 1px solid rgba(51, 65, 85, 0.5);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.45s ease;
        transform: translateY(180px);
        opacity: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
    `;

    if (window.innerWidth >= 768) {
        banner.style.width = '400px';
        banner.style.left = 'auto';
        banner.style.right = '24px';
        banner.style.bottom = '24px';
    }

    const isMasterAdmin = window.location.pathname.includes('admin.html');
    const appName = isMasterAdmin ? 'Admin Pandas (Maestro)' : 'Socio Pandas (Negocios)';

    let contentHtml = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:44px;height:44px;background:linear-gradient(135deg,#f97316,#ea580c);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 6px 16px rgba(249,115,22,0.35);">
                    <img src="/img/logo.svg" alt="Logo" style="width:30px;height:30px;display:block;">
                </div>
                <div>
                    <h4 style="margin:0;font-size:14px;font-weight:700;color:#ffffff;line-height:1.2;">Instalar ${appName}</h4>
                    <p style="margin:4px 0 0 0;font-size:11px;color:#94a3b8;line-height:1.4;">Acceso rápido desde tu pantalla de inicio, sin abrir el navegador.</p>
                </div>
            </div>
            <button id="pwa-close-btn" style="background:none;border:none;color:#64748b;cursor:pointer;padding:4px;display:flex;align-items:center;" onmouseover="this.style.color='#ffffff'" onmouseout="this.style.color='#64748b'">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    `;

    if (platform === 'android') {
        contentHtml += `
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button id="pwa-install-btn" style="background:linear-gradient(135deg,#f97316,#ea580c);color:#ffffff;border:none;padding:9px 18px;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(249,115,22,0.3);transition:transform 0.15s ease;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                    ⬇️ Instalar Aplicación
                </button>
            </div>
        `;
    } else if (platform === 'ios') {
        contentHtml += `
            <button id="pwa-ios-btn" style="background:linear-gradient(135deg,#f97316,#ea580c);color:#ffffff;border:none;padding:9px 18px;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;width:100%;transition:transform 0.15s ease;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                📱 ¿Cómo agregar a iPhone / iPad?
            </button>
        `;
    }

    banner.innerHTML = contentHtml;
    document.body.appendChild(banner);

    // Animación de entrada
    requestAnimationFrame(() => {
        setTimeout(() => {
            banner.style.transform = 'translateY(0)';
            banner.style.opacity = '1';
        }, 50);
    });

    // Cerrar
    banner.querySelector('#pwa-close-btn').addEventListener('click', () => {
        dismissBanner(banner, platform);
    });

    if (platform === 'android') {
        banner.querySelector('#pwa-install-btn').addEventListener('click', () => {
            dismissBanner(banner, platform, false);
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((result) => {
                    if (result.outcome === 'accepted') hideInlineButtons();
                    deferredPrompt = null;
                });
            }
        });
    } else if (platform === 'ios') {
        banner.querySelector('#pwa-ios-btn').addEventListener('click', () => {
            showIOSInstructions(banner);
        });
    }
}

function dismissBanner(banner, platform, save = true) {
    banner.style.transform = 'translateY(180px)';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 450);

    if (save) {
        if (platform === 'ios') {
            localStorage.setItem('pwa_ios_prompt_dismissed', 'true');
        } else {
            localStorage.setItem('pwa_banner_dismissed', 'true');
        }
    }
}

function showIOSInstructions(banner) {
    banner.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:10px;">
                <h4 style="margin:0;font-size:14px;font-weight:700;color:#ffffff;">📱 Instalar en iPhone / iPad</h4>
                <button id="pwa-close-instructions-btn" style="background:none;border:none;color:#64748b;cursor:pointer;padding:4px;" onmouseover="this.style.color='#ffffff'" onmouseout="this.style.color='#64748b'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;font-size:12px;color:#cbd5e1;line-height:1.5;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="background:#f97316;color:#ffffff;font-weight:800;min-width:20px;height:20px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:10px;">1</span>
                    <span>Abre esta página en <strong style="color:#ffffff;">Safari</strong> (no funciona desde Chrome en iPhone).</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="background:#f97316;color:#ffffff;font-weight:800;min-width:20px;height:20px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:10px;">2</span>
                    <span>Pulsa el botón <strong style="color:#ffffff;">Compartir</strong> 📤 (cuadrado con flecha hacia arriba, parte inferior de la pantalla).</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="background:#f97316;color:#ffffff;font-weight:800;min-width:20px;height:20px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:10px;">3</span>
                    <span>Selecciona <strong style="color:#ffffff;">"Añadir a la pantalla de inicio"</strong> ➕ y confirma.</span>
                </div>
            </div>
            <button id="pwa-entendido-btn" style="background:linear-gradient(135deg,#f97316,#ea580c);color:#ffffff;border:none;padding:9px 18px;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;width:100%;transition:transform 0.15s ease;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                ✓ Entendido
            </button>
        </div>
    `;

    banner.querySelector('#pwa-close-instructions-btn').addEventListener('click', () => dismissBanner(banner, 'ios'));
    banner.querySelector('#pwa-entendido-btn').addEventListener('click', () => dismissBanner(banner, 'ios'));
}
