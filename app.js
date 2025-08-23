// Main application logic
class WantApp {
    constructor() {
        this.db = new WantDB();
        // Use our Cloudflare Worker for metadata (server-side scrape)
        this.META_ENDPOINT = 'https://want.fiorearcangelodesign.workers.dev';
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
            if (e.target.id === 'addModal' || e.target.id === 'modalBackdrop') {
                this.hideModal();
            }
        });

        // Swipe to close on mobile
        this.setupSwipeToClose();

        // Form submission with proper URL handling
        const form = document.getElementById('addForm');
        const addBtn = document.getElementById('addBtn');

        form?.addEventListener('submit', async (e) => {
            console.log('Form submit event triggered');
            e.preventDefault(); // stop navigation
            addBtn.disabled = true;

            try {
                const raw = urlInput?.value?.trim() || "";
                const url = this.normalizeUrl(raw);
                if (!this.isProbablyUrl(url)) {
                    alert("Please paste a valid link");
                    return;
                }

                const meta = await this.enrichFromMeta(url);
                const host = (new URL(url)).hostname.replace(/^www\./i, "");
                const item = {
                    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
                    url,
                    title: meta?.title || host,
                    image: meta?.image || `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
                    price: meta?.price || "",
                    domain: this.normalizedDomainFrom(url),
                    createdAt: Date.now(),
                };

                await this.upsertItem(item);
                await this.loadItems();
                this.hideModal();
                this.showToast('Item added to Want');
            } catch (err) {
                console.error("Add item failed", err);
                this.showToast('Error adding item', 'error');
            } finally {
                addBtn.disabled = false;
            }
        });

        // URL field auto-extraction
        const urlInput = document.getElementById('urlInput');
        urlInput.addEventListener('input', () => this.handleUrlInput(urlInput.value.trim()));
        urlInput.addEventListener('paste', (e) => {
            // Let the paste happen first, then process
            setTimeout(() => {
                const value = urlInput.value.trim();
                if (value) {
                    this.handleUrlInput(value);
                }
            }, 10);
        });
        urlInput.addEventListener('blur', () => this.handleUrlInput(urlInput.value.trim()));

        // Toggle advanced fields
        document.getElementById('toggleAdvanced').addEventListener('click', () => {
            this.toggleAdvancedFields();
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

        // 3) Global paste listener (preferred, works with browser paste)
        document.addEventListener("paste", async (e) => {
            // ignore if user is typing in an input/textarea/contenteditable
            const a = document.activeElement;
            const isEditable = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
            if (isEditable) return;

            const text = (e.clipboardData || window.clipboardData)?.getData("text")?.trim();
            if (!text) return;
            
            // Check if it's a URL
            if (!this.isProbablyUrl(text)) return;
            
            // If modal is open, don't use global paste - let the modal handle it
            const modal = document.getElementById('addModal');
            if (modal && modal.style.display === 'flex') {
                return;
            }
            
            const added = await this.saveUrlToWant(text);
            if (added) e.preventDefault(); // avoid pasting the URL into some random focusable
        });

        // 4) Bonus: Cmd/Ctrl+V fallback using Clipboard API (for cases where 'paste' doesn't fire)
        document.addEventListener("keydown", async (e) => {
            const isPaste = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v";
            if (!isPaste) return;

            const a = document.activeElement;
            const isEditable = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
            if (isEditable) return;

            if (navigator.clipboard?.readText) {
                try {
                    const text = (await navigator.clipboard.readText())?.trim();
                    if (text) {
                        const added = await this.saveUrlToWant(text);
                        if (added) e.preventDefault();
                    }
                } catch { /* ignore */ }
            }
        });
    }

    showModal() {
        const modal = document.getElementById('addModal');
        modal.style.display = 'flex';
        
        // Trigger animation after display is set
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.focus();
        }
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    hideModal() {
        const modal = document.getElementById('addModal');
        modal.classList.remove('show');
        
        // Wait for animation to complete
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 300);
        
        document.getElementById('addForm').reset();
        this.hidePreview();
        document.getElementById('advanced').classList.add('hidden');
        document.getElementById('toggleAdvanced').textContent = 'Edit details';
        this.updateAddButton(false);
    }

    showSettingsModal() {
        document.getElementById('settingsModal').style.display = 'flex';
    }

    hideSettingsModal() {
        document.getElementById('settingsModal').style.display = 'none';
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

    // URL validation and normalization helpers
    isProbablyUrl(str) {
        if (!str) return false;
        try { 
            const u = new URL(str); 
            return /^https?:$/.test(u.protocol); 
        } catch { 
            return /^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(str); 
        }
    }

    normalizeUrl(str) {
        const s = String(str).trim();
        if (!s) return "";
        if (/^https?:\/\//i.test(s)) return s;
        if (/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(s)) return `https://${s}`;
        return s;
    }

    // Returns eTLD+1 in most cases (simple heuristic, handles common multi-part TLDs)
    getMainDomain(urlStr) {
        try {
            const host = new URL(urlStr).hostname.replace(/^www\./i, "");
            const parts = host.split(".");
            const multiTLD = new Set([
                "co.uk","com.au","com.br","co.jp","com.cn","com.hk","com.sg",
                "com.tr","com.mx","com.ar","co.kr","com.tw","com.my","co.in"
            ]);
            if (parts.length <= 2) return host;
            const last2 = parts.slice(-2).join(".");
            const last3 = parts.slice(-3).join(".");
            return multiTLD.has(last2) && parts.length >= 3 ? last3 : last2;
        } catch {
            return "";
        }
    }

    // When saving items, ensure we store a normalized domain
    normalizedDomainFrom(urlStr) {
        const d = this.getMainDomain(urlStr);
        return d || (function(){ try { return new URL(urlStr).hostname.replace(/^www\./i,""); } catch { return ""; }})();
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Swipe to close functionality for mobile
    setupSwipeToClose() {
        const modal = document.getElementById('addModal');
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        const handleTouchStart = (e) => {
            startY = e.touches[0].clientY;
            isDragging = true;
        };

        const handleTouchMove = (e) => {
            if (!isDragging) return;
            
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            
            if (deltaY > 0) {
                const modalContent = modal.querySelector('.modal-content');
                modalContent.style.transform = `translateY(${deltaY}px)`;
            }
        };

        const handleTouchEnd = (e) => {
            if (!isDragging) return;
            
            const deltaY = currentY - startY;
            const modalContent = modal.querySelector('.modal-content');
            
            if (deltaY > 100) {
                // Swipe down threshold reached, close modal
                this.hideModal();
            } else {
                // Reset position
                modalContent.style.transform = '';
            }
            
            isDragging = false;
        };

        // Add touch listeners to modal content
        const modalContent = modal.querySelector('.modal-content');
        modalContent.addEventListener('touchstart', handleTouchStart, { passive: true });
        modalContent.addEventListener('touchmove', handleTouchMove, { passive: true });
        modalContent.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    createItemCard(item) {
        const imageUrl = item.image || this.getDefaultImage(item.domain);
        const domain = item.domain || this.normalizedDomainFrom(item.url);
        const title = item.title || domain;
        
        return `
            <a class="card" href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener">
                <div class="img-wrap">
                    <img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(title)}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjFGNUY5Ii8+CjxwYXRoIGQ9Ik0xMDAgNzBDODguOTU0MyA3MCA4MCA3OC45NTQzIDgwIDkwQzgwIDEwMS4wNDYgODguOTU0MyAxMTAgMTAwIDExMEMxMTEuMDQ2IDExMCAxMjAgMTAxLjA0NiAxMjAgOTBDMTIwIDc4Ljk1NDMgMTExLjA0NiA3MCAxMDAgNzBaIiBmaWxsPSIjQ0JELTQ2NiIvPgo8cGF0aCBkPSJNMTYwIDE2MEg0MEM0MCAxNjAgNDAgMTYwIDQwIDE2MFYxMjBDNDAgMTIwIDQwIDEyMCA0MCAxMjBIMTYwQzE2MCAxMjAgMTYwIDEyMCAxNjAgMTIwVjE2MFoiIGZpbGw9IiNDQkQtNDY2Ii8+Cjwvc3ZnPgo='">
                </div>
                <div class="card-meta">
                    <h3 class="card-title">${this.escapeHtml(title)}</h3>
                    <div class="card-price">${this.escapeHtml(item.price || "")}</div>
                    <div class="card-domain">${this.escapeHtml(domain)}</div>
                </div>
                <button class="delete-btn" id="delete-${item.id}" title="Delete item">×</button>
            </a>
        `;
    }

    getDefaultImage(domain) {
        // Try to get favicon from domain
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    }

    async upsertItem(item) {
        try {
            // Check if item with same URL exists
            const existingItem = await this.db.getItemByUrl(item.url);
            if (existingItem) {
                // Update existing item
                const updatedItem = { 
                    ...existingItem, 
                    title: item.title,
                    price: item.price,
                    image: item.image,
                    createdAt: Date.now() // Refresh timestamp
                };
                await this.db.db.put(this.db.storeName, updatedItem);
                return existingItem.id;
            } else {
                // Add new item
                const newItem = await this.db.addItem(item);
                return newItem.id;
            }
        } catch (error) {
            console.error('Error upserting item:', error);
            throw error;
        }
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

    // 1) URL helpers
    isProbablyUrl(str) {
        try {
            const u = new URL(str);
            return /^https?:$/.test(u.protocol);
        } catch {
            return /^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(str);
        }
    }

    normalizeUrl(str) {
        if (/^https?:\/\//i.test(str)) return str.trim();
        if (/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(str)) return `https://${str.trim()}`;
        return str.trim();
    }

    hostnameOf(u) { 
        try { 
            return new URL(u).hostname; 
        } catch { 
            return ''; 
        } 
    }

    async handleUrlInput(url) {
        console.log('handleUrlInput called with:', url);
        
        if (!url) {
            this.hidePreview();
            this.updateAddButton(false);
            return;
        }

        // Check if URL is valid
        if (!this.isProbablyUrl(url)) {
            console.log('URL not valid:', url);
            this.hidePreview();
            this.updateAddButton(false);
            return;
        }

        console.log('Processing URL:', url);

        // Enable add button for valid URL
        this.updateAddButton(true);

        // Show loading state
        this.showPreviewLoading();

        try {
            const meta = await this.enrichFromMeta(url);
            const host = this.hostnameOf(url);
            
            if (meta) {
                // Worker succeeded
                const title = meta.title || host;
                const image = meta.image || `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
                const price = meta.price || '';

                console.log('Preview data (from worker):', { title, image, price, domain: host });

                // Update preview
                this.updatePreview({ title, image, price, domain: host });
                this.showPreview();

                // Update advanced fields if they're visible
                if (!document.getElementById('advanced').classList.contains('hidden')) {
                    this.setAdvancedFormValues({ title, image, price });
                }
            } else {
                // Worker failed, use fallback
                const fallbackMeta = this.extractBasicMetadata(url);
                console.log('Preview data (fallback):', { ...fallbackMeta, domain: host });

                // Update preview
                this.updatePreview({ ...fallbackMeta, domain: host });
                this.showPreview();

                // Update advanced fields if they're visible
                if (!document.getElementById('advanced').classList.contains('hidden')) {
                    this.setAdvancedFormValues(fallbackMeta);
                }
            }
        } catch (error) {
            console.error('Error handling URL input:', error);
            // Show fallback preview instead of hiding
            const fallbackMeta = this.extractBasicMetadata(url);
            this.updatePreview({ ...fallbackMeta, domain: this.hostnameOf(url) });
            this.showPreview();
        }
    }

    // 2) Core add routine used by paste handler
    async saveUrlToWant(raw) {
        const url = this.normalizeUrl(raw);
        if (!this.isProbablyUrl(url)) return false;

        // Enrich via Worker
        const meta = await this.enrichFromMeta(url);
        const fallbackMeta = this.extractBasicMetadata(url);

        const host = this.hostnameOf(url);
        const image = meta?.image || fallbackMeta.image;
        const title = meta?.title || fallbackMeta.title;
        const price = meta?.price || fallbackMeta.price;

        const item = {
            id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
            url,
            title,
            price,
            image,
            domain: this.normalizedDomainFrom(url),
            createdAt: Date.now()
        };

        // Upsert by URL (update existing or insert new)
        const savedId = await this.upsertItem(item);
        await this.loadItems();

        // Toast + optional actions
        if (price) {
            this.showToast("Saved to Want", { 
                action: { 
                    label: "Undo", 
                    onClick: async () => { 
                        await this.deleteItem(savedId); 
                        await this.loadItems(); 
                    } 
                } 
            });
        } else {
            this.showToast("Saved — add price", { 
                action: { 
                    label: "Edit", 
                    onClick: () => this.openEditForUrl(url) 
                } 
            });
        }
        return true;
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
            
            // Process image URL - use original URL if weserv.nl fails
            let image = '';
            if (d.image) {
                // Try weserv.nl first, fallback to original URL
                image = `https://images.weserv.nl/?url=${encodeURIComponent(d.image)}&w=800&h=800&fit=cover`;
            }
            
            return {
                title: d.title || '',
                image,
                price: d.price || '',
            };
        } catch (error) {
            console.log('enrichFromMeta failed:', error.message);
            // Return null to trigger fallback
            return null;
        }
    }

    // Fallback metadata extraction when worker fails
    extractBasicMetadata(url) {
        const host = this.hostnameOf(url);
        const fallbackImg = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
        
        // Try to extract title from URL path
        let title = host;
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
            if (pathParts.length > 0) {
                // Use last meaningful path segment as title
                const lastPart = pathParts[pathParts.length - 1];
                if (lastPart && lastPart !== 'index.html' && lastPart !== 'index') {
                    title = lastPart.replace(/[-_]/g, ' ').replace(/\.[^/.]+$/, '');
                }
            }
        } catch (e) {
            // Keep hostname as title
        }
        
        return {
            title: title,
            image: fallbackImg,
            price: '',
        };
    }

    showPreviewLoading() {
        const preview = document.getElementById('metaPreview');
        const previewImg = document.getElementById('previewImg');
        const previewTitle = document.getElementById('previewTitle');
        const previewPrice = document.getElementById('previewPrice');
        const previewDomain = document.getElementById('previewDomain');

        preview.classList.remove('hidden');
        previewImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiBmaWxsPSIjRjFGNUY5Ii8+CjxwYXRoIGQ9Ik02MCAzNEM0OC45NTQzIDM0IDQwIDQyLjk1NDMgNDAgNTBDNDAgNTcuMDQ2IDQ4Ljk1NDMgNjYgNjAgNjZDNzEuMDQ2IDY2IDgwIDU3LjA0NiA4MCA1MEM4MCA0Mi45NTQzIDcxLjA0NiAzNCA2MCAzNFoiIGZpbGw9IiNDQkQtNDY2Ii8+CjxwYXRoIGQ9Ijk2IDk2SDI0QzI0IDk2IDI0IDk2IDI0IDk2VjcyQzI0IDcyIDI0IDcyIDI0IDcySDk2Qzk2IDcyIDk2IDcyIDk2IDcyVjk2WiIgZmlsbD0iI0NCQi00NjYiLz4KPC9zdmc+Cg==';
        previewTitle.textContent = 'Loading...';
        previewPrice.textContent = '';
        previewDomain.textContent = '';
    }

    updatePreview({ title, image, price, domain }) {
        const previewImg = document.getElementById('previewImg');
        const previewTitle = document.getElementById('previewTitle');
        const previewPrice = document.getElementById('previewPrice');
        const previewDomain = document.getElementById('previewDomain');

        // Set image with fallback
        if (image) {
            previewImg.src = image;
            previewImg.onerror = () => {
                // Fallback to favicon if image fails to load
                previewImg.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
            };
        } else {
            previewImg.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        }
        
        previewTitle.textContent = title;
        previewPrice.textContent = price || 'N/A';
        previewDomain.textContent = domain;
    }

    showPreview() {
        document.getElementById('metaPreview').classList.remove('hidden');
    }

    hidePreview() {
        document.getElementById('metaPreview').classList.add('hidden');
    }

    toggleAdvancedFields() {
        const advanced = document.getElementById('advanced');
        const toggleBtn = document.getElementById('toggleAdvanced');
        
        if (advanced.classList.contains('hidden')) {
            advanced.classList.remove('hidden');
            toggleBtn.textContent = 'Hide details';
            
            // Pre-fill advanced fields with current preview data
            const urlInput = document.getElementById('urlInput');
            if (urlInput.value) {
                this.handleUrlInput(urlInput.value.trim());
            }
        } else {
            advanced.classList.add('hidden');
            toggleBtn.textContent = 'Edit details';
        }
    }

    setAdvancedFormValues({ title, image, price }) {
        const titleInput = document.getElementById('titleInput');
        const priceInput = document.getElementById('priceInput');
        const imageInput = document.getElementById('imageInput');
        
        titleInput.value = title;
        priceInput.value = price;
        imageInput.value = image;
    }

    updateAddButton(enabled) {
        const addBtn = document.getElementById('addBtn');
        console.log('updateAddButton called with enabled:', enabled);
        addBtn.disabled = !enabled;
        console.log('Button disabled state:', addBtn.disabled);
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

    openEditForUrl(url) {
        // Find the item by URL and open edit modal
        this.db.getItemByUrl(url).then(item => {
            if (item) {
                // Pre-fill the form with existing data
                document.getElementById('urlInput').value = item.url;
                document.getElementById('titleInput').value = item.title;
                document.getElementById('priceInput').value = item.price;
                document.getElementById('imageInput').value = item.image;
                
                // Show advanced fields and update preview
                document.getElementById('advanced').classList.remove('hidden');
                document.getElementById('toggleAdvanced').textContent = 'Hide details';
                
                // Update preview
                this.updatePreview({ 
                    title: item.title, 
                    image: item.image, 
                    price: item.price, 
                    domain: item.domain 
                });
                this.showPreview();
                this.updateAddButton(true);
                
                // Show the modal
                this.showModal();
            }
        }).catch(error => {
            console.error('Error finding item for edit:', error);
        });
    }

    showToast(message, type = 'success', options = {}) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.style.display = 'block';
        
        if (type === 'error') {
            toast.style.background = '#000000';
        } else {
            toast.style.background = '#000000';
        }

        // Add action button if provided
        if (options.action) {
            const actionBtn = document.createElement('button');
            actionBtn.textContent = options.action.label;
            actionBtn.className = 'toast-action';
            actionBtn.onclick = options.action.onClick;
            toast.appendChild(actionBtn);
        }

        setTimeout(() => {
            toast.style.display = 'none';
            // Clean up action button
            const actionBtn = toast.querySelector('.toast-action');
            if (actionBtn) {
                actionBtn.remove();
            }
        }, 5000); // Longer timeout for actions
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WantApp();
});
