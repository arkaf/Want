// Supabase functionality will be accessed via window.db

// Import the new modular architecture
import { ItemManager } from './src/data/items.js';
import { renderCard } from './src/ui/renderCard.js';
import { isProbablyUrl } from './src/utils/url.js';
import { openSheet, closeSheet } from './src/ui/bottomSheet.js';
import { EXTRACT_ENDPOINT } from './src/config.js';
import { withStableBust } from './src/utils/cacheBust.js';

// Import Supabase auth and items API
import { supabase } from './supabaseClient.js';
import { loadItems, addItem, deleteItem, subscribeItems } from './itemsApi.js';

// Track pending adds to prevent duplicates


// Constants & utils
const PASTE_DEBOUNCE_MS = 120;

function domainFrom(url) {
    try { return new URL(url).hostname.replace(/^www\./,''); } catch { return ""; }
}

// Auth helper functions
function isStandalonePWA() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() { 
    return /iPhone|iPad|iPod/i.test(navigator.userAgent); 
}

// Supabase authentication functions
export async function authInit() {
  // Debounce auth state updates to prevent login/home bouncing
  let renderQueued = false;
  
  function renderOnceStable() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      // Render logic will be handled by the auth state change
    });
  }

  // Listen to auth state changes
  const unsub = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      showAppForUser(session.user);
    } else {
      showLoginScreen();
    }
    renderOnceStable();
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) showAppForUser(session.user); 
  else showLoginScreen();
}

export function loginWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: location.origin + location.pathname, // e.g. https://arkaf.github.io/Want/
      queryParams: { prompt: 'select_account' },
    },
  });
}

// Apple: wire later when Apple is ready in dashboard
export function loginWithApple() {
  return supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: location.origin + location.pathname },
  });
}

export async function logout() {
  await supabase.auth.signOut();
  // clear any local caches if present
  if (window.__unsubItems) window.__unsubItems();
  
  // Clear in-memory state
  if (window.wantApp) {
    window.wantApp.items = [];
  }
  
  // Hard bounce to the root to kill any stale state from SW/router
  location.replace('/');
}

