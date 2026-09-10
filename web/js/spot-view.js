import * as D from './data.js?v=0.3.0';
import * as G from './groups.js?v=0.3.0';
import * as I from './imports.js?v=0.3.0';
import { h, icon, header, toast, spinner, emptyState, agoText, fmtDateTime } from './ui.js?v=0.3.0';

function historicalList(codes, tax) {
  const all = codes.map((c) => tax.byCode.get(c)).filter(Boolean).sort((a, b) => a.order - b.order);
  const species = all.filter((t) => t.cat === 'species');
  const input = h('input', { type: 'search', placeholder: '在名录中搜鸟种', 'aria-label': '搜索历史鸟种' });
  const list = h('div');
  const draw = () => {
    const q = D.norm(input.value);
    const shown = species.filter((t) => !q || [t.zh, t.en, t.sci].some((s) => D.norm(s).includes(q)));
    const nodes = []; let family;
    for (const t of shown) {
      if (t.famZh !== family) { family = t.famZh; nodes.push(h('div', { class: 'section-h' }, family)); }
      nodes.push(h('a', { class: 'row sp-row', href: `#/species/${t.code}` },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, h('span', { class: 't' }, t.zh)), h('div', { class: 'row-sub' }, `${t.en} · ${t.sci}`)), icon('chevron')));
    }
    list.replaceChildren(shown.length ? h('div', null, ...nodes, h('div', { class: 'list-foot' }, `共 ${shown.length} 种${all.length > species.length ? `，另有 ${all.length - species.length} 项杂交或未定种未展示` : ''}`)) : emptyState('没有匹配的鸟种'));
  };
  input.addEventListener('input', draw); draw();
  return h('div', null, h('div', { class: 'searchbox' }, icon('search'), input), list);
}

function observationCard(o, { taxonomy, byId, duplicates, requestedId }) {
  const tax = o.speciesCode ? taxonomy.byCode.get(o.speciesCode) : null;
  const name = o.source === 'ebird' ? tax?.zh || o.comName || o.speciesCode : o.comName;
  const place = byId.get(o.locId), label = o.locName || place?.name || o.locId || '原数据未提供地点';
  const sourceLabel = I.SOURCE_LABELS[o.source];
  let placeHref = '';
  if (!o.locationPrivate && /^L\d+$/.test(o.locId || '')) placeHref = place ? `#/spot/${o.locId}?tab=recent` : `https://ebird.org/hotspot/${o.locId}`;
  const children = [
    h('div', { class: 'observation-top' }, tax ? h('a', { class: 'species-link', href: `#/species/${tax.code}` }, name) : h('strong', null, name),
      h('strong', { class: 'num' }, o.howMany == null || o.howMany === 'X' ? '数量未知' : `×${o.howMany}`)),
    h('div', { class: 'observation-meta' }, h('span', { class: `tag ${o.source === 'ebird' ? 'blue' : 'green'}` }, sourceLabel), h('time', null, fmtDateTime(o.obsDt))),
    h('div', { class: 'observation-place' }, h('span', { class: 'muted' }, '记录地点 · '),
      placeHref ? h('a', { href: placeHref, ...(place ? {} : { target: '_blank', rel: 'noopener noreferrer' }) }, label) : label,
      o.placeRelation === 'member' ? h('span', { class: 'tag' }, '组内子热点') : null,
      o.source !== 'ebird' ? h('span', { class: 'tag' }, '用户关联') : null),
    o.sourceLocationId ? h('p', { class: 'small muted' }, `原地点编号 · ${o.sourceLocationId}`) : null,
    o.mapping === 'scientific-name' ? h('p', { class: 'small muted' }, '学名对应到 eBird，分类口径仍需核对') : null,
    o.mapping === 'unmatched' ? h('p', { class: 'small muted' }, '保留原鸟名，尚未关联 eBird 分类') : null,
    o.taxonomyVersion ? h('p', { class: 'small muted' }, `分类版本 · ${o.taxonomyVersion}`) : null,
    duplicates.has(o.id) ? h('p', { class: 'duplicate-hint' }, '可能与另一来源重复，请核对原报告；数量未相加') : null,
    h('div', { class: 'observation-bottom' }, h('span', { class: 'small muted' }, o.recordId ? `报告 ${o.recordId}` : '原数据未提供报告编号'),
      o.url ? h('a', { class: 'text-link', href: o.url, target: '_blank', rel: 'noopener noreferrer' }, '原报告 ↗') : null),
  ];
  return h('article', { class: 'observation-card', 'data-source': o.source, 'data-loc-id': o.locId || '', 'data-report-id': o.recordId || '', 'data-requested-id': requestedId }, ...children);
}

