// Cloudflare Worker API for items storage (DISABLED - Local storage only)
// const API = "https://want.fiorearcangelodesign.workers.dev";
// const LIST_ID = localStorage.getItem('want.syncKey') || 'want-main';

// Quick add functionality for add.html
export class QuickAdd {
    constructor() {
        this.db = new WantDB();
        // Use our Cloudflare Worker for metadata (server-side scrape) - DISABLED
        // this.META_ENDPOINT = 'https://want.fiorearcangelodesign.workers.dev';
        this.init();
    }

    async init() {
        await this.db.init();
        await this.processUrlParams();
    }



    async processUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const url = urlParams.get('url');

        if (!url) {
            this.showError('No URL provided');
            return;
        }

        // Redirect to main page with URL in hash for processing
        window.location.replace(`./index.html#add=${encodeURIComponent(url)}`);
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
    // }

    showError(message) {
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('errorMessage').style.display = 'block';
        document.querySelector('.error-message p').textContent = message;
    }
}

// App is initialized from add.html
