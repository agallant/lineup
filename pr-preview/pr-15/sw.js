// Network-first service worker: always try the network (revalidating the
// HTTP cache) so new deploys show up immediately; fall back to the last
// cached copy only when offline. Deliberately no precache list: this exists
// for installability and basic offline support, not aggressive caching.
const CACHE = 'strumline-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const noStore = /no-store/i.test(res.headers.get('Cache-Control') ?? '');
        if (res.ok && !noStore) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req)
          .then((hit) => hit ?? new Response('Offline', { status: 503, statusText: 'Offline' })),
      ),
  );
});
