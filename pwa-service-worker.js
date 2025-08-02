// Service Worker for Money Manager PWA
// Version: 2.0
// Last Updated: 2023-11-15

// Service Worker Version - increment when making updates
const CACHE_VERSION = 'v2.0';
const CACHE_NAME = `money-manager-cache-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';
const FALLBACK_IMAGE = '/images/fallback.png';

// Files to cache for offline use
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  
  // App Shell (Ensure these paths match your project structure)
  '/style.css', // Assuming your main CSS is named style.css
  '/app.js',    // Assuming your main JS is named app.js
  
  // Icons (Ensure these paths are correct)
  '/icons/icon-48x48.png',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  
  // Images (Ensure these paths are correct)
  '/images/logo.png',
  FALLBACK_IMAGE,
  '/images/notification-icon.png',
  '/images/badge.png',
  
  // External Resources (Ensure these are correctly linked and accessible)
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// Install event - cache essential files
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install event');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell');
        // Add all URLs to the cache
        return cache.addAll(PRECACHE_URLS)
          .then(() => {
            console.log('[ServiceWorker] All required resources have been cached');
            // Force the waiting service worker to become the active service worker
            return self.skipWaiting();
          });
      })
      .catch(err => {
        console.error('[ServiceWorker] Cache addAll failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate event');
  
  // Define which caches to keep
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        // Map over all cached names
        cacheNames.map(cacheName => {
          // If the cache name is not in the whitelist, delete it
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      // Enable navigation preload if supported
      console.log('[ServiceWorker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Enhanced Fetch Handler
self.addEventListener('fetch', event => {
  // Skip non-GET requests and chrome-extension requests
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Handle navigation requests for the main app shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // Try to fetch the request first
      fetch(event.request)
        .catch(() => {
          // If fetch fails (e.g., offline), respond with the offline page
          console.log('[ServiceWorker] Network request for navigate failed. Serving offline page.');
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Handle API requests (e.g., fetching data, POST requests)
  // This is a basic example, you might need more sophisticated handling for POST/PUT etc.
  if (event.request.url.includes('/api/') || event.request.url.endsWith('.json')) {
    event.respondWith(
      handleApiRequest(event.request)
    );
    return;
  }

  // Handle requests for static assets (HTML, CSS, JS, Images, Fonts)
  event.respondWith(
    handleStaticRequest(event.request)
  );
});

// API Request Handler (Network first strategy)
async function handleApiRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // Try to fetch from the network first
    const networkResponse = await fetch(request);
    
    // If the network response is successful, cache it
    if (networkResponse && networkResponse.ok) {
      const clone = networkResponse.clone();
      cache.put(request, clone);
      console.log('[ServiceWorker] Cached API response for:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    // If network request fails, try to get from cache
    console.log('[ServiceWorker] Network request failed for API. Trying cache...');
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[ServiceWorker] Serving API response from cache:', request.url);
      return cachedResponse;
    }
    
    // Return a fallback response if nothing is found in cache
    console.warn('[ServiceWorker] No network or cache response for API:', request.url);
    // Return an empty JSON for JSON requests if completely offline
    if (request.url.endsWith('.json')) {
      return new Response('{}', {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generic fallback for other API requests
    return new Response('Service Unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Static Assets Handler (Cache first strategy)
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  // Try to get the response from the cache first
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    console.log('[ServiceWorker] Serving static asset from cache:', request.url);
    return cachedResponse;
  }
  
  try {
    // If not in cache, try to fetch from the network
    console.log('[ServiceWorker] Fetching static asset from network:', request.url);
    const networkResponse = await fetch(request);
    
    // If the network response is successful, cache it
    if (networkResponse && networkResponse.ok) {
      const clone = networkResponse.clone();
      cache.put(request, clone);
      console.log('[ServiceWorker] Cached static asset:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    // Handle errors for specific content types if needed
    console.error('[ServiceWorker] Network request failed for static asset:', request.url, error);
    
    // Special handling for images: return a fallback image
    if (request.headers.get('accept').includes('image')) {
      console.log('[ServiceWorker] Serving fallback image.');
      return caches.match(FALLBACK_IMAGE);
    }
    
    // For HTML requests, return the offline page
    if (request.headers.get('accept').includes('text/html')) {
      console.log('[ServiceWorker] Serving offline page for HTML.');
      return caches.match(OFFLINE_URL);
    }
    
    // Generic fallback for other failed requests
    return new Response('Resource unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Background sync registration (Listen for sync events)
self.addEventListener('sync', event => {
  // Check if the sync tag matches our defined tag
  if (event.tag === 'sync-data') {
    console.log('[ServiceWorker] Background sync triggered for "sync-data"');
    // Wait until the syncData function completes
    event.waitUntil(syncData());
  }
});

// Push notification event listener
self.addEventListener('push', event => {
  console.log('[ServiceWorker] Push notification received');
  
  const title = 'Money Manager';
  let body = 'You have a new notification'; // Default notification body
  
  // Try to parse data from the push event
  if (event.data) {
    try {
      const data = event.data.json(); // Attempt to parse as JSON
      body = data.message || body; // Use message from JSON if available
    } catch (e) {
      body = event.data.text() || body; // Otherwise, use plain text
    }
  }
  
  // Define notification options
  const options = {
    body: body,
    icon: '/images/notification-icon.png', // Path to your notification icon
    badge: '/images/badge.png',       // Path to your badge icon for Android
    data: {
      url: '/' // URL to open when notification is clicked
    }
  };
  
  // Show the notification
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Listener for when a notification is clicked
self.addEventListener('notificationclick', event => {
  console.log('[ServiceWorker] Notification click event');
  event.notification.close(); // Close the notification
  
  // Focus on the client window or open a new one
  event.waitUntil(
    clients.matchAll({ type: 'window' }) // Get all open window clients
      .then(clientList => {
        // Find an existing client that matches the notification URL
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus(); // Focus the existing window
          }
        }
        // If no matching client is found, open a new window
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url || '/');
        }
      })
  );
});

// Periodic sync registration (for background updates)
// Note: Periodic Sync API is experimental and might not be widely supported yet.
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-data') {
    console.log('[ServiceWorker] Periodic sync triggered for "update-data"');
    event.waitUntil(updateCachedData());
  }
});

// Helper function for background sync (example implementation)
async function syncData() {
  console.log('[ServiceWorker] Syncing data in background...');
  
  try {
    // --- Implement your data synchronization logic here ---
    // Example: Fetch pending transactions and send them to the server
    // const pendingTransactions = await getPendingTransactionsFromIndexedDB();
    // await sendTransactionsToServer(pendingTransactions);
    // await clearPendingTransactionsFromIndexedDB();
    
    // Show a notification to inform the user about the sync status
    await self.registration.showNotification('Money Manager', {
      body: 'Data sync completed successfully!',
      icon: '/images/notification-icon.png'
    });
    
    return Promise.resolve(); // Indicate successful sync
  } catch (error) {
    console.error('[ServiceWorker] Sync failed:', error);
    // Optionally show an error notification
    await self.registration.showNotification('Money Manager', {
      body: 'Data sync failed. Please check your connection.',
      icon: '/images/notification-icon.png'
    });
    return Promise.reject(error); // Indicate failed sync
  }
}

// Helper function for updating cached data periodically
async function updateCachedData() {
  console.log('[ServiceWorker] Updating cached data...');
  
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // Iterate over all precached URLs and try to update them
    await Promise.all(
      PRECACHE_URLS.map(async url => {
        try {
          const response = await fetch(url);
          // If the fetch is successful, update the cache
          if (response.ok) {
            await cache.put(url, response);
            console.log(`[ServiceWorker] Updated cache for: ${url}`);
          }
        } catch (error) {
          // Log a warning if updating a specific URL fails, but continue
          console.warn(`[ServiceWorker] Failed to update cache for ${url}:`, error);
        }
      })
    );
    
    console.log('[ServiceWorker] Cache update process completed.');
    return Promise.resolve();
  } catch (error) {
    console.error('[ServiceWorker] An error occurred during cache update:', error);
    return Promise.reject(error);
  }
}

// Listen for message events from the main thread (e.g., from your app.js)
self.addEventListener('message', event => {
  // Handle messages like skipping the waiting phase
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    console.log('[ServiceWorker] Received SKIP_WAITING message.');
  }
  
  // Handle messages to cache new resources dynamically
  if (event.data && event.data.type === 'CACHE_NEW_RESOURCES') {
    console.log('[ServiceWorker] Received message to cache new resources:', event.data.payload);
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(event.data.payload);
      });
  }
  
  // Handle messages to clear the cache
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[ServiceWorker] Received CLEAR_CACHE message.');
    caches.delete(CACHE_NAME)
      .then(() => {
        console.log('[ServiceWorker] Cache cleared successfully.');
      });
  }
});

// Global error handling for the service worker
self.addEventListener('error', event => {
  console.error('[ServiceWorker] Uncaught error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[ServiceWorker] Unhandled promise rejection:', event.reason);
});
