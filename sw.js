// Service Worker for PWA Caching and Offline Support

const CACHE_NAME = 'money-manager-v1'; // Cache version identifier
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css', // Make sure your main CSS file is referenced here if it's external
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    // Add any other essential assets like fonts or images here
];

// --- INSTALL EVENT ---
// Called when the service worker is first registered
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                // Add all app resources to cache
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                // Skip waiting phase and activate immediately
                return self.skipWaiting();
            })
    );
});

// --- FETCH EVENT ---
// Called whenever the app requests a resource (from network or cache)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // If resource is in cache, return it
                if (response) {
                    return response;
                }

                // If not in cache, try to fetch from network
                return fetch(event.request).then(
                    response => {
                        // Check if the response is valid
                        if (!response || response.status !== 200 || response.type === 'opaque') {
                            return response;
                        }

                        // Clone the response to store in cache and return the original to the browser
                        const responseClone = response.clone();

                        // Store the fetched resource in cache
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseClone);
                            });

                        return response; // Return the original response to the browser
                    }
                );
            })
            .catch(error => {
                // Handle network errors (e.g., return offline page)
                console.error('Fetch error:', error);
                // If it's a navigation request (like loading a new page) and the device is offline
                if (event.request.mode === 'navigate' && !navigator.onLine) {
                    // Try to return a custom offline page if available
                    return caches.match('/offline.html'); // Make sure you create an offline.html file
                }
                // For other errors, return a simple fallback response
                return new Response('<h1>Network Error</h1><p>Could not fetch the requested resource.</p>', {
                    status: 500,
                    headers: { 'Content-Type': 'text/html' }
                });
            })
    );
});

// --- ACTIVATE EVENT ---
// Called when the service worker becomes active
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME]; // Define the caches to keep

    event.waitUntil(
        caches.keys().then(cacheNames => {
            // Iterate over all existing caches
            return Promise.all(
                cacheNames.map(cacheName => {
                    // If a cache name is not in the whitelist, delete it
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => {
            // Make the service worker available to all clients immediately
            return self.clients.claim();
        })
    );
});
