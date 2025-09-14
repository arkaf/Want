// Cloudflare Worker API for items storage (DISABLED - Local storage only)
// const API = "https://want.fiorearcangelodesign.workers.dev";
// const LIST_ID = localStorage.getItem('want.syncKey') || 'want-main';

// Quick add functionality for add.html
const PARSE_ENDPOINT = 'https://want-extract.fiorearcangelodesign.workers.dev/extract'; // Cloudflare Worker

export class QuickAdd {
    constructor() {
        this.init();
    }

    async init() {
        await this.processUrlParams();
    }

    async processUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const url = urlParams.get('url');

        if (!url) {
            this.showError('No URL provided');
            return;
        }

        // Extract metadata and redirect to home page
        const meta = await this.extractMeta(url).catch(() => ({ url }));
        
        // Build Home URL under /Want/ (GitHub Pages project)
        const HOME_URL = new URL('./index.html', location.href).href;
        
        location.href = `${HOME_URL}#add=${encodeURIComponent(JSON.stringify({
            url: meta.url || url,
            title: meta.title || '',
            image: meta.image || '',
            price: meta.price || '',
            domain: meta.domain || ''
        }))}`;
    }

    async serverParse(url) {
        const r = await fetch(`${PARSE_ENDPOINT}?url=${encodeURIComponent(url)}&cb=${Date.now()}`, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
        });
        if (!r.ok) {
            const txt = await r.text();
            throw new Error(`parse ${r.status} ${txt}`);
        }
        return r.json();
    }

    async clientParse(url) {
        // Optional: your existing lightweight OG parse, or return {}
        return {};
    }

    async extractMeta(url) {
        try {
            // Prefer server parser for robustness (Amazon/H&M/Zara)
            const meta = await this.serverParse(url);
            if (meta && (meta.title || meta.image)) return meta;
        } catch (e) {
            console.warn('serverParse failed, falling back to client', e);
        }
        // Fallback (best-effort)
        return await this.clientParse(url);
    }

    

    // async enrichFromMeta(url) {
    //     if (!this.META_ENDPOINT) return null;
    //     try {
    //         const r = await fetch(`${this.META_ENDPOINT}/meta?url=${encodeURIComponent(url)}`, {
    //             method: 'GET',
    //             mode: 'cors',
    //             headers: {
    //                 'Accept': 'application/json',
    //             }
    //         });
    //         if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    //         const d = await r.json();
    //         
    //         if (d.error) {
    //             console.log('Worker returned error:', d.error);
    //             return null;
    //             }
    //         
    //         // Store original URL for fallback, use weserv.nl for display
    //         let image = '';
    //         if (d.image) {
    //             image = d.image;
    //         }
    //         
    //         return {
    //             title: d.title || '',
    //             image,
    //             price: d.price || '',
    //         };
    //     } catch (error) {
    //         console.log('enrichFromMeta failed:', error.message);
    //         return null;
    //     }
    

    showError(message) {
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('errorMessage').style.display = 'block';
        document.querySelector('.error-message p').textContent = message;
    }
}