import { ItemManager } from './src/data/items.js';
import { renderCard } from './src/ui/renderCard.js';
import { isProbablyUrl } from './src/utils/url.js';
import { openSheet, closeSheet } from './src/ui/bottomSheet.js';
import { EXTRACT_ENDPOINT } from './src/config.js';
import { withStableBust } from './src/utils/cacheBust.js';


import { supabase } from './supabaseClient.js';
import { loadItems, addItem, deleteItem, subscribeItems } from './itemsApi.js';





const PASTE_DEBOUNCE_MS = 120;

function domainFrom(url) {
    try { return new URL(url).hostname.replace(/^www\./,''); } catch { return ""; }
}


function isStandalonePWA() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() { 
    return /iPhone|iPad|iPod/i.test(navigator.userAgent); 
}


export async function authInit() {
  
  let renderQueued = false;
  
  function renderOnceStable() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      
    });
  }

  
  function hideInitialLoader() {
    const loader = document.getElementById('initial-loader');
    if (loader) {
      loader.classList.add('hidden');
      
      setTimeout(() => {
        if (loader.parentNode) {
          loader.parentNode.removeChild(loader);
        }
      }, 300);
    }
  }

  
  const unsub = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      showAppForUser(session.user);
    } else {
      showLoginScreen();
    }
    hideInitialLoader();
    renderOnceStable();
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    showAppForUser(session.user);
  } else {
    showLoginScreen();
  }
  hideInitialLoader();
}

export function loginWithGoogle() {
  
  const redirectTo = window.location.href.split('?')[0]; 
  console.log('OAuth redirectTo =', redirectTo); 

  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,            
      
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
}


export function loginWithApple() {
  
  const redirectTo = window.location.href.split('?')[0]; 
  console.log('Apple OAuth redirectTo =', redirectTo);

  return supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { 
      redirectTo,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
}

export async function logout() {
  await supabase.auth.signOut();
  
  if (window.__unsubItems) window.__unsubItems();
  
  
  if (window.wantApp) {
    window.wantApp.items = [];
  }
  
  
  location.replace(window.location.pathname);
}

async function showAppForUser(user) {
  
  const authScreen = document.getElementById('auth-screen');
  const topbar = document.getElementById('topbar');
  const avatarBtn = document.getElementById('avatarBtn');
  const appMain = document.getElementById('appMain');
  
  if (authScreen) authScreen.style.display = 'none';
  if (topbar) topbar.style.display = 'block';
  if (avatarBtn) avatarBtn.hidden = false;
  if (appMain) appMain.style.display = 'block';
  
  
  const img = document.getElementById('avatarImg');
  
  
  if (!img || !avatarBtn) {
    console.warn('Avatar elements not found, skipping avatar setup');
    return;
  }
  
  if (user.user_metadata?.avatar_url) {
    
    img.src = user.user_metadata.avatar_url;
    img.style.display = 'block';
    
    
    img.onerror = () => {
      console.warn('Avatar failed to load, using fallback');
      img.style.display = 'none';
      
      const initials = (user.user_metadata?.full_name || user.email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      avatarBtn.innerHTML = `<div class="avatar-fallback">${initials}</div>`;
    };
    
    
    img.onload = () => {
      
      avatarBtn.innerHTML = '';
      avatarBtn.appendChild(img);
    };
  } else {
    
    img.style.display = 'none';
    const initials = (user.user_metadata?.full_name || user.email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    avatarBtn.innerHTML = `<div class="avatar-fallback">${initials}</div>`;
  }
  
  img.alt = user.user_metadata?.full_name || user.email || 'Account';

  
  const btn = document.getElementById('avatarBtn');
  if (btn) {
    btn.onclick = (e) => {
      e.stopPropagation();
      
      openAccountSheet(user);
    };
  }

  
  try {
    const items = await loadItems();
    if (window.wantApp && window.wantApp.renderItems) {
      window.wantApp.items = items; 
      window.wantApp.renderItems(items);
    } else {
      console.warn('WantApp instance not ready yet');
    }
  } catch (error) {
    console.error('Failed to load items:', error);
  }

  
  if (window.__unsubItems) window.__unsubItems();
  window.__unsubItems = subscribeItems(
    (row) => {
      if (window.wantApp && window.wantApp.onItemAdded) {
        window.wantApp.onItemAdded(row);
      }
    },
    (row) => {
      if (window.wantApp && window.wantApp.onItemDeleted) {
        window.wantApp.onItemDeleted(row.id);
      }
    }
  );
}

function showLoginScreen() {
  
  const authScreen = document.getElementById('auth-screen');
  const topbar = document.getElementById('topbar');
  const avatarBtn = document.getElementById('avatarBtn');
  const appMain = document.getElementById('appMain');
  
  if (authScreen) authScreen.style.display = 'flex';
  if (topbar) topbar.style.display = 'none';
  if (avatarBtn) avatarBtn.hidden = true;
  if (appMain) appMain.style.display = 'none';

  
  document.getElementById('btn-google').onclick = () => {
    const btn = document.getElementById('btn-google');
    
    
    btn.innerHTML = `
      <div class="auth-loading-spinner">
        <div class="spinner"></div>
      </div>
      <span>Connecting...</span>
    `;
    btn.disabled = true;
    
    
    loginWithGoogle();
  };
}

function openAccountSheet(user) {
    
    const name = user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || '—';
    const email = user.email || '—';
    
    
    const html = `
        <header class="sheet-header">
            <h2>Account</h2>
        </header>
        <div class="sheet-body">
            <div class="account-row">
                <div class="account-label">Name</div>
                <div class="account-value">${name}</div>
            </div>
            <div class="account-row">
                <div class="account-label">Email</div>
                <div class="account-value">${email}</div>
            </div>
            <hr class="sheet-divider" />
            <button id="btn-logout" class="account-danger">
                <span class="icon" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http:
                        <path d="M16 17L21 12M21 12L16 7M21 12H9M9 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </span>
                <span>Log out</span>
            </button>
        </div>
    `;
    
    
    openSheet(html);
    
    
    setTimeout(() => {
        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.onclick = async () => {
                await logout();
                closeSheet();
            };
        }
    }, 100);
}



let accountPopoverEl;
function openAccountPopover(anchorEl, user) {
    closeAccountPopover();
    const pop = document.createElement('div');
    pop.id = 'account-popover';
    pop.className = 'account-popover';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = `
        <div class="acc-name">${(user.name || user.email || 'Signed in').replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</div>
        <div class="acc-email">${(user.email || '').replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</div>
        <div class="acc-divider"></div>
        <button class="acc-logout" id="acc-logout-pop">Log out</button>
    `;
    document.body.appendChild(pop);
    positionPopoverBelow(pop, anchorEl);
    document.getElementById('acc-logout-pop').onclick = async () => {
        await logout();
        closeAccountPopover();
    };
    const onDocClick = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) closeAccountPopover(); };
    const onKey = (e) => { if (e.key === 'Escape') closeAccountPopover(); };
    setTimeout(() => {
        document.addEventListener('click', onDocClick, { capture: true });
        document.addEventListener('keydown', onKey);
        pop._cleanup = () => {
            document.removeEventListener('click', onDocClick, { capture: true });
            document.removeEventListener('keydown', onKey);
        };
    });
    accountPopoverEl = pop;
}

