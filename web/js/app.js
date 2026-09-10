// 入口：hash 路由 + 六个视图。无构建步骤，直接以 ES Module 运行。
import { CONFIG } from '../config.js?v=0.3.0';
import { SpotView } from './spot-view.js?v=0.3.0';
import { DataSourcesView } from './sources-view.js?v=0.3.0';
import { configureOffline } from './cache-tools.js?v=0.3.0';
import * as D from './data.js?v=0.3.0';
import * as M from './map.js?v=0.3.0';
import { h, icon, header, toast, spinner, emptyState, agoText, activity, fmtKm, fmtDateTime, debounce } from './ui.js?v=0.3.0';

const viewEl = document.getElementById('view');
const tabbar = document.getElementById('tabbar');

// ---------- 公共行渲染 ----------
function hotspotRow(hs, { regionLabel, distanceKm, showList = true } = {}) {
  const act = activity(hs.last);
  const sub = [];
  if (regionLabel) sub.push(regionLabel);
  if (hs.en) sub.push(hs.en);
  sub.push(agoText(hs.last));
  return h('a', { class: 'row', href: `#/spot/${hs.id}` },
    h('span', { class: `dot ${act}`, title: agoText(hs.last) }),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('span', { class: 't' }, hs.name), hs.isGroup ? h('span', { class: 'tag blue' }, '热点组') : null, hs.parentId ? h('span', { class: 'tag' }, '子热点') : null, showList && hs.withList === false ? h('span', { class: 'tag' }, '无名录') : null),
      h('div', { class: 'row-sub' }, sub.join(' · ')),
    ),
    h('div', { class: 'row-right' },
      distanceKm != null ? h('span', null, fmtKm(distanceKm)) : null,
      h('span', { class: 'num' }, hs.n), h('span', { class: 'small' }, '种'),
      icon('chevron'),
    ),
  );
}

function speciesRow(t, { right } = {}) {
  return h('a', { class: 'row sp-row', href: `#/species/${t.code}` },
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, h('span', { class: 't' }, t.zh)),
      h('div', { class: 'row-sub' }, t.en, ' · ', h('span', { class: 'sci' }, t.sci)),
    ),
    h('div', { class: 'row-right' }, right ?? null, icon('chevron')),
  );
}

// 分批渲染长列表：首批 60 行，滚到底部自动续接
 function bigList(items, renderItem, { pageSize = 60, footer } = {}) {
  const ul = h('ul', { class: 'list' });
  let shown = 0;
  const sentinel = h('div', { class: 'list-foot' });
  const more = () => {
    const next = items.slice(shown, shown + pageSize);
    ul.append(...next.map(renderItem));
    shown += next.length;
    sentinel.textContent = shown < items.length ? `已显示 ${shown} / ${items.length}` : (footer ?? (items.length ? `共 ${items.length} 项` : ''));
  };
  more();
  const wrap = h('div', null, ul, sentinel);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && shown < items.length) more(); }, { rootMargin: '400px' });
    io.observe(sentinel);
  } else {
    sentinel.append(h('button', { class: 'morebtn', onClick: more }, '加载更多'));
  }
  return wrap;
}

function searchBox(placeholder, onInput, { autofocus = false, value = '' } = {}) {
  const input = h('input', { type: 'search', placeholder, autocomplete: 'off', enterkeyhint: 'search', value });
  const clear = h('button', { class: 'clear hidden', 'aria-label': '清除', onClick: () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); } }, '✕');
  input.addEventListener('input', debounce(() => { clear.classList.toggle('hidden', !input.value); onInput(input.value.trim()); }, 120));
  if (autofocus) setTimeout(() => input.focus(), 50);
  return h('div', { class: 'searchbox' }, icon('search'), input, clear);
}

const aboutBlock = (generated) => h('div', { class: 'about' },
  'Data provided by ', h('a', { href: 'https://ebird.org', target: '_blank', rel: 'noopener' }, 'eBird (www.ebird.org)'),
  generated ? ` · 快照生成于 ${generated.slice(0, 10)}` : '', ` · v${CONFIG.VERSION}`,
  h('br'), '绿点 7 天内有记录，蓝点 30 天内，灰点更早。“无名录”指本地快照尚未抓取该鸟点的历史鸟种表。',
);

