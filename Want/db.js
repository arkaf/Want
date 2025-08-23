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
        if (!this.db) await this.init();
        
        const newItem = {
            id: crypto.randomUUID(),
            url: item.url,
            title: item.title,
            price: item.price || '',
            image: item.image || '',
            domain: this.extractDomain(item.url),
            createdAt: Date.now()
        };

        try {
            await this.db.add(this.storeName, newItem);
            return newItem;
        } catch (error) {
            if (error.name === 'ConstraintError') {
                // URL already exists, update the item
                const existingItem = await this.getItemByUrl(item.url);
                const updatedItem = { 
                    ...existingItem, 
                    title: newItem.title,
                    price: newItem.price,
                    image: newItem.image,
                    createdAt: Date.now() // Refresh timestamp
                };
                await this.db.put(this.storeName, updatedItem);
                return updatedItem;
            }
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
        
        const index = this.db.transaction(this.storeName).store.index('url');
        return await index.get(url);
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
}

// Export for use in other modules
window.WantDB = WantDB;