async function showAppForUser(user) {
  // User is authenticated - show app
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('topbar').style.display = 'block';
  document.getElementById('avatarBtn').hidden = false;
  document.getElementById('appMain').style.display = 'block';
  
  // Set avatar with error handling for 429 rate limits
  const img = document.getElementById('avatarImg');
  const avatarBtn = document.getElementById('avatarBtn');
  
  if (user.user_metadata?.avatar_url) {
    // Try to load the avatar image
    img.src = user.user_metadata.avatar_url;
    img.style.display = 'block';
    
    // Handle image load errors (like 429 rate limits)
    img.onerror = () => {
      console.warn('Avatar failed to load, using fallback');
      img.style.display = 'none';
      // Create a fallback avatar with user's initials
      const initials = (user.user_metadata?.full_name || user.email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      avatarBtn.innerHTML = `<div class="avatar-fallback">${initials}</div>`;
    };
    
    // Handle successful load
    img.onload = () => {
      // Clear any fallback
      avatarBtn.innerHTML = '';
      avatarBtn.appendChild(img);
    };
  } else {
    // No avatar URL - use fallback immediately
    img.style.display = 'none';
    const initials = (user.user_metadata?.full_name || user.email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    avatarBtn.innerHTML = `<div class="avatar-fallback">${initials}</div>`;
  }
  
  img.alt = user.user_metadata?.full_name || user.email || 'Account';

  // Wire avatar click
  const btn = document.getElementById('avatarBtn');
  btn.onclick = (e) => {
    e.stopPropagation();
    if (isIOS() && isStandalonePWA()) {
      openAccountSheet(user);
    } else {
      openAccountPopover(btn, user);
    }
  };

  // 1) Load initial items
  try {
    const items = await loadItems();
    if (window.wantApp && window.wantApp.renderItems) {
      window.wantApp.renderItems(items);
    } else {
      console.warn('WantApp instance not ready yet');
    }
  } catch (error) {
    console.error('Failed to load items:', error);
  }

  // 2) Realtime sync
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
  // Not authenticated - show login screen
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('topbar').style.display = 'none';
  document.getElementById('avatarBtn').hidden = true;
  document.getElementById('appMain').style.display = 'none';
  
  // Hide the entire topbar completely
  const topbar = document.getElementById('topbar');
  if (topbar) {
    topbar.style.display = 'none';
  }

  // Google login with loading spinner
  document.getElementById('btn-google').onclick = () => {
    const btn = document.getElementById('btn-google');
    
    // Show loading state
    btn.innerHTML = `
      <div class="auth-loading-spinner">
        <div class="spinner"></div>
      </div>
      <span>Connecting...</span>
    `;
    btn.disabled = true;
    
    // Start OAuth flow
    loginWithGoogle();
  };
}

function openAccountSheet(user) {
    const wrap = document.createElement('div');
    wrap.className = 'account-sheet';
    wrap.innerHTML = `
        <div class="acc-name">${(user.name || user.email || 'Signed in')}</div>
        <div class="acc-email">${user.email || ''}</div>
        <div class="acc-divider"></div>
        <button class="acc-logout" id="acc-logout-sheet">Log out</button>
    `;
    wrap.querySelector('#acc-logout-sheet').onclick = async () => {
        await logout();
        if (typeof closeSheet === 'function') closeSheet();
    };
    if (typeof openSheet === 'function') openSheet({ content: wrap, title: 'Account' });
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



// Cloudflare Worker API functions (DISABLED - Local storage only)
// const LIST_ID = localStorage.getItem('want.syncKey') || 'want-main';

// async function loadItems() {
//     try {
//         console.log(`Fetching items from ${API}/items?listId=${encodeURIComponent(LIST_ID)}`);
//         const r = await fetch(`${API}/items?listId=${encodeURIComponent(LIST_ID)}`);
//         
//         if (!r.ok) {
//             console.error(`Worker API error: ${r.status} ${r.statusText}`);
//             const errorText = await r.text();
//             console.error('Error response:', errorText);
//             throw new Error(`Worker API error: ${r.status} ${r.statusText}`);
//         }
//         
//         const responseText = await r.text();
//         console.log('Worker response:', responseText);
//         
//         const data = JSON.parse(responseText);
//         const { items } = data;
//         return items || [];
//     } catch (error) {
//         console.error('Error in loadItems:', error);
//         throw error;
//     }
// }

// async function saveItemRemote(item) {
//     try {
//         console.log(`Saving item to ${API}/items`);
//         const r = await fetch(`${API}/items`, {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ listId: LIST_ID, item })
//         });
//         
//         if (!r.ok) {
//             console.error(`Worker API error: ${r.status} ${r.statusText}`);
//             const errorText = await r.text();
//             console.error('Error response:', errorText);
//             throw new Error(`Worker API error: ${r.status} ${r.statusText}`);
//         }
//         
//         const result = await r.json();
//         return result;
//     } catch (error) {
//         console.error('Error in saveItemRemote:', error);
//         throw error;
//     }
// }

// async function deleteItemRemote(id) {
//     try {
//         console.log(`Deleting item from ${API}/items?id=${encodeURIComponent(id)}&listId=${encodeURIComponent(LIST_ID)}`);
//         const r = await fetch(`${API}/items?id=${encodeURIComponent(id)}&listId=${encodeURIComponent(LIST_ID)}`, {
//             method: "DELETE"
//         });
//         
//         if (!r.ok) {
//             console.error(`Worker API error: ${r.status} ${r.statusText}`);
//             const errorText = await r.text();
//             console.error('Error response:', errorText);
//             throw new Error(`Worker API error: ${r.status} ${r.statusText}`);
//         }
//         
//         const result = await r.json();
//         return result;
//     } catch (error) {
//         console.error('Error in deleteItemRemote:', error);
//         throw error;
//     }
// }

// Main application logic
export class WantApp {
    constructor() {
        this.db = new WantDB();
        this.itemManager = new ItemManager(this.db);
        this.selectedStore = null; // null = All
        this.pasteTimer = null;
        this.addInFlight = false; // NEW: prevents double-firing
        this.items = []; // Initialize items array
        
        // Wait for DOM to be ready before initializing
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.init();
            });
        } else {
            this.init();
        }
    }

    async init() {
        // Initialize Supabase auth
        await authInit();
        
        // Wire UI immediately when DOM is ready
        this.wireUI();
        this.enableGlobalPaste();
        this.hydrateFromQueryParams();
        
        // Initialize database (keep for local caching if needed)
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
        
        // Process hash for add.html redirects
        this.processHashAdd();
        
        // Check for success message from add.html
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('added') === 'true') {
            this.showToast('Item saved to Want');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
    


    wireUI() {
        const openAddBtn = document.getElementById('openAddBtn');        // "+ Add"
        const headerSettingsBtn = document.getElementById('settingsBtn'); // gear icon

        // Always mark as non-submit buttons to avoid form submissions
        openAddBtn?.setAttribute('type', 'button');
        headerSettingsBtn?.setAttribute('type', 'button');

        // Log helpful errors if buttons are not found
        if (!openAddBtn) console.warn('openAddBtn not found');
        if (!headerSettingsBtn) console.warn('settingsBtn not found');

        openAddBtn?.removeEventListener('click', () => this.showAddSheet());
        openAddBtn?.addEventListener('click', () => this.showAddSheet(), { passive: true });

        headerSettingsBtn?.removeEventListener('click', () => this.showSettingsSheet());
        headerSettingsBtn?.addEventListener('click', () => this.showSettingsSheet(), { passive: true });

        // Swipe to close is handled by the bottom sheet component

        // Form submission will be handled by attachAddFormHandler()

        // URL field auto-extraction and other handlers will be attached dynamically

        // More menu controller
        this.setupMoreMenu();

        // Scroll shadow effect
        this.setupScrollShadow();

        // Single click delegation for delete buttons
        this.setupDeleteDelegation();

    }

    enableGlobalPaste() {
        window.addEventListener('paste', (e) => {
            // If user is typing in an input/textarea or a modal is open, do NOT auto-add
            const active = document.activeElement;
            const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
            const modalOpen = !!document.querySelector('.sheet.is-open');
            const dt = e.clipboardData || window.clipboardData;
            const text = dt?.getData('text')?.trim() || '';

            if (!text) return;

            if (typing || modalOpen) {
                // Existing behavior: let the paste go to the input (or the modal's URL field handler will pick it up)
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
                // Clear query params immediately to prevent duplicate processing
                history.replaceState(null, '', location.pathname);
                this.handleUrlPaste(url);
            }
        }
    }

    async handleUrlPaste(url) {
        // Open the Add sheet, pre-fill the URL input, start auto-extraction
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
                    <input type="url" id="urlInput" name="url" required placeholder="https://example.com">
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
                        <input type="url" id="imageInput" name="image" placeholder="https://example.com/image.jpg">
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" id="addItemBtn" class="btn-primary" disabled>Add Item</button>
                </div>
            </form>
        `;
        
        openSheet(html);
        
        // Focus the URL input
        setTimeout(() => {
            const urlInput = document.getElementById('urlInput');
            if (urlInput) urlInput.focus();
        }, 100);
        
        // Attach form handler
        this.attachAddFormHandler();
    }

    hideAddSheet() {
        closeSheet();
        
        // Clear form
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
        
        // Attach settings handlers
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

        // Remove existing handlers
        form.removeEventListener('submit', this.handleAddFormSubmit);
        
        // Add new handler
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

        // URL field auto-extraction
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
        const toggleAdvanced = document.getElementById('toggleAdvanced');
        if (toggleAdvanced) {
            toggleAdvanced.addEventListener('click', () => {
                this.toggleAdvancedFields();
            });
        }
    }

    attachSettingsHandlers() {
        // Export/Import
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

    // Real-time sync methods for Supabase
    onItemAdded(item) {
        // Check if item already exists to avoid duplicates
        const existingItem = this.items.find(i => i.id === item.id);
        if (existingItem) return;
        
        // Add to local array
        this.items.unshift(item);
        
        // Re-render the grid
        this.renderItems(this.items);
    }

    onItemDeleted(itemId) {
        // Remove from local array
        this.items = this.items.filter(item => item.id !== itemId);
        
        // Re-render the grid
        this.renderItems(this.items);
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
        const meta = this.extractBasicMetadata(url); // Use local fallback instead of Worker

        // image: prefer proxied, fallback favicon, runtime onerror → original
        const original = meta?.image || '';
        const proxied = original ? this.proxiedImage(original) : '';
        const fallback = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;

        const createdAt = Date.now();
        return {
            id: crypto?.randomUUID ? crypto.randomUUID() : String(createdAt),
            url,
            title: meta?.title || host,
            price: meta?.price || '',
            image: withStableBust(proxied || fallback, createdAt), // stable cache bust
            originalImage: original, // keep for onerror fallback in render
            domain: this.normalizedDomainFrom(url),
            createdAt,
        };
    }

    // Legacy method - no longer used (replaced by addItemDirectly)

    // Load items from Cloudflare Worker (DISABLED)
    // async loadItemsFromWorker() {
    //     try {
    //         console.log('Loading items from Cloudflare Worker...');
    //         const items = await loadItems();
    //         
    //         // Update local items array
    //         this.items = items;
    //         
    //         // Also cache in IndexedDB for offline access
    //         for (const item of items) {
    //             await this.db.upsertItem(item);
    //         }
    //         
    //         console.log(`Loaded ${items.length} items from Worker`);
    //         
    //         // Render the grid
    //         await this.renderGridFiltered();
    //     } catch (error) {
    //         console.error('Error loading items from Worker:', error);
    //         // Fallback to local IndexedDB
    //         await this.renderGridFiltered();
    //     }
    // }



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

        // Hide tags when there are no items
        if (items.length === 0) {
            el.style.display = 'none';
            return;
        }

        // Show tags when there are items
        el.style.display = 'block';

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

    // Refresh store tags with current items
    async refreshStoreTags() {
        const items = await this.itemManager.getAllItems();
        this.renderStoreTags(items);
    }

    async renderGridFiltered() {
        const items = await this.itemManager.getAllItems();
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

    // Swipe to close is now handled by the bottom sheet component

        createItemCard(item) {
        const domain = item.domain || this.hostnameOf(item.url);
        const title = item.title || domain;
        const original = item.originalImage || "";
        const proxied = item.image || (original ? this.proxiedImage(original) : "");
        
        // For optimistic cards, use skeleton instead of favicon
        const fallback = item._optimistic ? "" : this.getDefaultImage(domain);
        
        // Use skeleton placeholder for optimistic cards with no image
        const imageContent = item._optimistic && !proxied ? 
            '<div class="card-image-skeleton"></div>' :
            `<img 
                src="${this.escapeHtml(proxied || fallback)}" 
                alt="${this.escapeHtml(title)}" 
                referrerpolicy="no-referrer"
                data-original="${this.escapeHtml(original)}"
                onerror="if(this.dataset.fallback!=='1' && this.dataset.original){ this.dataset.fallback='1'; this.src=this.dataset.original; } else { this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjFGNUY5Ii8+CjxwYXRoIGQ9Ik0xMDAgNzBDODguOTU0MyA3MCA4MCA3OC45NTQzIDgwIDkwQzgwIDEwMS4wNDYgODguOTU0MyAxMTAgMTAwIDExMEMxMTEuMDQ2IDExMCAxMjAgMTAxLjA0NiAxMjAgOTBDMTIwIDc4Ljk1NDMgMTExLjA0NiA3MCAxMDAgNzBaIiBmaWxsPSIjQ0JELTQ2NiIvPgo8cGF0aCBkPSJNMTYwIDE2MEg0MEM0MCAxNjAgNDAgMTYwIDQwIDE2MFYxMjBDNDAgMTIwIDQwIDEyMCA0MCAxMjBIMTYwQzE2MCAxMjAgMTYwIDEyMCAxNjAgMTIwVjE2MFoiIGZpbGw9IiNDQkQtNDY2Ii8+Cjwvc3ZnPgo='; }"
            />`;

        return `
            <a class="card" href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener" data-item-id="${item.id}">
                <div class="img-wrap">
                    ${imageContent}
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

    // Render a single item card (for optimistic UI)
    renderItemCard(item) {
        const grid = document.getElementById('itemsGrid');
        const emptyState = document.getElementById('emptyState');
        
        // Hide empty state if we have items
        emptyState.style.display = 'none';
        
        // Create the card HTML
        const cardHtml = this.createItemCard(item);
        
        // Add optimistic styling if needed
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const card = tempDiv.firstElementChild;
        
        if (item._optimistic) {
            card.classList.add('optimistic');
            // Shimmer effect is handled by CSS, no inline opacity needed
        }
        
        // Insert at the beginning of the grid
        grid.insertBefore(card, grid.firstChild);
        
        // Update store tags when adding first item
        if (this.items.length === 0) {
            // This is the first item, update store tags immediately
            this.renderStoreTags([item]);
        }
        
        // More button events are handled by delegation in setupMoreMenu()
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
        try {
            // Delete from Supabase
            await deleteItem(id);
            
            // Update local items array
            this.items = this.items.filter(item => item.id !== id);
            
            await this.renderGridFiltered();
            this.showToast('Item deleted');
        } catch (error) {
            console.error('Error deleting item:', error);
            this.showToast('Error deleting item');
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
        if (!isProbablyUrl(url)) {
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
            // Use the new Worker endpoint for robust extraction
            const res = await fetch(`${EXTRACT_ENDPOINT}?url=${encodeURIComponent(url)}`, {
                mode: 'cors',
                credentials: 'omit',
                redirect: 'follow',
                headers: { 'Accept': 'application/json' },
            });
            
            if (res.ok) {
                const meta = await res.json();
                console.log('Preview data (Worker):', meta);
                this.updatePreview(meta);
                this.showPreview();
                
                // Update advanced fields if they're visible
                if (!document.getElementById('advanced').classList.contains('hidden')) {
                    this.setAdvancedFormValues(meta);
                }
            } else {
                throw new Error(`Worker returned ${res.status}`);
            }
        } catch (error) {
            console.error('Error handling URL input:', error);
            // Show fallback preview
            const fallbackMeta = this.extractBasicMetadata(url);
            this.updatePreview(fallbackMeta);
            this.showPreview();
        }
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
    //         }
    //         
    //         // Process image URL - store original for fallback
    //         let image = '';
    //         if (d.image) {
    //             // Store original URL for fallback, use weserv.nl for display
    //         }
    //         
    //         return {
    //             title: d.title || '',
    //             image,
    //             price: d.price || '',
    //         };
    //     } catch (error) {
    //         console.log('enrichFromMeta failed:', error.message);
    //         // Return null to trigger fallback
    //         return null;
    //     }
    // }

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
            domain: host,
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

    // Utility: toast
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
            e.stopPropagation();
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
                        // Don't show error for user cancellation
                    }
                }

                if (action === 'copy') {
                    const url = item.url;
                    try {
                        if (navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(url);
                        } else {
                            // Fallback
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

            // Confirm exactly once
            if (!confirm('Delete this item?')) return;

            this.deleteItem(id);
        });
    }

    processHashAdd() {
        const h = location.hash || '';
        if (!h.startsWith('#add=')) return;
        try {
            const payload = JSON.parse(decodeURIComponent(h.slice(5)));
            // Clear hash immediately to avoid re-processing on refresh/back
            history.replaceState(null, '', location.pathname);

            const url = (payload.url || '').trim();
            if (!url) return;

            // Prevent duplicate add while another is running
            if (!window.pendingAdds) window.pendingAdds = new Set();
            if (window.pendingAdds.has(url)) return;
            window.pendingAdds.add(url);

            // Show optimistic card (no opacity, just shimmer)
            const tempId = this.addOptimisticCard(url);

            // Enrich + write once
            (async () => {
                try {
                    // If server already sent title/image/price, prefer them, otherwise enrich again if needed
                    const final = await this.itemManager.upsertFromMetaOrFetch(payload);
                    await this.db.addOrUpdateItem(final); // single write
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

    // Direct add pipeline (optimistic UI)
    
    // Show an optimistic placeholder card
    addOptimisticCard(url) {
        const id = `temp_${Date.now()}`;
        const card = {
            id,
            title: "Loading…",
            url,
            site: domainFrom(url),
            price: "",
            image: "",  // blank; card shows skeleton
            _optimistic: true,
            createdAt: Date.now(),
        };
        this.renderItemCard(card); // existing renderer should handle "loading" skeleton by checking _optimistic or empty image
        return id;
    }

    removeOptimisticCardByUrl(url) {
        const card = document.querySelector(`.card.optimistic[data-url="${CSS.escape(url)}"]`);
        if (card) {
            card.remove();
        }
    }

    // Fetch meta from Worker (DISABLED - using local extraction)
    // async fetchMeta(url) {
    //     const r = await fetch(`${META_ENDPOINT}?url=${encodeURIComponent(url)}`, { mode: 'cors' });
    //     if (!r.ok) throw new Error(`meta ${r.status}`);
    //     const data = await r.json();
    //     return {
    //         title: data.title || domainFrom(url),
    //         image: data.image || "",
    //         price: data.price || "",
    //     };
    // }

    // Legacy method - no longer used (replaced by itemManager.createItemFromUrl)

    // Replace placeholder with real card or remove on error
    reconcileCard(tempId, finalObj, err) {
        if (err) {
            this.removeItemCard(tempId);  // delete skeleton
            this.showToast("Couldn't add link. Try again."); // small non-blocking toast
            return;
        }
        // Replace existing skeleton in-place if your renderer supports it,
        // otherwise remove and re-render the final card.
        if (!this.updateItemCard(tempId, finalObj)) {
            this.removeItemCard(tempId);
            this.renderItemCard(finalObj);
        }
        
        // Refresh store tags to include the new item
        this.refreshStoreTags();
    }

    // Main direct-add flow
    async addItemDirectly(url) {
        if (!window.pendingAdds) window.pendingAdds = new Set();
        if (window.pendingAdds.has(url)) {
            console.log('URL already being added, skipping');
            return;
        }
        window.pendingAdds.add(url);
        
        // Guard against duplicate items
        const adding = new Set();
        if (adding.has(url)) return;
        adding.add(url);

        try {
            // Create optimistic card first
            const tempId = this.addOptimisticCard(url);
            
            // Fetch metadata from worker
            const response = await fetch(`${EXTRACT_ENDPOINT}?url=${encodeURIComponent(url)}`);
            if (!response.ok) throw new Error('Failed to fetch metadata');
            
            const metadata = await response.json();
            
            // Add item to Supabase
            const item = await addItem({
                url: url,
                title: metadata.title || '',
                image: metadata.image || '',
                price: metadata.price || ''
            });
            
            if (item) {
                // Replace optimistic card with real card
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

    // Helper methods for card manipulation
    removeItemCard(id) {
        const card = document.querySelector(`[data-item-id="${id}"]`);
        if (card) {
            card.remove();
        }
    }

    updateItemCard(id, obj) {
        const card = document.querySelector(`[data-item-id="${id}"]`);
        if (card) {
            // Update the card content in-place
            const titleEl = card.querySelector('.card-title');
            const priceEl = card.querySelector('.card-price');
            const domainEl = card.querySelector('.card-domain');
            const imgWrap = card.querySelector('.img-wrap');
            
            if (titleEl) titleEl.textContent = obj.title || '';
            if (priceEl) priceEl.textContent = obj.price || '';
            if (domainEl) domainEl.textContent = obj.domain || '';
            
            // Handle image replacement (skeleton → real image)
            if (obj.image && imgWrap) {
                const skeleton = imgWrap.querySelector('.card-image-skeleton');
                if (skeleton) {
                    // Replace skeleton with real image
                    skeleton.remove();
                    const img = document.createElement('img');
                    img.className = 'card-image';
                    img.alt = obj.title || '';
                    img.referrerPolicy = 'no-referrer';
                    img.dataset.original = obj.originalImage || '';
                    img.onerror = function() {
                        if (this.dataset.fallback !== '1' && this.dataset.original) {
                            this.dataset.fallback = '1';
                            this.src = this.dataset.original;
                        } else {
                            this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjFGNUY5Ii8+CjxwYXRoIGQ9Ik0xMDAgNzBDODguOTU0MyA3MCA4MCA3OC45NTQzIDgwIDkwQzgwIDEwMS4wNDYgODguOTU0MyAxMTAgMTAwIDExMEMxMTEuMDQ2IDExMCAxMjAgMTAxLjA0NiAxMjAgOTBDMTIwIDc4Ljk1NDMgMTExLjA0NiA3MCAxMDAgNzBaIiBmaWxsPSIjQ0JELTQ2NiIvPgo8cGF0aCBkPSJNMTYwIDE2MEg0MEM0MCAxNjAgNDAgMTYwIDQwIDE2MFYxMjBDNDAgMTIwIDQwIDEyMCA0MCAxMjBIMTYwQzE2MCAxMjAgMTYwIDEyMCAxNjAgMTIwVjE2MFoiIGZpbGw9IiNDQkQtNDY2Ii8+Cjwvc3ZnPgo=';
                        }
                    };
                    
                    // Wait for image to load before clearing optimistic state
                    const onReady = () => {
                        // image is rendered; card can be fully interactive
                        card.classList.remove('optimistic');
                        card.style.opacity = '';
                        card.style.pointerEvents = '';
                        img.removeEventListener('load', onReady);
                    };
                    img.addEventListener('load', onReady, { once: true });
                    img.src = this.proxiedImage(obj.image);
                    imgWrap.insertBefore(img, imgWrap.firstChild);
                } else {
                    // Update existing image
                    const imgEl = imgWrap.querySelector('.card-image');
                    if (imgEl) {
                        const onReady = () => {
                            // image is rendered; card can be fully interactive
                            card.classList.remove('optimistic');
                            card.style.opacity = '';
                            card.style.pointerEvents = '';
                            imgEl.removeEventListener('load', onReady);
                        };
                        imgEl.addEventListener('load', onReady, { once: true });
                        imgEl.src = this.proxiedImage(obj.image);
                    }
                }
            } else {
                // No image to wait for; exit optimistic immediately
                card.classList.remove('optimistic');
                card.style.opacity = '';
                card.style.pointerEvents = '';
            }
            
            // Remove optimistic styling and ensure proper data-id
            card.classList.remove('optimistic');
            card.dataset.itemId = obj.id;
            
            // Update the more button data-id as well
            const moreBtn = card.querySelector('.card-more');
            if (moreBtn) {
                moreBtn.dataset.id = obj.id;
            }
            
            return true; // Successfully updated
        }
        return false; // Card not found, need to re-render
    }
}

// App is initialized from index.html
