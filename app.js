// Main application logic
class WantApp {
    constructor() {
        this.db = new WantDB();
        this.META_ENDPOINT = ''; // e.g. 'https://<your-worker>.workers.dev'
        this.init();
    }

    async init() {
        await this.db.init();
        this.bindEvents();
        await this.loadItems();
        
        // Check for success message from add.html
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('added') === 'true') {
            this.showToast('Item saved to Want');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    bindEvents() {
        // Add button
        document.getElementById('addBtn').addEventListener('click', () => {
            this.showModal();
        });

        // Modal events
        document.getElementById('closeModal').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.hideModal();
        });

        // Close modal on backdrop click
        document.getElementById('addModal').addEventListener('click', (e) => {
            if (e.target.id === 'addModal') {
                this.hideModal();
            }
        });

        // Form submission
        document.getElementById('addForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddItem();
        });

        // URL field auto-extraction
        const urlField = document.getElementById('url');
        urlField.addEventListener('paste', (e) => {
            setTimeout(() => this.extractMetadata(), 100);
        });
        urlField.addEventListener('blur', () => {
            if (urlField.value) {
                this.extractMetadata();
            }
        });

        // Settings modal
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettingsModal();
        });

        document.getElementById('closeSettingsModal').addEventListener('click', () => {
            this.hideSettingsModal();
        });

        // Settings backdrop click
        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                this.hideSettingsModal();
            }
        });

        // Export/Import
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });

        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        document.getElementById('importFile').addEventListener('change', (e) => {
            this.importData(e.target.files[0]);
        });
    }

    showModal() {
        document.getElementById('addModal').style.display = 'flex';
        document.getElementById('url').focus();
    }

    hideModal() {
        document.getElementById('addModal').style.display = 'none';
        document.getElementById('addForm').reset();
    }

    showSettingsModal() {
        document.getElementById('settingsModal').style.display = 'flex';
    }

    hideSettingsModal() {
        document.getElementById('settingsModal').style.display = 'none';
    }

    async handleAddItem() {
        const form = document.getElementById('addForm');
        const formData = new FormData(form);
        
        const item = {
            url: formData.get('url'),
            title: formData.get('title'),
            price: formData.get('price'),
            image: formData.get('image')
        };

        try {
            await this.db.addItem(item);
            this.hideModal();
            await this.loadItems();
            this.showToast('Item added to Want');
        } catch (error) {
            console.error('Error adding item:', error);
            this.showToast('Error adding item', 'error');
        }
    }

    async loadItems() {
        try {
            const items = await this.db.getAllItems();
            this.renderItems(items);
        } catch (error) {
            console.error('Error loading items:', error);
        }
    }

    renderItems(items) {
        const grid = document.getElementById('itemsGrid');
        const emptyState = document.getElementById('emptyState');

        if (items.length === 0) {
            grid.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        grid.innerHTML = items.map(item => this.createItemCard(item)).join('');
        
        // Bind delete events
        items.forEach(item => {
            const deleteBtn = document.getElementById(`delete-${item.id}`);
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteItem(item.id);
                });
            }
        });
    }

    createItemCard(item) {
        const imageUrl = item.image || this.getDefaultImage(item.domain);
        
        return `
            <div class="card" onclick="window.open('${item.url}', '_blank')">
                <img src="${imageUrl}" alt="${item.title}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjFGNUY5Ii8+CjxwYXRoIGQ9Ik0xMDAgNzBDODguOTU0MyA3MCA4MCA3OC45NTQzIDgwIDkwQzgwIDEwMS4wNDYgODguOTU0MyAxMTAgMTAwIDExMEMxMTEuMDQ2IDExMCAxMjAgMTAxLjA0NiAxMjAgOTBDMTIwIDc4Ljk1NDMgMTExLjA0NiA3MCAxMDAgNzBaIiBmaWxsPSIjQ0JELTQ2NiIvPgo8cGF0aCBkPSJNMTYwIDE2MEg0MEM0MCAxNjAgNDAgMTYwIDQwIDE2MFYxMjBDNDAgMTIwIDQwIDEyMCA0MCAxMjBIMTYwQzE2MCAxMjAgMTYwIDEyMCAxNjAgMTIwVjE2MFoiIGZpbGw9IiNDQkQtNDY2Ii8+Cjwvc3ZnPgo='">
                <div class="card-footer">
                    <div>
                        <div class="card-price">${item.price || 'N/A'}</div>
                        <div class="card-domain">${item.domain}</div>
                    </div>
                </div>
                <button class="delete-btn" id="delete-${item.id}" title="Delete item">×</button>
            </div>
        `;
    }

    getDefaultImage(domain) {
        // Try to get favicon from domain
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    }

    async deleteItem(id) {
        if (confirm('Are you sure you want to delete this item?')) {
            try {
                await this.db.deleteItem(id);
                await this.loadItems();
                this.showToast('Item deleted');
            } catch (error) {
                console.error('Error deleting item:', error);
                this.showToast('Error deleting item', 'error');
            }
        }
    }

    async extractMetadata() {
        const url = document.getElementById('url').value.trim();
        if (!url) return;

        try {
            // 1) Try server-side enrichment
            const meta = await this.enrichFromMeta(url);
            
            // 2) Fallbacks (client-side)
            const host = new URL(url).hostname;
            const fallbackImg = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
            
            const title = meta?.title || host;
            const image = meta?.image || fallbackImg;
            const price = meta?.price || '';
            
            // Pre-fill form fields (still editable)
            this.setFormValues({ url, title, image, price });
            
        } catch (error) {
            console.error('Error extracting metadata:', error);
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

    setFormValues({ url, title, image, price }) {
        const urlField = document.getElementById('url');
        const titleField = document.getElementById('title');
        const priceField = document.getElementById('price');
        const imageField = document.getElementById('image');
        
        // Only pre-fill if fields are empty
        if (title && !titleField.value) titleField.value = title;
        if (price && !priceField.value) priceField.value = price;
        if (image && !imageField.value) imageField.value = image;
    }



    async exportData() {
        try {
            await this.db.exportData();
            this.showToast('Data exported successfully');
        } catch (error) {
            console.error('Error exporting data:', error);
            this.showToast('Error exporting data', 'error');
        }
    }

    async importData(file) {
        if (!file) return;
        
        try {
            const text = await file.text();
            const result = await this.db.importData(text);
            await this.loadItems();
            this.showToast(`Imported ${result.imported} items, updated ${result.updated} items`);
            this.hideSettingsModal();
        } catch (error) {
            console.error('Error importing data:', error);
            this.showToast('Error importing data', 'error');
        }
        
        // Reset file input
        document.getElementById('importFile').value = '';
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.style.display = 'block';
        
        if (type === 'error') {
            toast.style.background = '#000000';
        } else {
            toast.style.background = '#000000';
        }

        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WantApp();
});
