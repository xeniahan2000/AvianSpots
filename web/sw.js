// Versioned application shell; navigation/config network-first, data stale-while-revalidate.
// No cross-app cache deletion and no caching of proxy requests or imported records.
const VERSION = '0.3.0';
const ROOT = new URL('./', self.location.href);
const PREFIX = `avianspots:${encodeURIComponent(ROOT.pathname)}:`;
const SHELL_CACHE = `${PREFIX}shell:${VERSION}`, DATA_CACHE = `${PREFIX}data:${VERSION}`;
const DEV = ROOT.protocol !== 'https:';
const v = (path) => new URL(`${path}?v=${VERSION}`, ROOT).href;
const SHELL = [new URL('index.html', ROOT).href, new URL('manifest.webmanifest', ROOT).href,
  ...['config.js', 'css/app.css', 'js/app.js', 'js/data.js', 'js/map.js', 'js/ui.js', 'js/groups.js', 'js/imports.js', 'js/spot-view.js', 'js/sources-view.js', 'js/cache-tools.js'].map(v),
  ...['icons/icon-192.png', 'icons/icon-512.png', 'data/index.json', 'data/hotspots.json', 'data/taxonomy.json', 'data/hotspot-groups.json'].map((s) => new URL(s, ROOT).href)];
self.addEventListener('install', (event) => event.waitUntil((async () => {
  if (!DEV) { const cache = await caches.open(SHELL_CACHE); await cache.addAll(SHELL); }
  await self.skipWaiting();
})()));
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith(PREFIX) && (DEV || ![SHELL_CACHE, DATA_CACHE].includes(name))) await caches.delete(name);
  if (DEV) { await self.registration.unregister(); return; }
  await self.clients.claim();
})()));
const failure = () => new Response('Offline and not cached', { status: 503, headers: { 'content-type': 'text/plain;charset=utf-8' } });
async function cachedMatch(req, cache) {
  return (await cache.match(req)) || (await (await caches.open(SHELL_CACHE)).match(req));
}
async function networkFirst(req, cacheName, navigation = false) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req, { cache: 'no-cache', signal: AbortSignal.timeout(5000) });
    if (res.ok) { await cache.put(req, res.clone()); return res; }
    const old = await cachedMatch(req, cache); if (old) return old;
    return res;
  } catch {
    return (await cachedMatch(req, cache)) || (navigation ? await cache.match(new URL('index.html', ROOT).href) : null) || failure();
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE), hit = await cache.match(req);
  if (hit) return hit;
  try { const res = await fetch(req); if (res.ok) await cache.put(req, res.clone()); return res; } catch { return failure(); }
}
function staleWhileRevalidate(event, req) {
  const fresh = (async () => {
    try { const res = await fetch(req); if (res.ok) await (await caches.open(DATA_CACHE)).put(req, res.clone()); return res; } catch { return null; }
  })();
  event.waitUntil(fresh);
  return (async () => (await cachedMatch(req, await caches.open(DATA_CACHE))) || await fresh || failure())();
}
self.addEventListener('fetch', (event) => {
  if (DEV || event.request.method !== 'GET') return;
  const req = event.request, url = new URL(req.url);
  if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  const path = url.pathname.slice(ROOT.pathname.length);
  if (path.startsWith('api/') || url.pathname.startsWith('/api/') || path === 'sw.js' || path === 'reset.html') return;
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req, SHELL_CACHE, true)); return; }
  if (path === 'config.js') { event.respondWith(networkFirst(req, SHELL_CACHE)); return; }
  if (path.startsWith('data/') && path.endsWith('.json')) { event.respondWith(staleWhileRevalidate(event, req)); return; }
  if (/^(?:js|css|icons)\//.test(path) || path === 'manifest.webmanifest') event.respondWith(cacheFirst(req));
});