export async function SpotView(id, initialTab) {
  const root = h('div', { class: 'view' }, header('…'), spinner());
  const [{ byId }, groups, taxonomy] = await Promise.all([D.loadHotspots(), D.loadGroups(), D.loadTaxonomy()]);
  const meta = byId.get(id);
  if (!meta) { root.replaceChildren(header('未找到'), emptyState('本地快照里没有这个鸟点', id)); return root; }
  const [region, regionLabel, index] = await Promise.all([D.loadRegion(meta.region), D.regionName(meta.region), D.loadIndex()]);
  const hs = region.hotspots.find((x) => x.id === id) || meta;
  const ctx = G.contextFor(id, groups), isGroup = ctx.role === 'group';
  const parent = ctx.parentId ? byId.get(ctx.parentId) : null;
  const allowedPlaces = G.placeIdsFor(id, groups);
  let tab = initialTab === 'recent' ? 'recent' : 'list', sequence = 0, source = 'all';
  const body = h('div'), tabs = h('div', { class: 'segment' });
  const fav = h('button', { class: `iconbtn${D.favs.has(id) ? ' on' : ''}`, 'aria-label': '收藏', onClick: () => {
    const added = D.favs.toggle(id); fav.classList.toggle('on', added); fav.replaceChildren(icon(added ? 'starFilled' : 'star')); toast(added ? '已收藏' : '已取消收藏');
  } }, icon(D.favs.has(id) ? 'starFilled' : 'star'));
  const members = isGroup ? h('details', { class: 'group-members', id: 'group-members' },
    h('summary', null, `查看 ${ctx.group.children.length} 个子鸟点`),
    ...ctx.group.children.map((childId) => {
      const child = byId.get(childId);
      return h('a', { class: 'row', href: child ? `#/spot/${childId}` : `https://ebird.org/hotspot/${childId}`, ...(child ? {} : { target: '_blank', rel: 'noopener noreferrer' }) },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, h('span', { class: 't' }, child?.name || childId)), h('div', { class: 'row-sub' }, child?.en || childId)), icon('chevron'));
    })) : null;

  const drawTabs = () => tabs.replaceChildren(...[['list', '历史名录'], ['recent', '近 30 天']].map(([key, title]) => h('button', { class: tab === key ? 'on' : '', 'aria-pressed': tab === key ? 'true' : 'false', onClick: () => { tab = key; drawTabs(); renderBody(); } }, title)));

  async function renderBody(force = false) {
    const token = ++sequence;
    if (tab === 'list') {
      body.replaceChildren(
        h('p', { class: 'about compact-about' }, isGroup ? 'eBird 全组历史名录，可能包含各子热点。历史出现不代表现在能看到。' : 'eBird 历史名录。本机导入记录单独保留，不改写这份快照。'),
        hs.spp ? historicalList(hs.spp, taxonomy) : h('div', { class: 'notice' }, `快照尚未包含这个鸟点的完整历史名录。eBird 快照统计 ${hs.n} 种，可查看原页面。`));
      return;
    }
    body.replaceChildren(spinner('正在读取近期记录与本机数据…'));
    let remote = { status: 'pending' }, local = { status: 'pending' };
    const redraw = () => {
    if (token !== sequence || tab !== 'recent') return;
    const remoteRows = remote.status === 'fulfilled' ? remote.value.filter((o) => o && typeof o === 'object').map((o, i) => ({
      ...o, source: 'ebird', recordId: o.subId || '', id: JSON.stringify(['ebird', o.subId || '', o.speciesCode || '', o.locId || '', i]),
      url: /^S\d+$/.test(o.subId || '') ? `https://ebird.org/checklist/${o.subId}` : '',
    })) : [];
    const localRows = local.status === 'fulfilled' ? local.value.filter((r) => allowedPlaces.has(r.ebirdLocId) && I.isRecent(r.observedAt)).map((r) => I.toObservation(r, taxonomy)) : [];
    const partition = G.partitionRecent([...remoteRows, ...localRows], id, groups);
    const all = [...partition.main, ...partition.unconfirmed];
    const duplicates = I.possibleDuplicateIds(all);
    const controls = h('div', { class: 'chips source-chips' }), results = h('div');
    const refresh = h('button', { class: 'chip', onClick: () => renderBody(true) }, '刷新');
    const sort = (a, b) => (b.obsDt || '').localeCompare(a.obsDt || '') || (a.comName || '').localeCompare(b.comName || '');
    const draw = () => {
      const choices = [['all', '全部'], ['ebird', 'eBird'], ['birdreport', '观鸟中心'], ['personal', '个人']];
      controls.replaceChildren(...choices.map(([key, label]) => h('button', { class: `chip${source === key ? ' on' : ''}`, 'aria-pressed': source === key ? 'true' : 'false', onClick: () => { source = key; draw(); } }, `${label}${key === 'all' ? '' : ` ${all.filter((o) => o.source === key).length}`}`)), refresh);
      const filter = (o) => source === 'all' || o.source === source;
      const main = partition.main.filter(filter).sort(sort), pending = partition.unconfirmed.filter(filter).sort(sort);
      const selected = [...main, ...pending];
      const checklistCount = new Set(selected.filter((r) => r.recordId).map((r) => `${r.source}:${r.recordId}`)).size;
      const nodes = [];
      if (remote.status === 'pending' && (source === 'all' || source === 'ebird')) nodes.push(h('p', { class: 'about compact-about' }, 'eBird 记录读取中…'));
      if (local.status === 'pending' && source !== 'ebird') nodes.push(h('p', { class: 'about compact-about' }, '本机记录读取中，不影响 eBird 结果。'));
      if (!groups.available) nodes.push(h('div', { class: 'notice' }, '热点组关系文件暂未加载。来自其他地点的记录保留在“地点关系待核对”中。'));
      if (remote.status === 'rejected' && (source === 'all' || source === 'ebird')) nodes.push(h('div', { class: 'notice' }, remote.reason.message === 'NO_PROXY' ? 'eBird 实时代理尚未配置。本机导入记录仍可查看。' : `eBird 获取失败：${remote.reason.message}`));
      if (local.status === 'rejected' && source !== 'ebird') nodes.push(h('div', { class: 'notice' }, `读取本机记录失败：${local.reason.message}`));
      nodes.push(h('div', { class: 'results-summary' }, h('b', null, isGroup ? '全组结果' : '本站结果'), ` · ${main.length} 条展示记录`, h('p', { class: 'small muted' }, '每条保留原报告与实际地点，跨来源不合计个体数。')));
      if (!main.length) nodes.push(emptyState('此范围和来源暂无可展示记录', pending.length ? '下方还有地点关系待核对的返回记录。' : '未关联到鸟点或超出近 30 天的导入记录，可在“数据来源”里查看。'));
      nodes.push(...main.map((o) => observationCard(o, { taxonomy, byId, duplicates, requestedId: id })));
      if (pending.length) nodes.push(h('details', { class: 'unconfirmed-records', open: !main.length },
        h('summary', null, `地点关系待核对 · ${pending.length} 条`),
        h('p', { class: 'small muted' }, '这些记录确由本次 eBird 查询返回，但本地尚未确认其地点与当前鸟点的关系。原数据全部保留，不标为错误，也不并入本站统计。'),
        ...pending.map((o) => observationCard(o, { taxonomy, byId, duplicates, requestedId: id }))));
      nodes.push(h('div', { class: 'list-foot' }, `当前列表涉及 ${checklistCount} 份报告（按来源区分）。eBird 每个分类项仅返回最近一次，不能据此推算这 30 天全部清单数或总个体数。`, h('br'), '本地导入按北京时间筛选近 30 天。'));
      results.replaceChildren(...nodes);
    };
    draw();
    body.replaceChildren(controls, h('div', { class: 'data-entry-line' }, h('a', { href: '#/data' }, '导入 / 管理观鸟中心与个人记录 ↗')), results);
    };
    D.fetchRecent(id, 30, { force }).then((value) => { remote = { status: 'fulfilled', value }; redraw(); }, (reason) => { remote = { status: 'rejected', reason }; redraw(); });
    I.readRecords().then((value) => { local = { status: 'fulfilled', value }; redraw(); }, (reason) => { local = { status: 'rejected', reason }; redraw(); });
    redraw();
  }

  const amap = `https://uri.amap.com/marker?position=${hs.glng ?? hs.lng},${hs.glat ?? hs.lat}&name=${encodeURIComponent(hs.name)}&coordinate=gaode&callnative=1`;
  root.replaceChildren(
    header(hs.name, { sub: `${regionLabel}${isGroup ? ' · 热点组概览' : parent ? ' · 组内子热点' : ''}`, actions: [fav] }),
    h('div', { class: 'scroll' },
      h('div', { class: 'hero' }, h('h2', null, hs.name), hs.en ? h('p', { class: 'en' }, hs.en) : null),
      isGroup ? h('div', { class: 'notice info group-notice' }, h('b', null, `热点组 · ${ctx.group.children.length} 个子鸟点`), h('p', null, '这里汇总整个组的记录。地图标记是概览位置，导航请先选择具体子鸟点。')) : null,
      parent ? h('div', { class: 'parent-link' }, '所属热点组 · ', h('a', { href: `#/spot/${parent.id}?tab=recent` }, parent.name, ' ↗')) : null,
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', null, hs.n), h('span', null, isGroup ? '全组历史鸟种' : '历史鸟种')),
        h('div', { class: 'stat' }, h('b', null, hs.ck ?? '-'), h('span', null, isGroup ? '全组清单数' : '清单数')),
        h('div', { class: 'stat' }, h('b', null, agoText(hs.last)), h('span', null, '快照最近记录'))),
      h('p', { class: 'snapshot-label' }, `以上为 eBird 快照 · ${index.generated.slice(0, 10)}，不含本机导入数据`),
      h('div', { class: 'actions' },
        isGroup ? h('button', { class: 'btn', onClick: () => { members.open = true; members.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, '选择子鸟点') : h('a', { class: 'btn', href: amap, target: '_blank', rel: 'noopener noreferrer' }, '高德导航'),
        h('a', { class: 'btn', href: `https://ebird.org/hotspot/${id}`, target: '_blank', rel: 'noopener noreferrer' }, 'eBird 页面', icon('external'))),
      members, tabs, body,
    ),
  );
  drawTabs(); renderBody();
  return root;
}
