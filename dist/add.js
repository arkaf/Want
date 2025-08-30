const PARSE_ENDPOINT = 'https:

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

        
        const meta = await this.extractMeta(url).catch(() => ({ url }));
        
        
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
        
        return {};
    }

    async extractMeta(url) {
        try {
            
            const meta = await this.serverParse(url);
            if (meta && (meta.title || meta.image)) return meta;
        } catch (e) {
            console.warn('serverParse failed, falling back to client', e);
        }
        
        return await this.clientParse(url);
    }

    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    showError(message) {
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('errorMessage').style.display = 'block';
        document.querySelector('.error-message p').textContent = message;
    }
}