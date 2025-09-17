// Service Worker for Want PWA
const CACHE_NAME = 'want-v77'; // Static cache name for stable caching
const DATA_CACHE_NAME = 'want-data-v1'; // Separate cache for dynamic data
const urlsToCache = [
    '/',
    '/index.html',
    '/add.html',
    '/styles.css',
    '/app.js',
    '/db.js',
    '/add.js',
    '/manifest.webmanifest',
    '/vendor/idb.min.js'
];

// Install event - cache resources
self.addEventListener('install', event => {
    self.skipWaiting(); // NEW: activate immediately
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
    const u = new URL(event.request.url);
    
    // Bypass cache for Supabase requests
    if (u.hostname.includes('supabase.co')) {
        event.respondWith(fetch(event.request, { cache: 'no-store' }));
        return;
    }
    
    // Bypass cache for add flow and parser
    if (
        u.pathname.startsWith('/add') ||
        u.pathname.startsWith('/extract') ||
        u.pathname.startsWith('/extract') ||   // alias, if still used
        u.hash.startsWith('#add=')
    ) {
        event.respondWith((async () => {
            try {
                return await fetch(event.request, { cache: 'no-store' });
            } catch (e) {
                return new Response('Network error', { status: 502 });
            }
        })());
        return;
    }
    
    if (u.pathname.startsWith('/api/')) {
        event.respondWith(fetch(event.request, { cache: 'no-store' }));
        return;
    }
    
    event.respondWith((async () => {
        try {
            const url = new URL(event.request.url);
            
            // Check if this is a static asset that can be cached
            const isStaticAsset = url.pathname.endsWith('.png') || 
                                 url.pathname.endsWith('.jpg') || 
                                 url.pathname.endsWith('.svg') || 
                                 url.pathname.endsWith('.ico') ||
                                 url.pathname.startsWith('/assets/');
            
            // Check if this is an app file that might need fresh loading
            const isAppFile = url.pathname.endsWith('.js') || 
                             url.pathname.endsWith('.css') || 
                             url.pathname.endsWith('.html');
            
            // Static assets: Cache-first strategy
            if (isStaticAsset) {
                const cache = await caches.open(CACHE_NAME);
                const cached = await cache.match(event.request);
                if (cached) {
                    return cached;
                }
                const fresh = await fetch(event.request);
                cache.put(event.request, fresh.clone());
                return fresh;
            }
            
            // App files: Network-first with smart caching
            if (isAppFile) {
                // Only bypass cache if explicitly requested with cache-busting params
                const hasCacheBusting = url.searchParams.has('v') || 
                                       url.searchParams.has('cb') || 
                                       url.searchParams.has('r');
                
                if (hasCacheBusting) {
                    console.log('SW: Cache-busting requested for:', url.pathname);
                    return await fetch(event.request, { cache: 'no-store' });
                }
                
                // Otherwise use network-first with reasonable caching
                try {
                    const fresh = await fetch(event.request);
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(event.request, fresh.clone());
                    return fresh;
                } catch (networkError) {
                    const cache = await caches.open(CACHE_NAME);
                    const cached = await cache.match(event.request);
                    if (cached) {
                        console.log('SW: Using cached fallback for:', url.pathname);
                        return cached;
                    }
                    throw networkError;
                }
            }
            
            // Everything else: Network-first
            try {
                const fresh = await fetch(event.request);
                return fresh;
            } catch (networkError) {
                const cache = await caches.open(CACHE_NAME);
                const cached = await cache.match(event.request);
                if (cached) return cached;
                throw networkError;
            }
        } catch (e) {
            console.error('SW: Request failed:', e);
            if (event.request.mode === 'navigate') {
                const offlinePage = await caches.match('/index.html');
                if (offlinePage) return offlinePage;
            }
            return new Response('Offline', { status: 503 });
        }
    })());
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        const validCaches = [CACHE_NAME, DATA_CACHE_NAME];
        
        await Promise.all(
            names.map(cacheName => {
                if (!validCaches.includes(cacheName)) {
                    console.log('SW: Deleting old cache:', cacheName);
                    return caches.delete(cacheName);
                }
                return null;
            })
        );
        
        await self.clients.claim();
        console.log('SW: Cache cleanup completed');
    })());
});
