import { META_ENDPOINT } from '../config.js';
import { normalizeUrl, displayDomain } from '../utils/url.js';

export class ItemManager {
    constructor(db) {
        this.db = db;
        this.isAdding = false;
    }

    async fetchMeta(url) {
        try {
            const res = await fetch(`${META_ENDPOINT}?url=${encodeURIComponent(url)}`, {
                mode: 'cors',
                credentials: 'omit',
                redirect: 'follow',
                headers: { 'Accept': 'application/json' },
            });
            if (!res.ok) throw new Error(`meta ${res.status}`);
            return await res.json();
        } catch (error) {
            console.log('Meta fetch failed:', error.message);
            return { title: '', image: '', price: '' };
        }
    }

    async createItemFromUrl(rawUrl) {
        if (this.isAdding) return null;
        this.isAdding = true;
        
        try {
            const url = normalizeUrl(rawUrl);
            if (!url) throw new Error('Invalid URL');

            // Check if URL already exists
            const exists = await this.db.itemExists(url);
            if (exists) {
                throw new Error('Item already exists');
            }

            const meta = await this.fetchMeta(url);
            
            // Resolve relative image URLs to absolute
            const absoluteImage = meta.image ? this.resolveUrl(url, meta.image) : '';
            
            const item = {
                id: crypto.randomUUID(),
                url,
                title: meta.title?.trim() || displayDomain(url),
                image: absoluteImage,
                price: meta.price || '',
                domain: displayDomain(url),
                createdAt: Date.now(),
            };

            // Save to database
            await this.db.addItem(item);
            return item;
        } finally {
            this.isAdding = false;
        }
    }

    resolveUrl(base, maybeRelative) {
        try {
            return new URL(maybeRelative, base).toString();
        } catch {
            return '';
        }
    }

    async getAllItems() {
        return await this.db.getAllItems();
    }

    async deleteItem(id) {
        await this.db.deleteItem(id);
    }
}
