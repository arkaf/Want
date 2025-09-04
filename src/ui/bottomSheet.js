const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('sheet-backdrop');
const content = document.getElementById('sheet-content');

let startY = 0;
let currentY = 0;
let dragging = false;

export function openSheet(html) {
    content.innerHTML = html;
    sheet.hidden = false;
    backdrop.hidden = false;

    requestAnimationFrame(() => {
        sheet.classList.add('is-open');
        backdrop.classList.add('is-open');
        document.body.classList.add('sheet-open');
        
        // Focus any input with autofocus attribute or the first input
        setTimeout(() => {
            const autofocusInput = content.querySelector('[autofocus]');
            const firstInput = content.querySelector('input, textarea');
            const inputToFocus = autofocusInput || firstInput;
            
            if (inputToFocus) {
                // For iOS, we need to be more aggressive with focus
                inputToFocus.focus();
                
                // Force keyboard to appear on iOS
                if (inputToFocus.type === 'text' || inputToFocus.type === 'url') {
                    // Try multiple approaches for iOS
                    inputToFocus.click();
                    inputToFocus.focus();
                    
                    // Select text to make it clear the input is active
                    setTimeout(() => {
                        inputToFocus.select();
                    }, 50);
                }
                
                // Additional iOS-specific handling
                if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                    // Force virtual keyboard on iOS
                    inputToFocus.setAttribute('readonly', 'readonly');
                    inputToFocus.removeAttribute('readonly');
                    inputToFocus.focus();
                }
            }
        }, 200); // Longer delay for iOS to ensure sheet is fully open
    });
}

export function closeSheet() {
    sheet.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.body.classList.remove('sheet-open');

    const cleanup = () => {
        sheet.hidden = true;
        backdrop.hidden = true;
        sheet.removeEventListener('transitionend', cleanup);
    };
    sheet.addEventListener('transitionend', cleanup, { once: true });
}

// Backdrop click closes
backdrop.addEventListener('click', closeSheet);

// Drag-to-dismiss (touch)
sheet.addEventListener('touchstart', (e) => {
    dragging = true;
    startY = e.touches[0].clientY;
    currentY = startY;
}, { passive: true });

sheet.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    currentY = e.touches[0].clientY;
    const delta = Math.max(0, currentY - startY);
    sheet.style.transform = `translateY(${delta}px)`;
}, { passive: true });

sheet.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const delta = Math.max(0, currentY - startY);
    if (delta > 120) { // threshold to dismiss
        closeSheet();
        sheet.style.transform = ''; // reset after transitionend in closeSheet
    } else {
        sheet.style.transform = ''; // snap back
        sheet.classList.add('is-open'); // ensure open transform
    }
});

// Optional: Esc to close
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
});
