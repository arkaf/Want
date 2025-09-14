// Service Worker for Want PWA
const CACHE_NAME = 'want-v74';
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
            // Check for cache-busting parameter
            const url = new URL(event.request.url);
            if (url.searchParams.has('cb')) {
                // Force fresh fetch for cache-busting
                return await fetch(event.request, { cache: 'no-store' });
            }
            
            // Cache-first strategy for static assets
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(event.request);
            if (cached) return cached;
            
            const fresh = await fetch(event.request);
            // Only cache GET requests with supported schemes
            if (event.request.method === 'GET' && event.request.url.startsWith('http')) {
                cache.put(event.request, fresh.clone());
            }
            return fresh;
        } catch (e) {
            // Return offline page for navigation requests
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
        await Promise.all(names.map(n => (n !== CACHE_NAME ? caches.delete(n) : null)));
        await self.clients.claim(); // NEW: take control now
    })());
});
