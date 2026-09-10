// 数据层：静态 JSON 加载（带内存缓存）、索引、定位、收藏。
import { CONFIG } from '../config.js?v=0.3.0';
import { makeGroupIndex, contextFor } from './groups.js?v=0.3.0';

const memo = new Map();
async function getJSON(path) {
  if (memo.has(path)) return memo.get(path);
  const p = fetch(path).then((r) => {
    if (!r.ok) throw new Error(`加载失败 ${path} (${r.status})`);
    return r.json();
  });
  memo.set(path, p);
  try { return await p; } catch (e) { memo.delete(path); throw e; }
}

export const loadIndex = () => getJSON('data/index.json');
let groupsPromise;
export function loadGroups() {
  if (!groupsPromise) groupsPromise = getJSON('data/hotspot-groups.json').then(makeGroupIndex).catch((error) => {
    groupsPromise = null;
    return { ...makeGroupIndex(), available: false, error: error.message };
  });
  return groupsPromise;
}
function withGroup(hs, index) {
  const ctx = contextFor(hs.id, index);
  return { ...hs, isGroup: ctx.role === 'group', parentId: ctx.parentId, groupChildCount: ctx.role === 'group' ? ctx.group.children.length : 0 };
}
export async function loadRegion(code) {
  const [region, groups] = await Promise.all([getJSON(`data/regions/${code}.json`), loadGroups()]);
  return { ...region, hotspots: region.hotspots.map((hs) => withGroup(hs, groups)) };
}

// taxonomy.json 行：[code, zh, en, sci, order, family, category]
let taxonomyCache;
export async function loadTaxonomy() {
  if (taxonomyCache) return taxonomyCache;
  const rows = await getJSON('data/taxonomy.json');
  const byCode = new Map();
  const list = rows.map(([code, zh, en, sci, order, family, cat, famZh]) => {
    const t = { code, zh, en, sci, order, family, cat, famZh: famZh || family, zhMain: zh.split(' (')[0] };
    byCode.set(code, t);
    return t;
  });
  taxonomyCache = { list, byCode };
  return taxonomyCache;
}

// hotspots.json：{ locId: [region, zh, en, n, last, lat, lng, withList] }
let hotspotsCache;
export async function loadHotspots() {
  if (hotspotsCache) return hotspotsCache;
  const [raw, groups] = await Promise.all([getJSON('data/hotspots.json'), loadGroups()]);
  const byId = new Map();
  const list = [];
  for (const [id, [region, name, en, n, last, lat, lng, withList]] of Object.entries(raw)) {
    const hs = withGroup({ id, region, name, en, n, last, lat, lng, withList: !!withList }, groups);
    byId.set(id, hs);
    list.push(hs);
  }
  hotspotsCache = { list, byId };
  return hotspotsCache;
}

export const loadSpeciesIndex = () => getJSON('data/species-index.json');

export async function regionName(code) {
  const idx = await loadIndex();
  return idx.regions.find((r) => r.code === code)?.name || code;
}

// ---------- 搜索 ----------
export const norm = (s) => (s || '').toLowerCase().replace(/[\s\-'’().（）]/g, '');

export function searchSpecies(taxonomy, q, limit = 40) {
  const nq = norm(q);
  if (!nq) return [];
  const scored = [];
  for (const t of taxonomy.list) {
    if (t.cat !== 'species') continue;
    const zh = norm(t.zh), en = norm(t.en), sci = norm(t.sci);
    let score = 0;
    if (zh.startsWith(nq) || norm(t.zhMain) === nq) score = 3;
    else if (zh.includes(nq)) score = 2;
    else if (en.startsWith(nq) || sci.startsWith(nq)) score = 2;
    else if (en.includes(nq) || sci.includes(nq)) score = 1;
    if (score) scored.push([score, t]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].order - b[1].order);
  return scored.slice(0, limit).map((x) => x[1]);
}

export function matchHotspot(hs, nq) {
  return !nq || norm(hs.name).includes(nq) || norm(hs.en).includes(nq) || hs.id.toLowerCase() === nq;
}

// ---------- 定位 ----------
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function lastPosition() {
  try { return JSON.parse(sessionStorage.getItem('bs.pos') || 'null'); } catch { return null; }
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('浏览器不支持定位'));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() };
        sessionStorage.setItem('bs.pos', JSON.stringify(pos));
        resolve(pos);
      },
      (err) => reject(new Error(err.code === 1 ? '定位权限被拒绝，请在浏览器设置中允许' : '定位失败，请稍后重试')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}

// ---------- 收藏 ----------
const FAV_KEY = 'bs.fav';
export const favs = {
  all() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } },
  has(id) { return this.all().includes(id); },
  toggle(id) {
    const list = this.all();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.unshift(id);
    localStorage.setItem(FAV_KEY, JSON.stringify(list));
    return i < 0;
  },
};

// ---------- 代理（近 30 天记录） ----------
export async function fetchRecent(locId, back = 30, { force = false } = {}) {
  if (!CONFIG.PROXY_BASE) throw new Error('NO_PROXY');
  if (!/^L\d+$/.test(locId)) throw new Error('鸟点编号无效');
  const key = `bs.recent.v0.3.0.${locId}.${back}`; // do not reuse v0.2.0 fallback results
  try {
    const c = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!force && c && Date.now() - c.t < 10 * 60 * 1000 && Array.isArray(c.data)) return c.data;
  } catch { /* storage can be unavailable in private mode */ }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch(`${CONFIG.PROXY_BASE.replace(/\/$/, '')}/recent/${locId}?back=${back}`, { signal: controller.signal, cache: 'no-store' });
    if (!r.ok) {
      let message = `代理返回 ${r.status}`;
      try { const body = await r.json(); if (body.error) message += `：${body.error}`; } catch { /* not JSON */ }
      throw new Error(message);
    }
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error('代理数据格式不符，预期为记录数组');
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch { /* quota */ }
    return data;
  } catch (e) { if (e.name === 'AbortError') throw new Error('获取记录超时，请稍后重试'); throw e; }
  finally { clearTimeout(timer); }
}