// ---------- 视图：地区列表 ----------
async function RegionsView() {
  const root = h('div', { class: 'view' }, header(CONFIG.APP_NAME, { back: false }), spinner());
  const idx = await D.loadIndex();
  const grid = h('div', { class: 'grid' }, ...idx.regions.map((r) => h('a', { class: 'card', href: `#/region/${r.code}` },
    h('h3', null, r.name),
    h('p', null, h('b', null, r.n), ' 个鸟点', h('br'), h('b', null, r.active30), ' 个近 30 天有记录'),
  )));
  root.replaceChildren(
    header(CONFIG.APP_NAME, { back: false, sub: `${idx.totals.hotspots} 个鸟点 · ${idx.totals.species} 种鸟 · ${idx.regions.length} 个地区` }),
    h('div', { class: 'scroll' }, grid, h('a', { class: 'card data-entry', href: '#/data' }, h('h3', null, '数据来源与本地导入'), h('p', null, '观鸟记录中心 / 个人记录 · CSV / JSON · 仅保存在本机')), aboutBlock(idx.generated)),
  );
  return root;
}

// ---------- 视图：单个地区（地图 + 抽屉列表） ----------
async function RegionView(code) {
  const root = h('div', { class: 'view' }, header('…'), spinner());
  const [region, idx] = await Promise.all([D.loadRegion(code), D.loadIndex()]);
  const meta = idx.regions.find((r) => r.code === code);
  const all = region.hotspots;
  const pos = D.lastPosition();
  if (pos) for (const hs of all) hs.km = D.haversineKm(pos.lat, pos.lng, hs.lat, hs.lng);

  const state = { q: '', filter: 'all', sort: pos ? 'dist' : 'n', selected: null, sheet: 'half' };
  const sheetKey = `bs.sheet`;
  state.sheet = sessionStorage.getItem(sheetKey) || 'half';

  const filtered = () => {
    const nq = D.norm(state.q);
    let list = all.filter((hs) => D.matchHotspot(hs, nq));
    if (state.filter === 'active') list = list.filter((hs) => activity(hs.last) !== 'cold' && activity(hs.last) !== 'none');
    if (state.filter === 'list') list = list.filter((hs) => hs.spp);
    if (state.sort === 'n') list.sort((a, b) => b.n - a.n);
    else if (state.sort === 'last') list.sort((a, b) => (b.last || '').localeCompare(a.last || ''));
    else if (state.sort === 'dist' && pos) list.sort((a, b) => a.km - b.km);
    return list;
  };

  // 地图
  const mapEl = h('div', { class: 'map' });
  const legend = h('div', { class: 'map-legend' },
    h('span', null, h('i', { class: 'dot hot' }), '7 天内'), h('span', null, h('i', { class: 'dot warm' }), '30 天内'), h('span', null, h('i', { class: 'dot cold' }), '更早'),
  );
  const selcard = h('div', { class: 'selcard hidden' });
  const mapWrap = h('div', { class: 'map-wrap' }, mapEl, legend, selcard);
  let map, markers;

  // 抽屉
  const listHost = h('div', { class: 'scroll' });
  const handleLabel = h('span');
  const sheet = h('div', { class: 'sheet', 'data-state': state.sheet });
  const setSheet = (s) => { state.sheet = s; sheet.dataset.state = s; sessionStorage.setItem(sheetKey, s); setTimeout(() => map?.invalidateSize(), 280); };
  const cycle = () => setSheet(state.sheet === 'peek' ? 'half' : state.sheet === 'half' ? 'full' : 'peek');
  const handle = h('button', { class: 'sheet-handle', 'aria-label': '展开或收起列表', onClick: cycle }, handleLabel);
  let touchY = null;
  handle.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  handle.addEventListener('touchend', (e) => {
    if (touchY == null) return;
    const dy = e.changedTouches[0].clientY - touchY; touchY = null;
    if (Math.abs(dy) < 30) return;
    e.preventDefault();
    const order = ['peek', 'half', 'full'];
    const i = order.indexOf(state.sheet);
    setSheet(order[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)))]);
  });
  sheet.append(handle, listHost);

  const showSelected = (hs) => {
    state.selected = hs?.id ?? null;
    if (!hs) { selcard.classList.add('hidden'); return; }
    selcard.replaceChildren(
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, h('span', { class: 't' }, hs.name)),
        h('div', { class: 'row-sub' }, `${hs.n} 种 · ${agoText(hs.last)}${hs.km != null ? ' · ' + fmtKm(hs.km) : ''}`),
      ),
      h('a', { class: 'go', href: `#/spot/${hs.id}` }, '详情'),
    );
    selcard.classList.remove('hidden');
    if (map) M.renderMarkers(map, markers, filtered(), { onSelect: showSelected, selectedId: hs.id });
  };

  const refresh = () => {
    const list = filtered();
    handleLabel.textContent = `${list.length} 个鸟点${state.sort === 'dist' ? ' · 按距离' : state.sort === 'last' ? ' · 按最近记录' : ' · 按鸟种数'}`;
    listHost.replaceChildren(list.length
      ? bigList(list, (hs) => hotspotRow(hs, { distanceKm: hs.km }), { footer: '' })
      : emptyState('没有匹配的鸟点', '换个关键词或去掉筛选'));
    if (map) { M.renderMarkers(map, markers, list, { onSelect: showSelected, selectedId: state.selected }); if (state.q || state.filter !== 'all') M.fitTo(map, list, meta?.bbox); }
  };

  const chip = (label, on, onClick) => h('button', { class: `chip${on ? ' on' : ''}`, onClick }, label);
  const chipsEl = h('div', { class: 'chips' });
  const renderChips = () => chipsEl.replaceChildren(
    chip('全部', state.filter === 'all', () => { state.filter = 'all'; renderChips(); refresh(); }),
    chip('近 30 天有记录', state.filter === 'active', () => { state.filter = state.filter === 'active' ? 'all' : 'active'; renderChips(); refresh(); }),
    chip('有名录', state.filter === 'list', () => { state.filter = state.filter === 'list' ? 'all' : 'list'; renderChips(); refresh(); }),
    h('label', { class: 'chip' }, '排序 ', h('select', { onChange: (e) => { state.sort = e.target.value; refresh(); } },
      h('option', { value: 'n', selected: state.sort === 'n' }, '鸟种数'),
      h('option', { value: 'last', selected: state.sort === 'last' }, '最近记录'),
      pos ? h('option', { value: 'dist', selected: state.sort === 'dist' }, '距离') : null,
    )),
  );
  renderChips();

  root.replaceChildren(
    header(region.name, { sub: `${all.length} 个鸟点 · ${meta?.active30 ?? '-'} 个近 30 天有记录` }),
    searchBox('搜鸟点名，中文或英文均可', (q) => { state.q = q; refresh(); }),
    chipsEl,
    h('div', { class: 'region-body' }, mapWrap, sheet),
  );
  refresh();

  M.loadLeaflet().then(() => {
    if (!root.isConnected) return;
    map = M.createMap(mapEl);
    markers = window.L.layerGroup().addTo(map);
    map.on('click', () => showSelected(null));
    const list = filtered();
    M.renderMarkers(map, markers, list, { onSelect: showSelected });
    M.fitTo(map, list, meta?.bbox);
    // 浏览器定位返回 WGS-84；高德瓦片下需要偏移，这里用最近鸟点的偏移量近似（误差 < 10 m）
    if (pos) window.L.circleMarker(M.usesGcj() ? approxGcj(pos, all) : [pos.lat, pos.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#E56458', fillOpacity: 1 }).addTo(map);
  }).catch((e) => {
    mapWrap.append(h('div', { class: 'map-fallback' }, `地图未能加载（${e.message}）。列表仍可使用，有网络时下拉刷新重试。`));
  });
  return root;
}

function approxGcj(pos, hotspots) {
  let best = null, bestD = Infinity;
  for (const hs of hotspots) {
    if (hs.glat == null) continue;
    const d = Math.abs(hs.lat - pos.lat) + Math.abs(hs.lng - pos.lng);
    if (d < bestD) { bestD = d; best = hs; }
  }
  return best ? [pos.lat + (best.glat - best.lat), pos.lng + (best.glng - best.lng)] : [pos.lat, pos.lng];
}

// ---------- 视图：找鸟（鸟种搜索） ----------
async function SpeciesSearchView() {
  const root = h('div', { class: 'view' }, header('找鸟', { back: false }), spinner());
  const tax = await D.loadTaxonomy();
  const nSpecies = tax.list.filter((t) => t.cat === 'species').length;
  const host = h('div', { class: 'scroll' }, h('div', { class: 'about' }, `输入中文名、英文名或学名，查哪些鸟点记录过这种鸟。本地快照共 ${nSpecies} 种。`));
  const onInput = (q) => {
    if (!q) { host.replaceChildren(h('div', { class: 'about' }, `输入中文名、英文名或学名。本地快照共 ${nSpecies} 种。`)); return; }
    const res = D.searchSpecies(tax, q);
    host.replaceChildren(res.length ? h('ul', { class: 'list' }, ...res.map((t) => speciesRow(t))) : emptyState('没有匹配的鸟种', '只能搜到已抓取名录中出现过的鸟种'));
  };
  root.replaceChildren(header('找鸟', { back: false }), searchBox('鸟种名，如 蓝喉歌鸲 / Bluethroat', onInput, { autofocus: true }), host);
  return root;
}

// ---------- 视图：某鸟种的鸟点 ----------
async function SpeciesView(code) {
  const root = h('div', { class: 'view' }, header('…'), spinner());
  const [tax, spIndex, { byId }, idx] = await Promise.all([D.loadTaxonomy(), D.loadSpeciesIndex(), D.loadHotspots(), D.loadIndex()]);
  const t = tax.byCode.get(code);
  if (!t) { root.replaceChildren(header('未找到'), emptyState('本地快照里没有这个鸟种', code)); return root; }
  const regionNames = new Map(idx.regions.map((r) => [r.code, r.name]));
  const pos = D.lastPosition();
  const spots = (spIndex[code] || []).map((id) => byId.get(id)).filter(Boolean);
  for (const hs of spots) hs.km = pos ? D.haversineKm(pos.lat, pos.lng, hs.lat, hs.lng) : null;
  const state = { region: 'all', sort: pos ? 'dist' : 'n' };
  const regionsHere = [...new Set(spots.map((s) => s.region))];
  const listHost = h('div');
  const chipsEl = h('div', { class: 'chips' });
  const chip = (label, on, onClick) => h('button', { class: `chip${on ? ' on' : ''}`, onClick }, label);
  const draw = () => {
    let list = state.region === 'all' ? spots : spots.filter((s) => s.region === state.region);
    list = [...list].sort(state.sort === 'dist' ? (a, b) => a.km - b.km : state.sort === 'last' ? (a, b) => (b.last || '').localeCompare(a.last || '') : (a, b) => b.n - a.n);
    chipsEl.replaceChildren(
      chip(`全部 ${spots.length}`, state.region === 'all', () => { state.region = 'all'; draw(); }),
      ...regionsHere.map((r) => chip(`${regionNames.get(r) || r} ${spots.filter((s) => s.region === r).length}`, state.region === r, () => { state.region = r; draw(); })),
      h('label', { class: 'chip' }, '排序 ', h('select', { onChange: (e) => { state.sort = e.target.value; draw(); } },
        h('option', { value: 'n', selected: state.sort === 'n' }, '鸟种数'),
        h('option', { value: 'last', selected: state.sort === 'last' }, '鸟点最近记录'),
        pos ? h('option', { value: 'dist', selected: state.sort === 'dist' }, '距离') : null,
      )),
    );
    listHost.replaceChildren(list.length
      ? bigList(list, (hs) => hotspotRow(hs, { regionLabel: regionNames.get(hs.region), distanceKm: hs.km ?? undefined, showList: false }))
      : emptyState('已抓取的名录中没有这种鸟的鸟点'));
  };
  draw();
  root.replaceChildren(
    header(t.zh, { sub: `${t.en} · ${t.sci}` }),
    h('div', { class: 'scroll' },
      h('div', { class: 'hero' }, h('h2', null, t.zh), h('p', { class: 'en' }, t.en, ' · ', h('i', null, t.sci), ' · ', t.famZh)),
      h('div', { class: 'notice info' }, `下面是历史名录中包含该种的鸟点（仅统计已抓取名录的 ${idx.totals.withList} 个鸟点）。历史有记录不代表现在能看到，点开鸟点查“近 30 天”。`),
      chipsEl, listHost,
    ),
  );
  return root;
}

// ---------- 视图：附近 ----------
async function NearbyView() {
  const root = h('div', { class: 'view' }, header('附近', { back: false }));
  const host = h('div', { class: 'scroll' });
  const locateBtn = h('button', { class: 'btn primary', onClick: () => locate(true) }, icon('locate'), '获取我的位置');
  const intro = h('div', null,
    h('div', { class: 'about' }, `按直线距离列出 ${CONFIG.NEARBY_KM} km 内最近的 ${CONFIG.NEARBY_LIMIT} 个鸟点。位置只在本机计算，不上传。已识别的热点组概览不作为附近导航点。`),
    h('div', { class: 'actions' }, locateBtn),
  );
  const locate = async (force) => {
    let pos = force ? null : D.lastPosition();
    if (!pos) {
      host.replaceChildren(spinner('定位中…'));
      try { pos = await D.getPosition(); } catch (e) { host.replaceChildren(intro, h('div', { class: 'notice' }, e.message)); return; }
    }
    const [{ list }, idx] = await Promise.all([D.loadHotspots(), D.loadIndex()]);
    const regionNames = new Map(idx.regions.map((r) => [r.code, r.name]));
    const near = list.filter((hs) => !hs.isGroup).map((hs) => ({ ...hs, km: D.haversineKm(pos.lat, pos.lng, hs.lat, hs.lng) }))
      .filter((hs) => hs.km <= CONFIG.NEARBY_KM).sort((a, b) => a.km - b.km).slice(0, CONFIG.NEARBY_LIMIT);
    host.replaceChildren(
      h('div', { class: 'chips' }, h('button', { class: 'chip', onClick: () => locate(true) }, '重新定位'), h('span', { class: 'chip on' }, `${near.length} 个鸟点 · ${CONFIG.NEARBY_KM} km 内`)),
      near.length ? h('ul', { class: 'list' }, ...near.map((hs) => hotspotRow(hs, { regionLabel: regionNames.get(hs.region), distanceKm: hs.km })))
        : emptyState('附近没有快照里的鸟点', '快照目前只包含部分省份，可以用 ebird_probe.py 补拓'),
    );
  };
  root.append(host);
  if (D.lastPosition()) locate(false); else host.replaceChildren(intro);
  return root;
}

// ---------- 视图：收藏 ----------
async function FavView() {
  const root = h('div', { class: 'view' }, header('收藏', { back: false }));
  const ids = D.favs.all();
  if (!ids.length) { root.append(emptyState('还没有收藏', '在鸟点详情页点右上角的星星')); return root; }
  const [{ byId }, idx] = await Promise.all([D.loadHotspots(), D.loadIndex()]);
  const regionNames = new Map(idx.regions.map((r) => [r.code, r.name]));
  const pos = D.lastPosition();
  const rows = ids.map((id) => byId.get(id)).filter(Boolean).map((hs) => hotspotRow(hs, { regionLabel: regionNames.get(hs.region), distanceKm: pos ? D.haversineKm(pos.lat, pos.lng, hs.lat, hs.lng) : undefined, showList: false }));
  root.append(h('div', { class: 'scroll' }, h('ul', { class: 'list' }, ...rows)));
  return root;
}

// ---------- 路由 ----------
const routes = [
  [/^#\/regions$/, RegionsView, 'regions'],
  [/^#\/data$/, DataSourcesView, null],
  [/^#\/region\/([A-Z]{2}(?:-\d{2})?)$/, RegionView, 'regions'],
  [/^#\/spot\/(L\d+)(?:\?tab=(recent|list))?$/, SpotView, null],
  [/^#\/species$/, SpeciesSearchView, 'species'],
  [/^#\/species\/([a-z0-9]+)$/, SpeciesView, 'species'],
  [/^#\/nearby$/, NearbyView, 'nearby'],
  [/^#\/fav$/, FavView, 'fav'],
];
let renderToken = 0;
async function render() {
  const hash = location.hash || '#/regions';
  const found = routes.map((r) => [r, hash.match(r[0])]).find((x) => x[1]);
  if (!found) { location.hash = '#/regions'; return; }
  const [[, View, tab], m] = found;
  const token = ++renderToken;
  for (const a of tabbar.querySelectorAll('a')) a.classList.toggle('active', a.dataset.tab === tab);
  viewEl.replaceChildren(spinner());
  try {
    const el = await View(...m.slice(1));
    if (token === renderToken) viewEl.replaceChildren(el);
  } catch (e) {
    console.error(e);
    if (token === renderToken) viewEl.replaceChildren(header('出错了'), h('div', { class: 'notice' }, e.message), h('div', { class: 'actions' }, h('button', { class: 'btn', onClick: render }, '重试')));
  }
}
window.addEventListener('hashchange', render);
render();

// ---------- PWA ----------
configureOffline(() => toast('新版本已就绪', { action: '刷新', onAction: () => location.reload(), sticky: true })).catch(() => {});
// iOS Safari 不会提示安装，给一次性提示
 const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
if (isIOS && !localStorage.getItem('bs.iosHint')) {
  setTimeout(() => { toast('在 Safari 点“分享”，再选“添加到主屏幕”即可安装为 App', { action: '知道了', onAction: () => localStorage.setItem('bs.iosHint', '1'), sticky: true }); }, 4000);
}
