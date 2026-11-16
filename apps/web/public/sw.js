// Network-first service worker: always try the network (revalidating the
// HTTP cache) so new deploys show up immediately; fall back to the last
// cached copy only when offline. There is no build-time precache list (file
// names change every build); instead the page tells the worker what it used.
const CACHE = 'lineup-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// The page lists what it loaded (plus files only loaded later, like the audio
// worklet) so one visit is enough for the app to start offline: the files
// fetched before this worker took control never passed through the handler below.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'precache' || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter(
    (u) => typeof u === 'string' && new URL(u, self.location.href).origin === self.location.origin,
  );
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)))),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // PR previews live under the live site's scope (/<repo>/pr-preview/pr-N/). The live worker
  // leaves them alone so it never caches or serves a preview's files; a preview's own worker
  // (registered inside pr-preview/) handles them.
  if (
    !self.location.pathname.includes('/pr-preview/') &&
    new URL(req.url).pathname.includes('/pr-preview/')
  )
    return;
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
          .match(req, { ignoreVary: true })
          .then((hit) => hit ?? new Response('Offline', { status: 503, statusText: 'Offline' })),
      ),
  );
});
