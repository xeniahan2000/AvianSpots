import { CONFIG } from '../config.js?v=0.3.0';
import * as D from './data.js?v=0.3.0';
import * as I from './imports.js?v=0.3.0';
import { h, header, spinner, emptyState, toast, fmtDateTime } from './ui.js?v=0.3.0';

function downloadText(text, name, type = 'application/json') {
  const uri = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = h('a', { href: uri, download: name }); document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(uri), 1500);
}

export async function DataSourcesView() {
  const root = h('div', { class: 'view' }, header('数据来源'), spinner());
  const { byId, list: hotspots } = await D.loadHotspots();
  let saved = [], prepared = null, fileToken = 0, query = '', shown = 40;
  const info = h('div', { class: 'notice info' }, '本地导入的记录仅保存在这个浏览器，不上传、不自动同步，也不会写进 GitHub 仓库。换设备、换域名或清除网站数据前，请先导出备份。');
  const summary = h('div', { class: 'small muted' });
  const feedback = h('div', { class: 'import-feedback', role: 'status', 'aria-live': 'polite' });
  const preview = h('div', { id: 'import-preview' });
  const listHost = h('div', { class: 'saved-records' });
  const consent = h('input', { type: 'checkbox', id: 'import-consent' });
  const consentLabel = h('label', { class: 'consent' }, consent, h('span', null, '我确认这些记录属于我自己或已获得使用许可，可在本机查看。文件没有私密或敏感地点信息。'));
  const defaultSource = h('select', { id: 'import-source', 'aria-label': '文件未填写来源时使用' }, h('option', { value: 'birdreport' }, '观鸟记录中心'), h('option', { value: 'personal' }, '个人记录'));
  const file = h('input', { type: 'file', id: 'import-file', accept: '.csv,.json,text/csv,application/json', 'aria-label': '选择 CSV 或 JSON 文件' });
  const save = h('button', { class: 'btn primary', disabled: true, id: 'import-save' }, '确认导入有效记录');
  const backup = h('button', { class: 'btn', id: 'import-backup' }, '导出本地备份');
  const clear = h('button', { class: 'btn danger', id: 'import-clear' }, '清除本地记录');
  const find = h('input', { type: 'search', placeholder: '搜鸟种、地点或报告编号', 'aria-label': '搜索本地记录' });
  const matches = (r) => !query || [r.speciesName, r.scientificName, r.locationName, r.recordId, r.ebirdLocId, I.SOURCE_LABELS[r.source]].some((s) => D.norm(s).includes(D.norm(query)));

  const recordCard = (r) => {
    const linked = byId.get(r.ebirdLocId);
    const mapInput = h('input', { type: 'text', value: r.ebirdLocId || '', placeholder: '如 L22179490，留空取消关联', 'aria-label': `报告 ${r.recordId} 的 eBird 鸟点ID` });
    const suggestions = h('select', { 'aria-label': '从本地鸟点中选择' }, h('option', { value: '' }, '也可按名称搜索后选择'));
    const searchPlace = h('input', { type: 'search', placeholder: '搜索鸟点名称', 'aria-label': '搜索要关联的鸟点' });
    searchPlace.addEventListener('input', () => {
      const q = D.norm(searchPlace.value);
      const results = q ? hotspots.filter((hs) => D.matchHotspot(hs, q)).slice(0, 30) : [];
      suggestions.replaceChildren(h('option', { value: '' }, results.length ? '请选择具体地点' : '输入名称搜索'), ...results.map((hs) => h('option', { value: hs.id }, `${hs.name} · ${hs.id}${hs.isGroup ? '（全组）' : ''}`)));
    });
    suggestions.addEventListener('change', () => { if (suggestions.value) mapInput.value = suggestions.value; });
    const linkButton = h('button', { class: 'btn', onClick: async () => {
      const id = mapInput.value.trim();
      if (id && !byId.has(id)) { toast('本地快照中没有这个鸟点编号'); return; }
      const sameReport = saved.filter((row) => row.source === r.source && row.recordId === r.recordId);
      const destination = id ? `${byId.get(id).name}（${id}）` : '未关联';
      if (!window.confirm(`将这份报告的 ${sameReport.length} 条记录关联为「${destination}」？\n原始地点名称和坐标会保留。此操作只影响本机记录。`)) return;
      try { await I.saveRecords(sameReport.map((row) => ({ ...row, ebirdLocId: id }))); await loadSaved(); toast('已更新本机地点关联'); }
      catch (e) { toast(e.message); }
    } }, '保存整份报告的关联');
    return h('article', { class: 'observation-card local-card' },
      h('div', { class: 'observation-top' }, h('strong', null, r.speciesName || r.scientificName || r.speciesCode), h('strong', { class: 'num' }, r.count === 'X' ? '数量未知' : `×${r.count}`)),
      h('div', { class: 'observation-meta' }, h('span', { class: 'tag green' }, I.SOURCE_LABELS[r.source]), h('span', null, fmtDateTime(r.observedAt))),
      h('p', { class: 'small' }, '原地点 · ', r.locationName || r.locationId || '未提供'),
      h('p', { class: 'small muted' }, `报告 ${r.recordId}${r.scientificName ? ` · ${r.scientificName}` : ''}`),
      linked ? h('a', { class: 'text-link', href: `#/spot/${linked.id}?tab=recent` }, `已关联 · ${linked.name} ↗`) : h('p', { class: 'small muted' }, r.ebirdLocId ? `关联地点 ${r.ebirdLocId} 不在快照中` : '尚未关联 eBird 鸟点；可在此独立查看'),
      r.taxonomyVersion ? h('p', { class: 'small muted' }, `分类版本 · ${r.taxonomyVersion}`) : null,
      r.url ? h('a', { class: 'text-link', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, '打开原报告 ↗') : null,
      h('details', { class: 'link-editor' }, h('summary', null, '调整地点关联'),
        h('p', { class: 'small muted' }, '仅按你的明确选择关联，不按距离或同名自动合并。选择全组仅表示报告覆盖概览区域。'),
        searchPlace, suggestions, mapInput, linkButton),
    );
  };

  const drawSaved = () => {
    const unlinked = saved.filter((r) => !r.ebirdLocId || !byId.has(r.ebirdLocId)).length;
    summary.textContent = `本机 ${saved.length} 条记录 · ${new Set(saved.map((r) => `${r.source}:${r.recordId}`)).size} 份报告 · ${unlinked} 条未关联到快照鸟点`;
    backup.disabled = clear.disabled = saved.length === 0;
    const filtered = saved.filter(matches).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    listHost.replaceChildren(filtered.length ? h('div', null, ...filtered.slice(0, shown).map(recordCard),
      shown < filtered.length ? h('button', { class: 'morebtn', onClick: () => { shown += 40; drawSaved(); } }, `加载更多（已显示 ${shown}/${filtered.length}）`) : h('div', { class: 'list-foot' }, `共 ${filtered.length} 条；不会跨来源相加数量`)) : emptyState(saved.length ? '没有匹配记录' : '还没有导入记录', '先下载模板，填入自己的记录或获得授权的数据'));
  };
  const loadSaved = async () => { saved = await I.readRecords(); drawSaved(); };
  find.addEventListener('input', () => { query = find.value.trim(); shown = 40; drawSaved(); });
  consent.addEventListener('change', () => { save.disabled = !consent.checked || !prepared?.rows.length; });
  defaultSource.addEventListener('change', () => { if (file.files?.length) file.dispatchEvent(new Event('change')); });
  file.addEventListener('change', async () => {
    const token = ++fileToken, selected = file.files?.[0];
    prepared = null; consent.checked = false; save.disabled = true; preview.replaceChildren(); feedback.textContent = '';
    if (!selected) return;
    try {
      if (selected.size > I.MAX_BYTES) throw new Error('文件超过 5 MB，请拆分后导入');
      const text = await selected.text(); if (token !== fileToken) return;
      prepared = I.prepareImport(text, selected.name, { defaultSource: defaultSource.value });
      const stats = I.mergeRecords(saved, prepared.rows).stats;
      const unknownIds = prepared.rows.filter((r) => r.ebirdLocId && !byId.has(r.ebirdLocId));
      feedback.textContent = `文件 ${prepared.total} 条，${prepared.rows.length} 条有效，${prepared.errors.length} 条无效。预计新增 ${stats.added}，更新 ${stats.updated}，未改变 ${stats.unchanged}。`;
      const issues = [...prepared.errors, ...prepared.warnings];
      preview.replaceChildren(
        unknownIds.length ? h('p', { class: 'small muted' }, `${unknownIds.length} 条关联地点不在本地快照中，导入后请在下方核对。`) : null,
        h('div', { class: 'preview-label' }, '预览前 3 条有效记录（尚未保存）'),
        ...prepared.rows.slice(0, 3).map((r) => h('div', { class: 'preview-row' }, h('b', null, r.speciesName || r.scientificName || r.speciesCode), ` · ${r.count === 'X' ? '数量未知' : `×${r.count}`} · ${r.observedAt}`, h('br'), `${r.locationName || r.ebirdLocId} · ${I.SOURCE_LABELS[r.source]}`)),
        issues.length ? h('details', { open: true, class: 'validation-issues' }, h('summary', null, `${issues.length} 条校验提示`), ...issues.slice(0, 20).map((e) => h('p', null, e)),
          issues.length > 20 ? h('p', null, '这里只显示前 20 条，下载报告查看全部。') : null,
          h('button', { class: 'btn', onClick: () => downloadText(issues.join('\n'), '导入校验报告.txt', 'text/plain') }, '下载校验报告')) : null,
      );
    } catch (e) { feedback.textContent = `不能导入：${e.message}`; prepared = null; }
  });
  save.addEventListener('click', async () => {
    if (!prepared?.rows.length || !consent.checked) return;
    save.disabled = true;
    try {
      const stats = await I.saveRecords(prepared.rows); await loadSaved();
      feedback.textContent = `已保存到本机：新增 ${stats.added}，更新 ${stats.updated}，未改变 ${stats.unchanged}。无效行未导入。`;
      prepared = null; preview.replaceChildren(); consent.checked = false; file.value = '';
    } catch (e) { feedback.textContent = e.message; save.disabled = false; }
  });
  backup.addEventListener('click', () => downloadText(I.backupText(saved), `AvianSpots-本地备份-${new Date().toISOString().slice(0, 10)}.json`));
  clear.addEventListener('click', async () => {
    if (!saved.length || !window.confirm(`清除这个浏览器保存的 ${saved.length} 条导入记录？建议先导出备份。\n收藏、eBird 静态快照和其他设备的数据不会被修改。`)) return;
    try { await I.clearRecords(); await loadSaved(); feedback.textContent = '本机导入记录已清除'; prepared = null; preview.replaceChildren(); save.disabled = true; }
    catch (e) { feedback.textContent = e.message; }
  });
  root.replaceChildren(header('数据来源'), h('div', { class: 'scroll' },
    h('div', { class: 'source-overview' }, h('h2', null, '两边参考，来源保留'),
      h('p', null, 'eBird · 静态快照与近 30 天接口'), h('p', { class: 'small muted' }, CONFIG.PROXY_BASE ? '已设置实时代理地址；连接情况以实际请求为准。' : '线上实时代理未配置；历史快照与本地导入仍可使用。'),
      h('p', null, '观鸟记录中心 / 个人 · 本机文件导入'), h('p', { class: 'small muted' }, '没有接入自动抓取。官方原始导出文件若列名不同，请先整理为下方模板。')), info,
    h('section', { class: 'import-panel' }, h('h3', null, '导入 CSV / JSON'),
      h('p', { class: 'small muted' }, 'UTF-8 编码，单次最多 5 MB / 10,000 条。日期按北京时间。模板是空文件，不含示例观测。'),
      h('div', { class: 'actions compact' }, h('a', { class: 'btn', href: 'templates/records-template.csv', download: 'records-template.csv' }, 'CSV 模板'), h('a', { class: 'btn', href: 'templates/records-template.json', download: 'records-template.json' }, 'JSON 模板')),
      h('label', { class: 'field-label' }, '文件未填写来源时使用', defaultSource), file, feedback, preview, consentLabel, save,
    ),
    h('section', { class: 'import-panel' }, h('h3', null, '本机记录'), summary,
      h('div', { class: 'actions compact' }, backup, clear), h('div', { class: 'searchbox compact-search' }, find),
      h('p', { class: 'small muted' }, '关联到鸟点且处于近 30 天的记录，会在该鸟点及已确认的父热点页显示。未关联记录仅在这里显示。坐标仅保留，不会自动放到地图。')),
    listHost,
    h('div', { class: 'about' }, h('a', { href: 'reset.html' }, '页面仍显示旧版本？修复应用缓存'), '（保留本地导入和收藏）'),
  ));
  feedback.textContent = '正在读取本机记录…';
  loadSaved().then(() => { if (feedback.textContent === '正在读取本机记录…') feedback.textContent = ''; }).catch((e) => { feedback.textContent = e.message; });
  return root;
}
