// Cloudflare Worker：eBird 实时接口的最小代理。作用只有三件事：藏住 API key、加缓存、加 CORS。
// 部署：
//   npm i -g wrangler && wrangler login
//   cd proxy && wrangler secret put EBIRD_KEY   # 粘贴你的 eBird API key
//   wrangler deploy
// 然后把得到的 https://avianspots-proxy.<你的子域>.workers.dev 填到 web/config.js 的 PROXY_BASE。

const EBIRD = 'https://api.ebird.org/v2';
const TTL_SECONDS = 600; // 同一鸟点 10 分钟内只问 eBird 一次

const memory = new Map(); // 进程内缓存；绑定 KV 后下面会自动叠加持久缓存

function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const ok = allowed.includes('*') || (origin && allowed.includes(origin));
  return {
    'access-control-allow-origin': ok ? (allowed.includes('*') ? '*' : origin) : 'null',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
}

function json(body, status, extra = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${TTL_SECONDS}`, ...extra },
  });
}

async function cachedFetch(env, key, url) {
  key = `v0.3.0:raw:${key}`; // invalidate old KV fallback results
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.exp > now) return { body: hit.body, hit: 'memory' };
  if (env.CACHE) {
    const kv = await env.CACHE.get(key);
    if (kv) { memory.set(key, { body: kv, exp: now + TTL_SECONDS * 1000 }); return { body: kv, hit: 'kv' }; }
  }
  const res = await fetch(url, { headers: { 'x-ebirdapitoken': env.EBIRD_KEY, 'accept': 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`eBird ${res.status}: ${text.slice(0, 200)}`), { status: res.status >= 500 ? 502 : res.status });
  }
  const body = await res.text();
  if (memory.size >= 512) memory.delete(memory.keys().next().value);
  memory.set(key, { body, exp: now + TTL_SECONDS * 1000 });
  if (env.CACHE) await env.CACHE.put(key, body, { expirationTtl: TTL_SECONDS });
  return { body, hit: 'miss' };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const headers = cors(env, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, headers);

    const url = new URL(request.url);
    const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);

    try {
      if (parts.length === 1 && parts[0] === 'health') return json({ ok: true, version: '0.3.0', keyConfigured: !!env.EBIRD_KEY }, 200, { ...headers, 'cache-control': 'no-store' });
      if (!env.EBIRD_KEY) return json({ error: 'EBIRD_KEY not configured' }, 500, { ...headers, 'cache-control': 'no-store' });

      // Parent hotspots can legitimately return sub-hotspot records. Preserve the original locId.
      // No region+r retry: changing geographic scope is not a repair for group aggregation.
      if (parts.length === 2 && parts[0] === 'recent' && /^L\d+$/.test(parts[1])) {
        const value = url.searchParams.get('back') || '30';
        if (!/^\d+$/.test(value) || +value < 1 || +value > 30) return json({ error: 'back must be 1..30' }, 400, { ...headers, 'cache-control': 'no-store' });
        const loc = parts[1], back = +value;
        const target = `${EBIRD}/data/obs/${loc}/recent?back=${back}&sppLocale=zh_SIM&includeProvisional=true`;
        const { body, hit } = await cachedFetch(env, `recent:${loc}:${back}`, target);
        return json(body, 200, { ...headers, 'x-cache': hit, 'x-requested-loc-id': loc, 'cache-control': 'no-store' });
      }

      // GET /notable/:regionCode?back=7  → 某地区近 N 天的罕见鸟记录（为后续“稀有鸟讯”预留）
      if (parts[0] === 'notable' && /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(parts[1] || '')) {
        const back = Math.min(30, Math.max(1, parseInt(url.searchParams.get('back') || '7', 10) || 7));
        const target = `${EBIRD}/data/obs/${parts[1]}/recent/notable?back=${back}&sppLocale=zh_SIM&detail=simple`;
        const { body, hit } = await cachedFetch(env, `notable:${parts[1]}:${back}`, target);
        return json(body, 200, { ...headers, 'x-cache': hit });
      }

      return json({ error: 'not found', routes: ['/health', '/recent/:locId?back=1..30', '/notable/:regionCode?back=1..30'] }, 404, headers);
    } catch (e) {
      return json({ error: e.message }, e.status || 502, { ...headers, 'cache-control': 'no-store' });
    }
  },
};