function closeAccountPopover() { 
    accountPopoverEl?._cleanup?.(); 
    accountPopoverEl?.remove(); 
    accountPopoverEl = null; 
}

function positionPopoverBelow(pop, anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    pop.style.position = 'absolute';
    pop.style.top = `${r.bottom + 8 + window.scrollY}px`;
    pop.style.left = `${Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - pop.offsetWidth - 12)}px`;
}













































































export class WantApp {
    constructor() {
        this.db = new WantDB();
        this.itemManager = new ItemManager(this.db);
        this.selectedStore = null; 
        this.pasteTimer = null;
        this.addInFlight = false; 
        this.items = []; 
        
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.init();
            });
        } else {
            this.init();
        }
    }

    async init() {
        
        await authInit();
        
        
        this.wireUI();
        this.enableGlobalPaste();
        this.hydrateFromQueryParams();
        
        
        await this.db.init();
        
        
        ['openAddBtn','addItemBtn','urlInput','addForm'].forEach(id => {
            const els = document.querySelectorAll('#'+id);
            if (els.length > 1) console.warn('Duplicate id:', id, els);
        });
        
        
        try {
            const s = localStorage.getItem('want.selectedStore');
            if (s !== null && s !== "") this.selectedStore = s;
        } catch {}
        
        
        this.processHashAdd();
        
        
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('added') === 'true') {
            this.showToast('Item saved to Want');
            
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
    


    wireUI() {
        const openAddBtn = document.getElementById('openAddBtn');        
        const headerSettingsBtn = document.getElementById('settingsBtn'); 

        
        openAddBtn?.setAttribute('type', 'button');
        headerSettingsBtn?.setAttribute('type', 'button');

        
        if (!openAddBtn) console.warn('openAddBtn not found');
        if (!headerSettingsBtn) console.warn('settingsBtn not found');

        openAddBtn?.removeEventListener('click', () => this.showAddSheet());
        openAddBtn?.addEventListener('click', () => this.showAddSheet(), { passive: true });

        headerSettingsBtn?.removeEventListener('click', () => this.showSettingsSheet());
        headerSettingsBtn?.addEventListener('click', () => this.showSettingsSheet(), { passive: true });

        

        

        

        
        this.setupMoreMenu();

        
        this.setupScrollShadow();

        
        this.setupDeleteDelegation();

    }

    enableGlobalPaste() {
        window.addEventListener('paste', (e) => {
            
            const active = document.activeElement;
            const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
            const modalOpen = !!document.querySelector('.sheet.is-open');
            const dt = e.clipboardData || window.clipboardData;
            const text = dt?.getData('text')?.trim() || '';

            if (!text) return;

            if (typing || modalOpen) {
                
                return;
            }

            if (!isProbablyUrl(text)) return;

            e.preventDefault();

            clearTimeout(this.pasteTimer);
            this.pasteTimer = setTimeout(() => {
                this.addItemDirectly(text);
            }, PASTE_DEBOUNCE_MS);
        });
    }

    hydrateFromQueryParams() {
        const u = new URLSearchParams(location.search).get('url');
        if (u) {
            const url = decodeURIComponent(u.trim());
            if (isProbablyUrl(url)) {
                
                history.replaceState(null, '', location.pathname);
                this.handleUrlPaste(url);
            }
        }
    }

    async handleUrlPaste(url) {
        
        this.showAddSheet();
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.value = url;
            urlInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    showAddSheet() {
        const html = `
            <div class="sheet-header">
                <h2>Add to Want</h2>
                <button class="sheet-close-btn" onclick="window.wantApp.hideAddSheet()">&times;</button>
            </div>
            <form id="addForm">
                <div class="form-group">
                    <label for="urlInput">URL *</label>
                    <input type="url" id="urlInput" name="url" required placeholder="https:
                </div>

                <div id="metaPreview" class="hidden preview">
                    <div class="preview-img-wrap">
                        <img id="previewImg" alt="Preview" />
                    </div>
                    <div class="preview-title" id="previewTitle"></div>
                    <div class="preview-meta">
                        <span id="previewPrice"></span>
                        <span id="previewDomain"></span>
                    </div>
                    <button type="button" id="toggleAdvanced" class="linklike">Edit details</button>
                </div>

                <!-- Advanced fields (hidden by default) -->
                <div id="advanced" class="hidden">
                    <div class="form-group">
                        <label for="titleInput">Title</label>
                        <input type="text" id="titleInput" name="title">
                    </div>
                    <div class="form-group">
                        <label for="priceInput">Price</label>
                        <input type="text" id="priceInput" name="price" placeholder="$99.99">
                    </div>
                    <div class="form-group">
                        <label for="imageInput">Image URL</label>
                        <input type="url" id="imageInput" name="image" placeholder="https:
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" id="addItemBtn" class="btn-primary" disabled>Add Item</button>
                </div>
            </form>
        `;
        
        openSheet(html);
        
        
        setTimeout(() => {
            const urlInput = document.getElementById('urlInput');
            if (urlInput) urlInput.focus();
        }, 100);
        
        
        this.attachAddFormHandler();
    }

    hideAddSheet() {
        closeSheet();
        
        
        const form = document.getElementById('addForm');
        if (form) form.reset();
        
        this.hidePreview();
        const advanced = document.getElementById('advanced');
        if (advanced) advanced.classList.add('hidden');
        const toggleAdvanced = document.getElementById('toggleAdvanced');
        if (toggleAdvanced) toggleAdvanced.textContent = 'Edit details';
        this.updateAddButton(false);
    }

    showSettingsSheet() {
        const html = `
            <div class="sheet-header">
                <h2>Settings</h2>
                <button class="sheet-close-btn" onclick="window.wantApp.hideSettingsSheet()">&times;</button>
            </div>
            <div class="settings-content">
                <div class="settings-section">
                    <h3>Data Management</h3>
                    <div class="settings-actions">
                        <button id="exportBtn" class="btn-secondary">Export Data</button>
                        <button id="importBtn" class="btn-secondary">Import Data</button>
                    </div>
                    <input type="file" id="importFile" accept=".json" style="display: none;">
                </div>
                <div class="settings-section">
                    <h3>About</h3>
                    <p>Want - Your personal wishlist</p>
                    <p>Version 1.0.0</p>
                    <p>Made in London by JAG Studio Ltd</p>
                </div>
            </div>
        `;
        
        openSheet(html);
        
        
        this.attachSettingsHandlers();
    }

    hideSettingsSheet() {
        closeSheet();
    }

    attachAddFormHandler() {
        const form = document.getElementById('addForm');
        const addBtn = document.getElementById('addItemBtn');
        const urlInput = document.getElementById('urlInput');

        if (!form || !addBtn || !urlInput) return;

        
        form.removeEventListener('submit', this.handleAddFormSubmit);
        
        
        this.handleAddFormSubmit = async (e) => {
            e.preventDefault();
            const raw = urlInput.value.trim();
            const url = this.normalizeUrl(raw);
            if (!isProbablyUrl(url)) { 
                alert('Paste a valid URL'); 
                return; 
            }

            addBtn.disabled = true;
            try {
                await this.addItemDirectly(url);
                this.hideAddSheet();
            } catch (error) {
                console.error('Failed to add item:', error);
                alert('Failed to add item. Please try again.');
            } finally {
                addBtn.disabled = false;
            }
        };
        
        form.addEventListener('submit', this.handleAddFormSubmit);

        
        urlInput.addEventListener('input', () => {
            this.updateAddButton(!!urlInput.value.trim());
        });
        
        urlInput.addEventListener('paste', (e) => {
            
            setTimeout(() => {
                const value = urlInput.value.trim();
                this.updateAddButton(!!value);
            }, 10);
        });
        
        urlInput.addEventListener('blur', () => {
            this.updateAddButton(!!urlInput.value.trim());
        });

        
        const toggleAdvanced = document.getElementById('toggleAdvanced');
        if (toggleAdvanced) {
            toggleAdvanced.addEventListener('click', () => {
                this.toggleAdvancedFields();
            });
        }
    }

    attachSettingsHandlers() {
        
        const exportBtn = document.getElementById('exportBtn');
        const importBtn = document.getElementById('importBtn');
        const importFile = document.getElementById('importFile');

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportData();
            });
        }

        if (importBtn) {
            importBtn.addEventListener('click', () => {
                if (importFile) importFile.click();
            });
        }

        if (importFile) {
            importFile.addEventListener('change', (e) => {
                this.importData(e.target.files[0]);
            });
        }
    }





    async loadItems() {
        try {
            const items = await this.db.getAllItems();
            this.items = items; 
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
            
            this.renderStoreTags(items);
            return;
        }

        emptyState.style.display = 'none';
        grid.innerHTML = items.map(item => this.createItemCard(item)).join('');
        
        
        this.renderStoreTags(items);
        
        
    }

    
    onItemAdded(item) {
        
        const existingItem = this.items.find(i => i.id === item.id);
        if (existingItem) return;
        
        
        this.items.unshift(item);
        
        
        this.renderItems(this.items);
    }

    onItemDeleted(itemId) {
        
        this.items = this.items.filter(item => item.id !== itemId);
        
        
        this.renderItems(this.items);
    }



    normalizeUrl(str) {
        const s = String(str).trim();
        if (!s) return "";
        if (/^https?:\/\
        if (/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(s)) return `https:
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
        return `https:
    }

    async buildItemFromUrl(url) {
        const host = this.hostnameOf(url);
        const meta = this.extractBasicMetadata(url); 

        
        let original = meta?.image || '';
        let proxied = '';
        let fallback = `https:

        
        if (host.includes('zara.com')) {
            fallback = 'https:
        } else if (host.includes('hm.com') || host.includes('h&m')) {
            fallback = 'https:
        } else if (host.includes('amazon.')) {
            fallback = 'https:
        }

        
        if (original && !host.includes('zara.com') && !host.includes('hm.com') && !host.includes('amazon.')) {
            proxied = this.proxiedImage(original);
        }

        const createdAt = Date.now();
        return {
            id: crypto?.randomUUID ? crypto.randomUUID() : String(createdAt),
            url,
            title: meta?.title || this.getDomainDisplayName(host),
            price: meta?.price || '',
            image: withStableBust(proxied || fallback, createdAt), 
            originalImage: original, 
            domain: this.normalizedDomainFrom(url),
            createdAt,
        };
    }

    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    



    
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

    
    normalizedDomainFrom(urlStr) {
        const d = this.getMainDomain(urlStr);
        return d || (function(){ try { return new URL(urlStr).hostname.replace(/^www\./i,""); } catch { return ""; }})();
    }

    
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

        
        if (items.length === 0) {
            el.style.display = 'none';
            return;
        }

        
        el.style.display = 'block';

        const counts = this.getDomainCounts(items);
        const entries = Array.from(counts.entries())
            .sort((a, b) => a[0].localeCompare(b[0])); 

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

        
        el.querySelectorAll('.tag-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const store = btn.dataset.store || null;
                console.log('Tag clicked:', { store, currentItems: this.items?.length });
                
                this.selectedStore = store;
                
                try { 
                    localStorage.setItem('want.selectedStore', store ?? ""); 
                } catch {}
                this.renderStoreTags(items); 
                this.renderGridFiltered();   
            });
        });
    }

    
    async refreshStoreTags() {
        
        if (this.items) {
            this.renderStoreTags(this.items);
        }
    }

    async renderGridFiltered() {
        
        if (!this.items) {
            console.warn('No items available for filtering');
            return;
        }
        
        const filtered = this.selectedStore
            ? this.items.filter(it => (it.domain || this.getMainDomain(it.url)) === this.selectedStore)
            : this.items;

        console.log('Filtering items:', {
            total: this.items.length,
            selectedStore: this.selectedStore,
            filtered: filtered.length
        });

        
        this.renderItems(filtered);

        
        this.renderStoreTags(this.items);
    }

    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    

        renderOverflowButton(item) {
        return `
            <button class="overflow-btn" aria-label="More options" aria-haspopup="menu" aria-expanded="false" data-id="${item.id}">
                <!-- three dots (vertical) -->
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 13c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 6c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 20c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        `;
    }

    createItemCard(item) {
        const domain = item.domain || this.hostnameOf(item.url);
        const title = item.title || domain;
        
        
        const hasRealImage = item.image && !this.isFavicon(item.image);

        const thumbClasses = [
            'thumb',
            hasRealImage ? '' : 'placeholder no-image'
        ].join(' ').trim();

        const imgTag = hasRealImage
            ? `<img src="${this.escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"
                   onload="this.parentElement.classList.add('loaded')" />`
            : ''; 

        return `
            <article class="item-card" data-id="${item.id}">
                <a href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener" class="card-link">
                    <div class="${thumbClasses}">
                        ${imgTag}
                    </div>
                    <div class="meta">
                        <h3 class="title">${this.escapeHtml(title)}</h3>
                        ${item.price ? `<div class="price">${this.escapeHtml(item.price)}</div>` : ''}
                        <div class="domain">${this.escapeHtml(domain)}</div>
                    </div>
                </a>
                ${this.renderOverflowButton(item)}
            </article>
        `;
    }

    
    renderItemCard(item) {
        const grid = document.getElementById('itemsGrid');
        const emptyState = document.getElementById('emptyState');
        
        
        emptyState.style.display = 'none';
        
        
        const cardHtml = this.createItemCard(item);
        
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const card = tempDiv.firstElementChild;
        
        if (item._optimistic) {
            card.classList.add('optimistic');
            
        }
        
        
        grid.insertBefore(card, grid.firstChild);
        
        
        if (this.items.length === 0) {
            
            this.renderStoreTags([item]);
        }
        
        
    }

    getDefaultImage(domain) {
        
        return `https:
    }

    async upsertItem(item) {
        try {
            
            const existingItem = await this.db.getItemByUrl(item.url);
            if (existingItem) {
                
                const updatedItem = { 
                    ...existingItem, 
                    title: item.title,
                    price: item.price,
                    image: item.image,
                    createdAt: Date.now() 
                };
                await this.db.db.put(this.db.storeName, updatedItem);
                return existingItem.id;
            } else {
                
                const newItem = await this.db.addItem(item);
                return newItem.id;
            }
        } catch (error) {
            console.error('Error upserting item:', error);
            throw error;
        }
    }

    async deleteItem(id) {
        try {
            
            await deleteItem(id);
            
            
            this.items = this.items.filter(item => item.id !== id);
            
            
            this.renderItems(this.items);
            this.showToast('Item deleted');
        } catch (error) {
            console.error('Error deleting item:', error);
            this.showToast('Error deleting item');
        }
    }

    
    isFavicon(url) {
        if (!url) return false;
        return /google\.com\/s2\/favicons/i.test(url);
    }

    
    isProbablyUrl(str) {
        try {
            const u = new URL(str);
            return /^https?:$/.test(u.protocol);
        } catch {
            return /^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(str);
        }
    }

    normalizeUrl(str) {
        if (/^https?:\/\
        if (/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(str)) return `https:
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

        
        if (!isProbablyUrl(url)) {
            console.log('URL not valid:', url);
            this.hidePreview();
            this.updateAddButton(false);
            return;
        }

        console.log('Processing URL:', url);

        
        this.updateAddButton(true);

        
        this.showPreviewLoading();

        try {
            
            console.log('Fetching metadata from worker for:', url);
            const res = await fetch(`${EXTRACT_ENDPOINT}?url=${encodeURIComponent(url)}`, {
                mode: 'cors',
                credentials: 'omit',
                redirect: 'follow',
                headers: { 'Accept': 'application/json' },
            });
            
            console.log('Worker response status:', res.status);
            
            if (res.ok) {
                const meta = await res.json();
                console.log('Preview data (Worker):', meta);
                
                
                if (meta && (meta.title || meta.image || meta.price)) {
                    this.updatePreview(meta);
                    this.showPreview();
                    
                    
                    if (!document.getElementById('advanced').classList.contains('hidden')) {
                        this.setAdvancedFormValues(meta);
                    }
                } else {
                    console.log('Worker returned empty data, using fallback');
                    throw new Error('Worker returned empty data');
                }
            } else {
                const errorText = await res.text();
                console.error('Worker error response:', errorText);
                throw new Error(`Worker returned ${res.status}: ${errorText}`);
            }
        } catch (error) {
            console.error('Error handling URL input:', error);
            
            const fallbackMeta = this.extractBasicMetadata(url);
            console.log('Using fallback metadata:', fallbackMeta);
            this.updatePreview(fallbackMeta);
            this.showPreview();
        }
    }



    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    extractBasicMetadata(url) {
        const host = this.hostnameOf(url);
        
        
        let fallbackImg = `https:
        
        
        if (host.includes('zara.com')) {
            fallbackImg = 'https:
        } else if (host.includes('hm.com') || host.includes('h&m')) {
            fallbackImg = 'https:
        } else if (host.includes('amazon.')) {
            fallbackImg = 'https:
        }
        
        
        let title = this.getDomainDisplayName(host);
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
            
            
            if (host.includes('zara.com') || host.includes('hm.com') || host.includes('amazon.')) {
                
                let productPatterns = [];
                
                if (host.includes('zara.com')) {
                    
                    productPatterns = [
                        /\/product\/([^\/\?]+)/i,
                        /\/[a-z-]+\/([^\/\?]+)/i, 
                        /\/[A-Z0-9]{8,}/i, 
                    ];
                } else if (host.includes('amazon.')) {
                    
                    productPatterns = [
                        /\/dp\/([A-Z0-9]{10})/i, 
                        /\/gp\/product\/([A-Z0-9]{10})/i, 
                        /\/[A-Z0-9]{10,}/i, 
                        /\/[^\/]+\/dp\/([A-Z0-9]{10})/i, 
                    ];
                } else {
                    
                    productPatterns = [
                        /\/product\/([^\/\?]+)/i,
                        /\/item\/([^\/\?]+)/i,
                        /\/p\/([^\/\?]+)/i,
                        /\/dp\/([A-Z0-9]+)/i,
                        /\/[A-Z0-9]{10,}/i,
                    ];
                }
                
                for (const pattern of productPatterns) {
                    const match = url.match(pattern);
                    if (match && match[1]) {
                        let productName = match[1]
                            .replace(/[-_]/g, ' ')
                            .replace(/\.[^/.]+$/, '') 
                            .replace(/\?.*$/, '') 
                            .replace(/#.*$/, '') 
                            .trim();
                        
                        
                        if (host.includes('amazon.') && /^[A-Z0-9]{10}$/.test(productName)) {
                            
                            const pathMatch = url.match(/\/[^\/]+\/dp\/[A-Z0-9]{10}\/?/i);
                            if (pathMatch) {
                                const pathBeforeAsin = pathMatch[0].replace(/\/dp\/[A-Z0-9]{10}\/?/i, '');
                                const category = pathBeforeAsin.split('/').pop();
                                if (category && category.length > 2) {
                                    productName = category.replace(/[-_]/g, ' ');
                                }
                            }
                        }
                        
                        
                        if (host.includes('zara.com') && /^[A-Z0-9]{8,}$/.test(productName)) {
                            
                            const categoryMatch = url.match(/\/([a-z-]+)\/[A-Z0-9]{8,}/i);
                            if (categoryMatch && categoryMatch[1]) {
                                productName = categoryMatch[1].replace(/[-_]/g, ' ');
                            }
                        }
                        
                        if (productName.length > 2 && !/^\d+$/.test(productName)) {
                            title = productName;
                            break;
                        }
                    }
                }
            }
            
            
            if (pathParts.length > 0 && title === this.getDomainDisplayName(host)) {
                
                if (host.includes('zara.com')) {
                    const categoryIndex = pathParts.findIndex(part => 
                        ['women', 'men', 'kids', 'home', 'beauty'].includes(part.toLowerCase())
                    );
                    if (categoryIndex !== -1 && categoryIndex < pathParts.length - 1) {
                        const category = pathParts[categoryIndex];
                        const subcategory = pathParts[categoryIndex + 1];
                        if (subcategory && subcategory !== 'index.html') {
                            title = `${category} ${subcategory}`.replace(/[-_]/g, ' ');
                        } else {
                            title = category.replace(/[-_]/g, ' ');
                        }
                    }
                }
                
                else if (host.includes('amazon.')) {
                    const categoryIndex = pathParts.findIndex(part => 
                        part.length > 3 && !/^[A-Z0-9]{10,}$/.test(part) && !/^\d+$/.test(part)
                    );
                    if (categoryIndex !== -1) {
                        const category = pathParts[categoryIndex];
                        if (category && category !== 'index.html' && category !== 'dp' && category !== 'gp') {
                            title = category.replace(/[-_]/g, ' ');
                        }
                    }
                }
                
                else {
                    
                    const lastPart = pathParts[pathParts.length - 1];
                    if (lastPart && lastPart !== 'index.html' && lastPart !== 'index') {
                        
                        let cleanTitle = lastPart
                            .replace(/[-_]/g, ' ')
                            .replace(/\.[^/.]+$/, '') 
                            .replace(/\?.*$/, '') 
                            .replace(/#.*$/, '') 
                            .trim();
                        
                        
                        if (cleanTitle.length > 2 && !/^\d+$/.test(cleanTitle)) {
                            title = cleanTitle;
                        }
                    }
                }
            }
            
            
            const searchParams = urlObj.searchParams;
            if (searchParams.has('q') || searchParams.has('search')) {
                const searchTerm = searchParams.get('q') || searchParams.get('search');
                if (searchTerm && searchTerm.length > 2) {
                    title = decodeURIComponent(searchTerm);
                }
            }
        } catch (e) {
            
        }
        
        return {
            title: title,
            image: fallbackImg,
            price: '',
            domain: host,
        };
    }

    
    getDomainDisplayName(host) {
        const domainMap = {
            'zara.com': 'Zara',
            'www.zara.com': 'Zara',
            'hm.com': 'H&M',
            'www.hm.com': 'H&M',
            'www2.hm.com': 'H&M',
            'amazon.com': 'Amazon',
            'www.amazon.com': 'Amazon',
            'amazon.co.uk': 'Amazon UK',
            'www.amazon.co.uk': 'Amazon UK',
            'amazon.de': 'Amazon Germany',
            'www.amazon.de': 'Amazon Germany',
            'amazon.fr': 'Amazon France',
            'www.amazon.fr': 'Amazon France',
            'amazon.it': 'Amazon Italy',
            'www.amazon.it': 'Amazon Italy',
            'amazon.es': 'Amazon Spain',
            'www.amazon.es': 'Amazon Spain',
            'amazon.ca': 'Amazon Canada',
            'www.amazon.ca': 'Amazon Canada',
            'amazon.com.au': 'Amazon Australia',
            'www.amazon.com.au': 'Amazon Australia',
            'amazon.co.jp': 'Amazon Japan',
            'www.amazon.co.jp': 'Amazon Japan',
            'instagram.com': 'Instagram',
            'www.instagram.com': 'Instagram',
        };
        
        return domainMap[host] || host.replace(/^www\./, '');
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

        
        const fallbackImg = `https:
        
        if (image) {
            const original = image;
            const proxied = original ? this.proxiedImage(original) : '';

            if (previewImg) {
                previewImg.referrerPolicy = 'no-referrer';
                previewImg.src = proxied || fallbackImg;
                previewImg.onerror = () => {
                    if (original && previewImg.src !== original) {
                        previewImg.src = original; 
                    } else {
                        previewImg.src = fallbackImg; 
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
        
        
        document.getElementById('importFile').value = '';
    }

    openEditForUrl(url) {
        
        this.db.getItemByUrl(url).then(item => {
            if (item) {
                
                document.getElementById('urlInput').value = item.url;
                document.getElementById('titleInput').value = item.title;
                document.getElementById('priceInput').value = item.price;
                document.getElementById('imageInput').value = item.image;
                
                
                document.getElementById('advanced').classList.remove('hidden');
                document.getElementById('toggleAdvanced').textContent = 'Hide details';
                
                
                this.updatePreview({ 
                    title: item.title, 
                    image: item.image, 
                    price: item.price, 
                    domain: item.domain 
                });
                this.showPreview();
                this.updateAddButton(true);
                
                
                this.showModal();
            }
        }).catch(error => {
            console.error('Error finding item for edit:', error);
        });
    }

    
    showToast(msg) {
        let t = document.getElementById('toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toast';
            t.setAttribute('aria-live', 'polite');
            t.setAttribute('aria-atomic', 'true');
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
    }

    setupMoreMenu() {
        const moreMenu = document.getElementById('moreMenu');
        const moreBackdrop = document.getElementById('moreMenuBackdrop');
        let moreCurrentId = null;

        const openMoreMenuFor = (targetBtn, itemId) => {
            moreCurrentId = itemId;

            
            moreMenu.hidden = false;
            moreBackdrop.hidden = false;
            
            
            const r = targetBtn.getBoundingClientRect();
            const menuRect = moreMenu.getBoundingClientRect();
            const pad = 8;
            
            
            
            let top = r.bottom + pad;
            let left = r.left;
            
            
            if (left + menuRect.width > window.innerWidth - pad) {
                left = window.innerWidth - menuRect.width - pad;
            }
            if (left < pad) {
                left = pad;
            }
            
            
            if (top + menuRect.height > window.innerHeight - pad) {
                
                top = r.top - menuRect.height - pad;
            }
            if (top < pad) {
                top = pad;
            }
            
            
            moreMenu.style.top = `${top}px`;
            moreMenu.style.left = `${left}px`;
            
            
            console.log('Menu positioned:', {
                buttonRect: r,
                menuRect: menuRect,
                finalPosition: { top, left },
                menuStyle: { top: moreMenu.style.top, left: moreMenu.style.left }
            });
            
            requestAnimationFrame(() => {
                moreBackdrop.classList.add('active');
            });

            
            targetBtn.setAttribute('aria-expanded', 'true');
            moreMenu.focus?.();
        };

        const closeMoreMenu = () => {
            moreBackdrop.classList.remove('active');
            moreBackdrop.hidden = true;
            moreMenu.hidden = true;

            
            document.querySelectorAll('.overflow-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
            moreCurrentId = null;
        };

        
        document.addEventListener('click', (e) => {
            const btn = e.target.closest?.('.overflow-btn');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            
            
            console.log('Overflow button clicked:', {
                id: btn.dataset.id,
                rect: btn.getBoundingClientRect(),
                scrollY: window.scrollY,
                scrollX: window.scrollX,
                viewport: { width: window.innerWidth, height: window.innerHeight }
            });
            
            openMoreMenuFor(btn, btn.dataset.id);
        });

        
        moreBackdrop.addEventListener('click', closeMoreMenu);
        document.addEventListener('keydown', (e) => { 
            if (e.key === 'Escape' && !moreMenu.hidden) closeMoreMenu(); 
        });

        
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
                
                console.log('Looking for item with ID:', moreCurrentId);
                console.log('Available items:', this.items?.map(i => ({ id: i.id, title: i.title })));
                
                const item = this.items?.find(i => i.id === moreCurrentId);
                
                if (!item) { 
                    console.error('Item not found for ID:', moreCurrentId);
                    console.error('Available item IDs:', this.items?.map(i => i.id));
                    this.showToast('Item not found');
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
                        
                    }
                }

                if (action === 'copy') {
                    const url = item.url;
                    try {
                        if (navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(url);
                        } else {
                            
                            const ta = document.createElement('textarea');
                            ta.value = url;
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            ta.remove();
                        }
                        this.showToast('Link copied to clipboard');
                    } catch (e) {
                        this.showToast('Could not copy link');
                        console.error('Copy failed', e);
                    }
                }

                if (action === 'delete') {
                    const ok = confirm('Delete this item?');
                    if (ok) {
                        try {
                            
                            await deleteItem(item.id);
                            
                            
                            this.items = this.items.filter(i => i.id !== item.id);
                            
                            
                            this.renderItems(this.items);
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

    setupDeleteDelegation() {
        const grid = document.getElementById('grid');
        if (!grid) return;

        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="delete"]');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            const id = btn.getAttribute('data-id');
            if (!id) return;

            
            if (!confirm('Delete this item?')) return;

            this.deleteItem(id);
        });
    }

    processHashAdd() {
        const h = location.hash || '';
        if (!h.startsWith('#add=')) return;
        try {
            const payload = JSON.parse(decodeURIComponent(h.slice(5)));
            
            history.replaceState(null, '', location.pathname);

            const url = (payload.url || '').trim();
            if (!url) return;

            
            if (!window.pendingAdds) window.pendingAdds = new Set();
            if (window.pendingAdds.has(url)) return;
            window.pendingAdds.add(url);

            
            const tempId = this.addOptimisticCard(url);

            
            (async () => {
                try {
                    
                    const final = await this.itemManager.upsertFromMetaOrFetch(payload);
                    await this.db.addOrUpdateItem(final); 
                    this.reconcileCard(tempId, final);
                    this.showToast('Item added');
                } catch (e) {
                    console.error('hash add failed', e);
                    this.reconcileCard(tempId, null, e);
                    this.showToast('Failed to add item');
                } finally {
                    window.pendingAdds.delete(url);
                }
            })();
        } catch (e) {
            console.warn('Invalid #add payload', e);
            history.replaceState(null, '', location.pathname);
        }
    }

    
    
    
    addOptimisticCard(url) {
        const id = `temp_${Date.now()}`;
        const card = {
            id,
            title: "Loading…",
            url,
            site: domainFrom(url),
            price: "",
            image: "",       
            _optimistic: true,
            createdAt: Date.now(),
        };
        this.renderItemCard(card); 
        
        
        const renderedCard = document.querySelector(`[data-item-id="${id}"]`);
        if (renderedCard) {
            renderedCard.setAttribute('data-url', url);
        }
        
        return id;
    }

    removeOptimisticCardByUrl(url) {
        const card = document.querySelector(`.item-card.optimistic[data-url="${CSS.escape(url)}"]`);
        if (card) {
            card.remove();
        }
    }

    
    
    
    
    
    
    
    
    
    
    

    

    
    reconcileCard(tempId, finalObj, err) {
        if (err) {
            this.removeItemCard(tempId);  
            this.showToast("Couldn't add link. Try again."); 
            return;
        }
        
        
        if (!this.updateItemCard(tempId, finalObj)) {
            this.removeItemCard(tempId);
            this.renderItemCard(finalObj);
        }
        
        
        this.refreshStoreTags();
    }

    
    async addItemDirectly(url) {
        if (!window.pendingAdds) window.pendingAdds = new Set();
        if (window.pendingAdds.has(url)) {
            console.log('URL already being added, skipping');
            return;
        }
        window.pendingAdds.add(url);
        
        
        const adding = new Set();
        if (adding.has(url)) return;
        adding.add(url);

        try {
            
            const tempId = this.addOptimisticCard(url);
            
            let metadata = null;
            
            
            try {
                console.log('Fetching metadata from worker for addItemDirectly:', url);
                const response = await fetch(`${EXTRACT_ENDPOINT}?url=${encodeURIComponent(url)}`);
                console.log('Worker response status for addItemDirectly:', response.status);
                
                if (response.ok) {
                    metadata = await response.json();
                    console.log('Worker metadata for addItemDirectly:', metadata);
                    
                    
                    if (!metadata || (!metadata.title && !metadata.image && !metadata.price)) {
                        console.log('Worker returned empty data, using fallback');
                        metadata = null;
                    }
                } else {
                    const errorText = await response.text();
                    console.error('Worker error for addItemDirectly:', errorText);
                    metadata = null;
                }
            } catch (workerError) {
                console.warn('Worker metadata extraction failed, using fallback:', workerError);
                metadata = null;
            }
            
            
            if (!metadata) {
                console.log('Using local metadata fallback for:', url);
                metadata = this.extractBasicMetadata(url);
            }
            
            
            const item = await addItem({
                url: url,
                title: metadata.title || '',
                image: metadata.image || '',
                price: metadata.price || ''
            });
            
            
            if (item && item.image && !this.isFavicon(item.image)) {
                
            } else if (item) {
                
                item.image = '';
            }
            
            if (item) {
                
                this.reconcileCard(tempId, item);
                this.showToast('Item added successfully');
            }
        } catch (error) {
            console.error('addItemDirectly failed', error);
            this.removeOptimisticCardByUrl(url);
            this.showToast(error?.message === 'Item already exists' ? 'Item already exists' : 'Failed to add item');
        } finally {
            window.pendingAdds.delete(url);
            adding.delete(url);
        }
    }

    
    removeItemCard(id) {
        const card = document.querySelector(`[data-item-id="${id}"]`);
        if (card) {
            card.remove();
        }
    }

    updateItemCard(id, obj) {
        const card = document.querySelector(`[data-item-id="${id}"]`);
        if (card) {
            
            const titleEl = card.querySelector('.title');
            const priceEl = card.querySelector('.price');
            const domainEl = card.querySelector('.domain');
            const thumb = card.querySelector('.thumb');
            
            if (titleEl) titleEl.textContent = obj.title || '';
            if (priceEl) priceEl.textContent = obj.price || '';
            if (domainEl) domainEl.textContent = obj.domain || this.hostnameOf(obj.url) || '';
            
            
            if (obj.image && !this.isFavicon(obj.image) && thumb) {
                
                thumb.classList.remove('placeholder', 'no-image');
                
                
                const img = document.createElement('img');
                img.src = obj.image;
                img.alt = '';
                img.loading = 'lazy';
                img.referrerPolicy = 'no-referrer';
                img.onload = function() {
                    this.parentElement.classList.add('loaded');
                    
                    card.classList.remove('optimistic');
                };
                thumb.appendChild(img);
            } else {
                
                thumb.classList.add('placeholder', 'no-image');
                
                const existingImg = thumb.querySelector('img');
                if (existingImg) existingImg.remove();
            }
            
            return true;
        }
        return false;
    }
}