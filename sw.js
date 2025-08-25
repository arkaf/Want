// Service Worker for Want PWA
const CACHE_NAME = 'want-v58';
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
    if (u.pathname.startsWith('/api/')) {
        event.respondWith(fetch(event.request, { cache: 'no-store' }));
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
            .catch(() => {
                // Return offline page for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.map(n => (n !== CACHE_NAME ? caches.delete(n) : null)));
        await self.clients.claim(); // NEW: take control now
    })());
});
