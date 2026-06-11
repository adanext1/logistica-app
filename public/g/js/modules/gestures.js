// Módulo de Soporte de Gestos para Bottom Sheet (Swipe down to close)
import { cerrarDetalleProducto } from './ui.js';

let startY = 0;
let currentY = 0;
let isDragging = false;
let panel = null;
let scrollableContent = null;

export function initGestures() {
    panel = document.getElementById('panelDetalleProducto');
    if (!panel) return;
    
    const handle = document.getElementById('handleDetalleProducto');
    const heroImg = document.getElementById('detalleProdImg');
    scrollableContent = panel.querySelector('.overflow-y-auto');

    if (handle) {
        handle.addEventListener('touchstart', onTouchStart, { passive: true });
        handle.addEventListener('touchmove', onTouchMove, { passive: false });
        handle.addEventListener('touchend', onTouchEnd);
    }

    if (heroImg) {
        heroImg.addEventListener('touchstart', onTouchStart, { passive: true });
        heroImg.addEventListener('touchmove', onTouchMove, { passive: false });
        heroImg.addEventListener('touchend', onTouchEnd);
    }

    if (scrollableContent) {
        scrollableContent.addEventListener('touchstart', function(e) {
            if (scrollableContent.scrollTop <= 0) {
                onTouchStart(e);
            }
        }, { passive: true });

        scrollableContent.addEventListener('touchmove', function(e) {
            if (isDragging) {
                onTouchMove(e);
            } else if (scrollableContent.scrollTop <= 0 && e.touches[0].clientY > startY) {
                isDragging = true;
                onTouchStart(e);
                onTouchMove(e);
            }
        }, { passive: false });

        scrollableContent.addEventListener('touchend', function(e) {
            if (isDragging) {
                onTouchEnd(e);
            }
        });
    }
}

function onTouchStart(e) {
    startY = e.touches[0].clientY;
    currentY = startY;
    if (panel) {
        panel.classList.add('no-transition');
        panel.classList.add('bottom-sheet-dragging');
    }
}

function onTouchMove(e) {
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    if (deltaY > 0) {
        if (e.cancelable) e.preventDefault();
        isDragging = true;
        if (panel) panel.style.transform = `translateY(${deltaY}px)`;
        
        const opacity = Math.max(0, 0.6 - (deltaY / window.innerHeight) * 0.6);
        const overlay = document.querySelector('#modalDetalleProducto > div.absolute');
        if (overlay) {
            overlay.style.backgroundColor = `rgba(15, 23, 42, ${opacity})`;
        }
    } else {
        if (panel) panel.style.transform = 'translateY(0px)';
    }
}

function onTouchEnd(e) {
    if (panel) {
        panel.classList.remove('no-transition');
        panel.classList.remove('bottom-sheet-dragging');
    }
    
    const deltaY = currentY - startY;
    
    if (isDragging && deltaY > 120) {
        cerrarDetalleProducto();
    } else {
        if (panel) panel.style.transform = 'translateY(0)';
        const overlay = document.querySelector('#modalDetalleProducto > div.absolute');
        if (overlay) {
            overlay.style.backgroundColor = '';
        }
    }
    isDragging = false;
}
