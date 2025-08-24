// Cloudflare Worker API for items storage
const API = "https://want.fiorearcangelodesign.workers.dev";
const LIST_ID = localStorage.getItem('want.syncKey') || 'want-main';

// Quick add functionality for add.html
export class QuickAdd {
    constructor() {
        this.db = new WantDB();
        // Use our Cloudflare Worker for metadata (server-side scrape)
        this.META_ENDPOINT = 'https://want.fiorearcangelodesign.workers.dev';
        this.init();
    }

    async init() {
        await this.db.init();
        await this.processUrlParams();
    }



    async processUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const url = urlParams.get('url');
        const title = urlParams.get('title');
        const price = urlParams.get('price');
        const image = urlParams.get('image');

        if (!url) {
            this.showError('No URL provided');
            return;
        }

        try {
            // Try to fetch metadata if not provided
            let finalTitle = title;
            let finalImage = image;
            let finalPrice = price;
            
            if (!finalTitle || !finalImage || !finalPrice) {
                const meta = await this.enrichFromMeta(url);
                if (meta) {
                    if (!finalTitle) finalTitle = meta.title;
                    if (!finalImage) finalImage = meta.image;
                    if (!finalPrice) finalPrice = meta.price;
                }
            }

            const item = {
                url: url,
                title: finalTitle || 'Untitled Item',
                price: finalPrice || '',
                image: finalImage || ''
            };

            // Save to Cloudflare Worker
            try {
                const r = await fetch(`${API}/items`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ listId: LIST_ID, item })
                });
                const result = await r.json();
                if (result.ok) {
                    console.log('Item saved to Worker with ID:', result.id);
                    // Also save to local database for offline access
                    await this.db.upsertItem({ ...item, id: result.id });
                } else {
                    throw new Error('Failed to save to Worker');
                }
            } catch (error) {
                console.error('Failed to save to Worker:', error);
                // Fallback to local storage only
                await this.db.addItem(item);
            }
            
            // Redirect to main page with success message
            window.location.href = 'index.html?added=true';
            
        } catch (error) {
            console.error('Error processing item:', error);
            this.showError('Failed to add item');
        }
    }

    async enrichFromMeta(url) {
        if (!this.META_ENDPOINT) return null;
        try {
            const r = await fetch(`${this.META_ENDPOINT}/meta?url=${encodeURIComponent(url)}`, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json',
                }
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
            const d = await r.json();
            
            if (d.error) {
                console.log('Worker returned error:', d.error);
                return null;
            }
            
            // Store original URL for fallback, use weserv.nl for display
            let image = '';
            if (d.image) {
                image = d.image;
            }
            
            return {
                title: d.title || '',
                image,
                price: d.price || '',
            };
        } catch (error) {
            console.log('enrichFromMeta failed:', error.message);
            return null;
        }
    }

    showError(message) {
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('errorMessage').style.display = 'block';
        document.querySelector('.error-message p').textContent = message;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new QuickAdd();
});
