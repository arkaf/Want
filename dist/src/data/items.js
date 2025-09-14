import { EXTRACT_ENDPOINT, PARSE_ENDPOINT } from '../config.js';
import { normalizeUrl, displayDomain } from '../utils/url.js';

export class ItemManager {
    constructor(db) {
        this.db = db;
        this.isAdding = false;
    }

    async fetchMeta(url) {
        try {
            const res = await fetch(`${PARSE_ENDPOINT}?url=${encodeURIComponent(url)}&cb=${Date.now()}`, {
                mode: 'cors',
                credentials: 'omit',
                redirect: 'follow',
                headers: { 'Accept': 'application/json' },
            });
            if (!res.ok) throw new Error(`parse ${res.status}`);
            const data = await res.json();
            
            // The Worker returns normalized data, so we can use it directly
            return {
                title: data.title || '',
                image: data.image || '',
                price: data.price || '',
                domain: data.domain || ''
            };
        } catch (error) {
            console.log('Parse fetch failed:', error.message);
            // Fallback to client-side parsing
            return await this.fallbackExtractMeta(url);
        }
    }

    async fallbackExtractMeta(url) {
        try {
            // Try to fetch the actual webpage and extract metadata
            const response = await fetch(url, {
                mode: 'cors',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-GB,en;q=0.9',
                    'Sec-Fetch-Mode': 'navigate'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const html = await response.text();
            const urlObj = new URL(response.url); // Use final URL after redirects
            const host = urlObj.hostname.replace(/^www\./, '');
            
            // Extract OpenGraph and meta tags
            const title = this.extractMetaTag(html, 'og:title') || 
                         this.extractMetaTag(html, 'twitter:title') ||
                         this.extractTitle(html) ||
                         this.extractFromUrl(urlObj);
            
            const image = this.extractMetaTag(html, 'og:image') ||
                         this.extractMetaTag(html, 'twitter:image') ||
                         this.extractImageFromHtml(html, urlObj.origin);
            
            const price = this.extractMetaTag(html, 'product:price:amount') ||
                         this.extractMetaTag(html, 'price') ||
                         this.extractPriceFromHtml(html);
            
            return {
                title: title || host,
                image: image || `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
                price: price || '',
                domain: host
            };
        } catch (error) {
            console.log('Fallback extraction failed:', error);
            // Last resort: extract from URL with better parsing
            return this.extractFromUrl(new URL(url));
        }
    }

    extractMetaTag(html, property) {
        const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
        const match = html.match(regex);
        return match ? match[1].trim() : null;
    }

    extractTitle(html) {
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match ? match[1].trim() : null;
    }

    extractImageFromHtml(html, baseUrl) {
        // Look for common image patterns
        const patterns = [
            /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif))["'][^>]*>/gi,
            /<img[^>]+src=["']([^"']+product[^"']*\.(?:jpg|jpeg|png|webp|gif))["'][^>]*>/gi,
            /<img[^>]+src=["']([^"']+image[^"']*\.(?:jpg|jpeg|png|webp|gif))["'][^>]*>/gi
        ];
        
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                const imageUrl = match[1];
                // Convert relative URLs to absolute
                try {
                    return new URL(imageUrl, baseUrl).toString();
                } catch {
                    return imageUrl;
                }
            }
        }
        return null;
    }

    extractPriceFromHtml(html) {
        // Look for price patterns
        const pricePatterns = [
            /[\$£€¥]\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
            /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*[\$£€¥]/g,
            /price[^>]*>[\$£€¥]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi
        ];
        
        for (const pattern of pricePatterns) {
            const match = html.match(pattern);
            if (match) {
                return match[1];
            }
        }
        return null;
    }

    extractFromUrl(urlObj) {
        const host = urlObj.hostname.replace(/^www\./, '');
        
        // Try to extract title from URL path
        let title = host;
        const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
        if (pathParts.length > 0) {
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart && lastPart !== 'index.html' && lastPart !== 'index') {
                title = lastPart.replace(/[-_]/g, ' ').replace(/\.[^/.]+$/, '');
            }
        }
        
        return {
            title: title,
            image: `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
            price: '',
            domain: host
        };
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
            
            const item = {
                id: crypto.randomUUID(),
                url,
                title: meta.title?.trim() || displayDomain(url),
                image: meta.image || '', // Worker already handles image proxying
                price: meta.price || '',
                domain: meta.domain || displayDomain(url),
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

    async upsertFromMetaOrFetch(payload) {
        // If server already sent good metadata, use it
        if (payload.title || payload.image) {
            const url = payload.url;
            const urlObj = new URL(url);
            const host = urlObj.hostname.replace(/^www\./, '');
            
            return {
                id: crypto.randomUUID(),
                url,
                title: payload.title?.trim() || displayDomain(url),
                image: payload.image || '',
                price: payload.price || '',
                domain: payload.domain || host,
                createdAt: Date.now(),
            };
        }
        
        // Otherwise, fetch fresh metadata
        return await this.createItemFromUrl(payload.url);
    }
}
