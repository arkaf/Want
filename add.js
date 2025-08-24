// Import Firebase functionality
import { saveLink } from './src/firebase.js';

// Quick add functionality for add.html
class QuickAdd {
    constructor() {
        this.db = new WantDB();
        // Use our Cloudflare Worker for metadata (server-side scrape)
        this.META_ENDPOINT = 'https://want.fiorearcangelodesign.workers.dev';
        this.firebaseEnabled = false; // Will be set to true if Firebase config is valid
        this.init();
    }

    async init() {
        await this.db.init();
        this.checkFirebaseConfig();
        await this.processUrlParams();
    }

    // Check if Firebase is properly configured
    checkFirebaseConfig() {
        try {
            // Firebase is now properly configured with npm package
            console.log('Firebase configured - enabling cloud sync');
            this.firebaseEnabled = true;
        } catch (error) {
            console.error('Error checking Firebase config:', error);
            this.firebaseEnabled = false;
        }
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

            await this.db.addItem(item);
            
            // Sync to Firebase if enabled
            if (this.firebaseEnabled) {
                try {
                    await saveLink(item);
                    console.log('Item synced to Firebase');
                } catch (error) {
                    console.error('Failed to sync to Firebase:', error);
                    // Continue with local storage even if Firebase fails
                }
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
