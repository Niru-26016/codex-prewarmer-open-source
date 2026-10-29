const CACHE = 'prewarmer-static-__BUILD_ID__';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png' /* BUILD_ASSETS */];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('prewarmer-static-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (!SHELL.includes(url.pathname) && !url.pathname.startsWith('/assets/')) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(req);
        if (response.ok) await cache.put(req, response.clone());
        return response;
      } catch {
        const cached = await cache.match(req);
        return cached || new Response('Offline. Reconnect to load this resource.', { status: 503 });
      }
    })(),
  );
});
