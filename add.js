// Quick add functionality for add.html
class QuickAdd {
    constructor() {
        this.db = new WantDB();
        this.META_ENDPOINT = ''; // e.g. 'https://<your-worker>.workers.dev'
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

            await this.db.addItem(item);
            
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
            const response = await fetch(`${this.META_ENDPOINT}/meta?url=${encodeURIComponent(url)}`);
            if (!response.ok) throw new Error('Server response not ok');
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            // Process image through weserv.nl for consistent sizing
            const img = data.image 
                ? `https://images.weserv.nl/?url=${encodeURIComponent(data.image)}&w=800&h=800&fit=cover`
                : '';
                
            return { 
                title: data.title || '', 
                image: img, 
                price: data.price || '' 
            };
        } catch (error) {
            console.log('META_ENDPOINT failed, using fallback:', error);
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
