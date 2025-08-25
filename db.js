// Database operations using idb helper
class WantDB {
    constructor() {
        this.dbName = 'want-db';
        this.version = 1;
        this.storeName = 'items';
    }

    async init() {
        this.db = await idb.openDB(this.dbName, this.version, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('items')) {
                    const store = db.createObjectStore('items', { keyPath: 'id' });
                    store.createIndex('url', 'url', { unique: true });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            }
        });
    }

    async addItem(item) {
        console.log('Database addItem called with:', item);
        if (!this.db) await this.init();
        
        // Normalize URL (strip hash, maybe prune tracking params)
        const normalizedUrl = this.normalizeUrl(item.url);
        
        // Check if item with same normalized URL exists
        const existingItem = await this.getItemByUrl(normalizedUrl);
        if (existingItem) {
            console.log('Item with URL already exists, updating:', normalizedUrl);
            const updatedItem = { 
                ...existingItem, 
                title: item.title,
                price: item.price || '',
                image: item.image || '',
                createdAt: Date.now() // Refresh timestamp
            };
            await this.db.put(this.storeName, updatedItem);
            console.log('Item updated in database successfully');
            return updatedItem;
        }
        
        const newItem = {
            id: item.id || crypto.randomUUID(),     // <-- reuse existing id
            url: normalizedUrl,
            title: item.title,
            price: item.price || '',
            image: item.image || '',
            domain: item.domain || this.extractDomain(normalizedUrl),
            createdAt: Date.now()
        };

        console.log('New item to add:', newItem);

        try {
            await this.db.add(this.storeName, newItem);
            console.log('Item added to database successfully');
            return newItem;
        } catch (error) {
            console.error('Database error:', error);
            throw error;
        }
    }

    async getAllItems() {
        if (!this.db) await this.init();
        
        const items = await this.db.getAll(this.storeName);
        return items.sort((a, b) => b.createdAt - a.createdAt); // Newest first
    }

    async getItemByUrl(url) {
        if (!this.db) await this.init();
        
        try {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('url');
            const result = await index.get(url);
            return result;
        } catch (error) {
            console.error('Error getting item by URL:', error);
            return null;
        }
    }

    async getItemById(id) {
        if (!this.db) await this.init();
        
        return await this.db.get(this.storeName, id);
    }

    async itemExists(url) {
        if (!this.db) await this.init();
        
        try {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('url');
            const result = await index.get(url);
            return !!result;
        } catch (error) {
            console.error('Error checking if item exists:', error);
            return false;
        }
    }

    async deleteItem(id) {
        if (!this.db) await this.init();
        
        await this.db.delete(this.storeName, id);
    }

    async clearAll() {
        if (!this.db) await this.init();
        
        await this.db.clear(this.storeName);
    }

    async exportData() {
        if (!this.db) await this.init();
        
        const items = await this.getAllItems();
        const data = {
            version: 1,
            exportedAt: new Date().toISOString(),
            items: items
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `want-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async importData(jsonData) {
        if (!this.db) await this.init();
        
        try {
            const data = JSON.parse(jsonData);
            const items = data.items || [];
            
            let imported = 0;
            let updated = 0;
            
            for (const item of items) {
                try {
                    // Ensure item has required fields
                    const importItem = {
                        url: item.url,
                        title: item.title || '',
                        price: item.price || '',
                        image: item.image || '',
                        domain: item.domain || this.extractDomain(item.url),
                        createdAt: item.createdAt || Date.now()
                    };
                    
                    // Try to add, if fails due to duplicate, update
                    try {
                        await this.db.add(this.storeName, {
                            ...importItem,
                            id: crypto.randomUUID()
                        });
                        imported++;
                    } catch (error) {
                        if (error.name === 'ConstraintError') {
                            // Update existing item
                            const existingItem = await this.getItemByUrl(item.url);
                            const updatedItem = { 
                                ...existingItem, 
                                title: importItem.title,
                                price: importItem.price,
                                image: importItem.image,
                                createdAt: Date.now()
                            };
                            await this.db.put(this.storeName, updatedItem);
                            updated++;
                        } else {
                            throw error;
                        }
                    }
                } catch (error) {
                    console.error('Error importing item:', item, error);
                }
            }
            
            return { imported, updated };
        } catch (error) {
            throw new Error('Invalid JSON data');
        }
    }

    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return 'unknown';
        }
    }

    normalizeUrl(url) {
        try {
            const u = new URL(url);
            u.hash = ''; // strip fragment
            // Optionally strip common tracking parameters
            const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
            trackingParams.forEach(param => u.searchParams.delete(param));
            return u.toString();
        } catch {
            return url; // return original if URL parsing fails
        }
    }
}

// Export for use in other modules
window.WantDB = WantDB;
