// Cache maintenance is scoped to this app path. Never clear IndexedDB or localStorage here.
export const APP_ROOT = new URL('../', import.meta.url);
export const CACHE_PREFIX = `avianspots:${encodeURIComponent(APP_ROOT.pathname)}:`;
const LEGACY = /^(shell-v0\.[12]\.0|data-v1|vendor-v1)$/;
function belongsToApp(value) {
  const url = new URL(value);
  if (url.origin !== APP_ROOT.origin || !url.pathname.startsWith(APP_ROOT.pathname)) return false;
  const relative = url.pathname.slice(APP_ROOT.pathname.length);
  return /^(?:$|index\.html$|config\.js$|manifest\.webmanifest$|reset\.html$|(?:js|css|data|icons|templates)\/)/.test(relative);
}
export async function clearAppCaches() {
  if (!globalThis.caches) return;
  for (const name of await caches.keys()) {
    if (name.startsWith(CACHE_PREFIX)) { await caches.delete(name); continue; }
    if (!LEGACY.test(name)) continue;
    const cache = await caches.open(name);
    for (const req of await cache.keys()) if (belongsToApp(req.url)) await cache.delete(req);
    if (!(await cache.keys()).length) await caches.delete(name);
  }
}
export async function unregisterAppWorker() {
  if (!navigator.serviceWorker) return;
  for (const reg of await navigator.serviceWorker.getRegistrations()) {
    if (reg.scope === APP_ROOT.href) await reg.unregister();
  }
}
export async function resetAppCache() {
  await unregisterAppWorker();
  await clearAppCaches();
}
export async function configureOffline(onUpdate) {
  if (!navigator.serviceWorker) return;
  if (location.protocol !== 'https:') { await resetAppCache(); return; }
  const reg = await navigator.serviceWorker.register(new URL('sw.js', APP_ROOT), { scope: APP_ROOT.href, updateViaCache: 'none' });
  const observe = (worker) => worker?.addEventListener('statechange', () => {
    if (worker.state === 'activated' && navigator.serviceWorker.controller) onUpdate?.();
  });
  reg.addEventListener('updatefound', () => observe(reg.installing));
  reg.update().catch(() => {});
}
