// Main application logic
class WantApp {
    constructor() {
        this.db = new WantDB();
        // Use our Cloudflare Worker for metadata (server-side scrape)
        this.META_ENDPOINT = 'https://want.fiorearcangelodesign.workers.dev';
        this.selectedStore = null; // null = All
        this.init();
    }

    async init() {
        await this.db.init();
        
        // Guard duplicate IDs forever
        ['openAddBtn','addItemBtn','urlInput','addForm'].forEach(id => {
            const els = document.querySelectorAll('#'+id);
            if (els.length > 1) console.warn('Duplicate id:', id, els);
        });
        
        // Restore selection on load (optional)
        try {
            const s = localStorage.getItem('want.selectedStore');
            if (s !== null && s !== "") this.selectedStore = s;
        } catch {}
        
        this.bindEvents();
        await this.renderGridFiltered();
        
        // Check for success message from add.html
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('added') === 'true') {
            this.showToast('Item saved to Want');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    bindEvents() {
        // Open modal (header button)
        document.getElementById('openAddBtn').addEventListener('click', () => {
            this.showModal();
        });

        // Modal events
        document.getElementById('closeModal').addEventListener('click', () => {
            this.hideModal();
        });

        // Elements
        const modal = document.getElementById('addModal');
        const backdrop = document.getElementById('modalBackdrop');

        // Close only when clicking backdrop
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) this.hideModal();
        });

        // Prevent inside clicks from bubbling up
        modal.addEventListener('click', (e) => e.stopPropagation(), { passive: true });
        modal.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

        // Don't close modal on input focus/blur
        const urlInputEl = document.getElementById('urlInput');
        if (urlInputEl) {
            urlInputEl.addEventListener('focus', (e) => e.stopPropagation());
            urlInputEl.addEventListener('blur', (e) => e.stopPropagation());
        }

        // Swipe to close on mobile (restricted to header)
        this.setupSwipeToClose();

        // Form submission
        const form = document.getElementById('addForm');
        const addBtn = document.getElementById('addItemBtn');

        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const raw = urlInput.value.trim();
            const url = this.normalizeUrl(raw);
            if (!this.isProbablyUrl(url)) { 
                alert('Paste a valid URL'); 
                return; 
            }

            addBtn.disabled = true;
            try {
                await this.addUrlToWant(url);              // <-- same pipeline as paste
            } catch (err) {
                console.error('Add failed', err);
                this.showToast?.('Could not add item');
            } finally {
                addBtn.disabled = false;
            }
        });

        // URL field auto-extraction
        const urlInput = document.getElementById('urlInput');
        urlInput.addEventListener('input', () => {
            this.updateAddButton(!!urlInput.value.trim());
        });
        urlInput.addEventListener('paste', (e) => {
            // Let the paste happen first, then process
            setTimeout(() => {
                const value = urlInput.value.trim();
                this.updateAddButton(!!value);
            }, 10);
        });
        urlInput.addEventListener('blur', () => {
            this.updateAddButton(!!urlInput.value.trim());
        });

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
            if (e.target.id === 'settingsModal' || e.target.id === 'settingsModalBackdrop') {
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

        // More menu controller
        this.setupMoreMenu();

        // Scroll shadow effect
        this.setupScrollShadow();

        // 3) Global paste listener (preferred, works with browser paste)
        document.addEventListener("paste", async (e) => {
            const a = document.activeElement;
            const editing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
            if (editing) return;

            const text = (e.clipboardData || window.clipboardData)?.getData("text")?.trim();
            if (!text) return;
            const url = this.normalizeUrl(text);
            if (!this.isProbablyUrl(url)) return;

            e.preventDefault();
            await this.addUrlToWant(url);
        });

        // 4) Bonus: Cmd/Ctrl+V fallback using Clipboard API (for cases where 'paste' doesn't fire)
        document.addEventListener("keydown", async (e) => {
            const isPaste = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v";
            if (!isPaste) return;

            const a = document.activeElement;
            const editing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
            if (editing) return;

            if (navigator.clipboard?.readText) {
                try {
                    const text = (await navigator.clipboard.readText())?.trim();
                    if (text) {
                        const url = this.normalizeUrl(text);
                        if (this.isProbablyUrl(url)) {
                            await this.addUrlToWant(url);
                            e.preventDefault();
                        }
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
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'flex';
        
        // Trigger animation after display is set
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    hideSettingsModal() {
        const modal = document.getElementById('settingsModal');
        modal.classList.remove('show');
        
        // Wait for animation to complete before hiding
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
        
        // Restore body scroll
        document.body.style.overflow = '';
    }





    async loadItems() {
        try {
            const items = await this.db.getAllItems();
            this.items = items; // Store items in instance
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

    hostnameOf(u) {
        try { 
            return new URL(u).hostname.replace(/^www\./i,''); 
        } catch { 
            return ''; 
        }
    }

    proxiedImage(url, w = 800, h = 800) {
        if (!url) return "";
        return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${w}&h=${h}&fit=cover`;
    }

    async buildItemFromUrl(url) {
        const host = this.hostnameOf(url);
        const meta = await this.enrichFromMeta(url); // must return {title,image,price} or null

        // image: prefer proxied, fallback favicon, runtime onerror → original
        const original = meta?.image || '';
        const proxied = original ? this.proxiedImage(original) : '';
        const fallback = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;

        return {
            id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
            url,
            title: meta?.title || host,
            price: meta?.price || '',
            image: proxied || fallback,
            originalImage: original, // keep for onerror fallback in render
            domain: this.normalizedDomainFrom(url),
            createdAt: Date.now(),
        };
    }

    // single add function used by ALL entry points
    async addUrlToWant(url) {
        const item = await this.buildItemFromUrl(url);
        const id = await this.upsertItem(item);      // upsert by URL
        await this.renderGridFiltered();             // refresh UI with filtering
        this.hideModal?.();                          // if modal was open
        this.showToast?.('Saved to Want');           // optional
        return id;
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

    // Store tags functionality
    getDomainCounts(items) {
        const counts = new Map();
        for (const it of items) {
            const d = it.domain || this.getMainDomain(it.url);
            if (!d) continue;
            counts.set(d, (counts.get(d) || 0) + 1);
        }
        return counts;
    }

    renderStoreTags(items) {
        const el = document.getElementById('storeTags');
        if (!el) return;

        const counts = this.getDomainCounts(items);
        const entries = Array.from(counts.entries())
            .sort((a, b) => a[0].localeCompare(b[0])); // sort alphabetically

        const chips = [];
        chips.push(`
            <button class="tag-chip ${this.selectedStore ? "" : "active"}" data-store="">
                All<span class="tag-count">${items.length}</span>
            </button>
        `);
        
        for (const [domain, count] of entries) {
            chips.push(`
                <button class="tag-chip ${this.selectedStore === domain ? "active" : ""}" data-store="${domain}">
                    ${domain}<span class="tag-count">${count}</span>
                </button>
            `);
        }
        
        el.innerHTML = chips.join("");

        // Events (delegate)
        el.querySelectorAll('.tag-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const store = btn.dataset.store || null;
                this.selectedStore = store;
                // persist (optional)
                try { 
                    localStorage.setItem('want.selectedStore', store ?? ""); 
                } catch {}
                this.renderStoreTags(items); // re-highlight
                this.renderGridFiltered();   // apply filter
            });
        });
    }

    async renderGridFiltered() {
        const items = await this.db.getAllItems();
        this.items = items; // Store items in instance
        const filtered = this.selectedStore
            ? items.filter(it => (it.domain || this.getMainDomain(it.url)) === this.selectedStore)
            : items;

        // Reuse existing renderItems but pass filtered
        this.renderItems(filtered);

        // Always (re)build tags from the full list so counts are accurate
        this.renderStoreTags(items);
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Swipe to close functionality for mobile
    setupSwipeToClose() {
        // Setup swipe-to-close for Add modal
        this.setupModalSwipeToClose('addModal', () => this.hideModal());
        
        // Setup swipe-to-close for Settings modal
        this.setupModalSwipeToClose('settingsModal', () => this.hideSettingsModal());
    }

    setupModalSwipeToClose(modalId, closeCallback) {
        const modal = document.getElementById(modalId);
        let startY = null;
        let currentY = null;

        // Only allow swipe from the grabber/header area
        const grabberArea = modal.querySelector('.modal-grabber') || modal.querySelector('.modal-header');
        
        if (!grabberArea) return;

        grabberArea.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            currentY = startY;
        }, { passive: true });

        grabberArea.addEventListener('touchmove', (e) => {
            if (startY == null) return;
            currentY = e.touches[0].clientY;
            const delta = Math.max(0, currentY - startY);
            if (window.matchMedia('(max-width: 768px)').matches) {
                const modalContent = modal.querySelector('.modal-content');
                modalContent.style.transform = `translateY(${delta}px)`; // visual feedback only
            }
        }, { passive: true });

        grabberArea.addEventListener('touchend', () => {
            if (startY == null) return;
            const delta = Math.max(0, (currentY ?? startY) - startY);
            const modalContent = modal.querySelector('.modal-content');
            modalContent.style.transform = '';
            if (delta > 120 && window.matchMedia('(max-width: 768px)').matches) {
                closeCallback();
            }
            startY = currentY = null;
        });
    }

        createItemCard(item) {
        const domain = item.domain || this.hostnameOf(item.url);
        const title = item.title || domain;
        const original = item.originalImage || "";
        const proxied = item.image || (original ? this.proxiedImage(original) : "");
        const fallback = this.getDefaultImage(domain);

        return `
            <a class="card" href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener">
                <div class="img-wrap">
                    <img 
                        src="${this.escapeHtml(proxied || fallback)}" 
                        alt="${this.escapeHtml(title)}" 
                        referrerpolicy="no-referrer"
                        data-original="${this.escapeHtml(original)}"
                        onerror="if(this.dataset.fallback!=='1' && this.dataset.original){ this.dataset.fallback='1'; this.src=this.dataset.original; } else { this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjFGNUY5Ii8+CjxwYXRoIGQ9Ik0xMDAgNzBDODguOTU0MyA3MCA4MCA3OC45NTQzIDgwIDkwQzgwIDEwMS4wNDYgODguOTU0MyAxMTAgMTAwIDExMEMxMTEuMDQ2IDExMCAxMjAgMTAxLjA0NiAxMjAgOTBDMTIwIDc4Ljk1NDMgMTExLjA0NiA3MCAxMDAgNzBaIiBmaWxsPSIjQ0JELTQ2NiIvPgo8cGF0aCBkPSJNMTYwIDE2MEg0MEM0MCAxNjAgNDAgMTYwIDQwIDE2MFYxMjBDNDAgMTIwIDQwIDEyMCA0MCAxMjBIMTYwQzE2MCAxMjAgMTYwIDEyMCAxNjAgMTIwVjE2MFoiIGZpbGw9IiNDQkQtNDY2Ii8+Cjwvc3ZnPgo='; }"
                    />
                    <button class="card-more" aria-label="More options" aria-haspopup="menu" aria-expanded="false" data-id="${item.id}">
                        <!-- three dots (vertical) -->
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 13c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M12 6c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M12 20c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
                <div class="card-meta">
                    <h3 class="card-title">${this.escapeHtml(title)}</h3>
                    <div class="card-price">${this.escapeHtml(item.price || "")}</div>
                    <div class="card-domain">${this.escapeHtml(domain)}</div>
                </div>
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
                await this.renderGridFiltered();
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
            
            // Process image URL - store original for fallback
            let image = '';
            if (d.image) {
                // Store original URL for fallback, use weserv.nl for display
                image = d.image;
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

        // Set image with proxy-first approach
        const fallbackImg = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        
        if (image) {
            const original = image;
            const proxied = original ? this.proxiedImage(original) : '';

            if (previewImg) {
                previewImg.referrerPolicy = 'no-referrer';
                previewImg.src = proxied || fallbackImg;
                previewImg.onerror = () => {
                    if (original && previewImg.src !== original) {
                        previewImg.src = original; // fallback to original
                    } else {
                        previewImg.src = fallbackImg; // final fallback to favicon
                    }
                };
            }
        } else {
            previewImg.src = fallbackImg;
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
        const addBtn = document.getElementById('addItemBtn');
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

    setupMoreMenu() {
        const moreMenu = document.getElementById('moreMenu');
        const moreBackdrop = document.getElementById('moreMenuBackdrop');
        let moreCurrentId = null;

        const openMoreMenuFor = (targetBtn, itemId) => {
            moreCurrentId = itemId;

            // Compute position near the button (below-left)
            const r = targetBtn.getBoundingClientRect();
            const pad = 8;
            const top = r.bottom + pad + window.scrollY;
            const left = Math.min(
                window.scrollX + r.left,
                window.scrollX + window.innerWidth - (moreMenu.offsetWidth || 220) - pad
            );

            moreMenu.style.top = `${top}px`;
            moreMenu.style.left = `${left}px`;
            moreMenu.hidden = false;
            moreBackdrop.hidden = false;
            requestAnimationFrame(() => {
                moreBackdrop.classList.add('active');
            });

            // A11y
            targetBtn.setAttribute('aria-expanded', 'true');
            moreMenu.focus?.();
        };

        const closeMoreMenu = () => {
            moreBackdrop.classList.remove('active');
            moreBackdrop.hidden = true;
            moreMenu.hidden = true;

            // Reset any expanded button
            document.querySelectorAll('.card-more[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
            moreCurrentId = null;
        };

        // Delegate click on card more buttons
        document.addEventListener('click', (e) => {
            const btn = e.target.closest?.('.card-more');
            if (!btn) return;
            e.preventDefault();
            openMoreMenuFor(btn, btn.dataset.id);
        });

        // Backdrop / outside click / ESC
        moreBackdrop.addEventListener('click', closeMoreMenu);
        document.addEventListener('keydown', (e) => { 
            if (e.key === 'Escape' && !moreMenu.hidden) closeMoreMenu(); 
        });

        // Menu actions
        moreMenu.addEventListener('click', async (e) => {
            const actionBtn = e.target.closest('.menu-item');
            if (!actionBtn) return;
            
            const action = actionBtn.dataset.action;
            if (!moreCurrentId) {
                console.error('No current item ID for menu action');
                closeMoreMenu();
                return;
            }

            try {
                // Try to get item from database first, then from memory
                let item = await this.db.getItemById(moreCurrentId);
                if (!item) {
                    item = this.items?.find(i => i.id === moreCurrentId);
                }
                
                if (!item) { 
                    console.error('Item not found for ID:', moreCurrentId);
                    this.showToast('Item not found', 'error');
                    closeMoreMenu(); 
                    return; 
                }

                if (action === 'share') {
                    try {
                        if (navigator.share) {
                            await navigator.share({ 
                                title: item.title || item.domain, 
                                url: item.url 
                            });
                        } else {
                            await navigator.clipboard.writeText(item.url);
                            this.showToast('Link copied');
                        }
                    } catch(error) { 
                        console.log('Share cancelled or failed:', error);
                        // Don't show error for user cancellation
                    }
                }

                if (action === 'delete') {
                    const ok = confirm('Delete this item?');
                    if (ok) {
                        try {
                            await this.db.deleteItem(item.id);
                            await this.renderGridFiltered();
                            this.showToast('Item deleted');
                        } catch (error) {
                            console.error('Failed to delete item:', error);
                            this.showToast('Failed to delete item', 'error');
                        }
                    }
                }
            } catch (error) {
                console.error('Menu action failed:', error);
                this.showToast('Action failed', 'error');
            } finally {
                closeMoreMenu();
            }
        });
    }

    setupScrollShadow() {
        const topbar = document.getElementById('topbar');
        let last = 0;
        document.addEventListener('scroll', () => {
            const y = window.scrollY || 0;
            if ((y > 2) !== (last > 2)) {
                topbar.style.boxShadow = y > 2 ? '0 2px 12px rgba(0,0,0,0.06)' : 'none';
            }
            last = y;
        }, { passive: true });
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WantApp();
});
