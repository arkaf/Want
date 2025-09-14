// URL utilities
export function normalizeUrl(raw) {
    const s = raw.trim();
    if (!s) return '';
    try {
        const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
        u.hash = ''; // strip fragment
        return u.toString();
    } catch {
        return '';
    }
}

export function displayDomain(url) {
    try { 
        return new URL(url).hostname.replace(/^www\./, ''); 
    } catch { 
        return ''; 
    }
}

export function isProbablyUrl(s) {
    return /^(https?:\/\/)?[^\s]+\.[^\s]+/i.test(s);
}

export function withProxy(src) {
    if (!src) return '';
    return `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=800&h=800&fit=cover`;
}
