// Quick add functionality for add.html
class QuickAdd {
    constructor() {
        this.db = new WantDB();
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
            // Try to fetch metadata if title is not provided
            let finalTitle = title;
            let finalImage = image;
            
            if (!finalTitle) {
                finalTitle = await this.fetchTitle(url);
            }
            
            if (!finalImage) {
                finalImage = await this.fetchImage(url);
            }

            const item = {
                url: url,
                title: finalTitle || 'Untitled Item',
                price: price || '',
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

    async fetchTitle(url) {
        try {
            // Try to fetch the page and extract title
            const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
            const data = await response.json();
            
            if (data.contents) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.contents, 'text/html');
                const title = doc.querySelector('title');
                return title ? title.textContent.trim() : null;
            }
        } catch (error) {
            console.log('Could not fetch title:', error);
        }
        return null;
    }

    async fetchImage(url) {
        try {
            // Try to fetch Open Graph image
            const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
            const data = await response.json();
            
            if (data.contents) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.contents, 'text/html');
                
                // Try og:image first
                const ogImage = doc.querySelector('meta[property="og:image"]');
                if (ogImage && ogImage.content) {
                    return ogImage.content;
                }
                
                // Try twitter:image
                const twitterImage = doc.querySelector('meta[name="twitter:image"]');
                if (twitterImage && twitterImage.content) {
                    return twitterImage.content;
                }
                
                // Try first image with reasonable size
                const images = doc.querySelectorAll('img');
                for (let img of images) {
                    if (img.src && img.width >= 200 && img.height >= 200) {
                        return img.src;
                    }
                }
            }
        } catch (error) {
            console.log('Could not fetch image:', error);
        }
        return null;
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
