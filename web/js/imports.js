// Local-only second source. No requests to birdreport.cn, uploads, geocoding or location inference.
export const MAX_ROWS = 10000;
export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SAVED = 20000;
export const SOURCE_LABELS = { ebird: 'eBird', birdreport: '观鸟记录中心 · 本地导入', personal: '个人记录 · 本地导入' };
export const FIELDS = ['source', 'recordId', 'ebirdLocId', 'locationId', 'locationName', 'observedAt', 'speciesName', 'scientificName', 'speciesCode', 'sourceTaxonId', 'taxonomyVersion', 'count', 'url', 'latitude', 'longitude', 'coordinateSystem'];
const ALIASES = {
  来源: 'source', 报告编号: 'recordId', 清单编号: 'recordId', eBird鸟点ID: 'ebirdLocId', 原地点编号: 'locationId',
  地点名称: 'locationName', 观察日期: 'observedAt', 观察时间: 'observedAt', 鸟种名称: 'speciesName', 学名: 'scientificName',
  鸟种代码: 'speciesCode', 原鸟种编号: 'sourceTaxonId', 分类版本: 'taxonomyVersion', 数量: 'count', 原始链接: 'url',
  纬度: 'latitude', 经度: 'longitude', 坐标系: 'coordinateSystem', 敏感记录: 'isSensitive', 私密记录: 'isPrivate',
};
const tidy = (value) => value == null ? '' : String(value).trim();
const truthy = (value) => ['1', 'true', 'yes', '是'].includes(tidy(value).toLowerCase());
export const sciKey = (value) => tidy(value).toLowerCase().replace(/\s+/g, ' ');

export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false, afterQuote = false;
  const pushCell = () => { row.push(cell); cell = ''; afterQuote = false; };
  const pushRow = () => { pushCell(); if (row.some((v) => v.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else cell += ch;
    } else if (ch === '"') {
      if (cell || afterQuote) throw new Error('CSV 引号位置不正确');
      quoted = true;
    } else if (ch === ',') pushCell();
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else { if (afterQuote && !/\s/.test(ch)) throw new Error('CSV 引号后应为逗号或换行'); if (!afterQuote) cell += ch; }
    if (rows.length > MAX_ROWS + 1) throw new Error(`单次最多 ${MAX_ROWS} 条记录`);
  }
  if (quoted) throw new Error('CSV 有未闭合的引号');
  if (cell || row.length || afterQuote) pushRow();
  if (!rows.length) return [];
  const headers = rows.shift().map((s) => ALIASES[s.trim()] || s.trim());
  if (headers.some((s) => !s) || new Set(headers).size !== headers.length) throw new Error('CSV 表头不能为空或重复');
  return rows.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`CSV 第 ${i + 2} 行列数不符，含逗号的字段需要双引号包围`);
    return Object.fromEntries(headers.map((key, j) => [key, values[j]]));
  });
}

export function safeURL(value) {
  const text = tidy(value);
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new Error('原始链接须为完整 http/https 地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('原始链接仅接受不含账号密码的 http/https 地址');
  if (text.length > 2048) throw new Error('原始链接过长');
  return url.href;
}

export function normalizeDate(value) {
  const text = tidy(value);
  // All naive times in the supplied China dataset are interpreted in Asia/Shanghai.
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    const date = new Date(`${y}-${m}-${d}T${hh || '00'}:${mm || '00'}:${ss || '00'}Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== `${y}-${m}-${d}` || +(hh || 0) > 23 || +(mm || 0) > 59 || +(ss || 0) > 59) throw new Error('观察日期或时间无效');
    return `${y}-${m}-${d}${hh ? ` ${hh}:${mm}${ss ? `:${ss}` : ''}` : ''}`;
  }
  // Explicit timezone offsets are converted to China Standard Time without guessing the browser timezone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    normalizeDate(text.slice(0, 10));
    const date = new Date(text);
    if (Number.isFinite(date.getTime())) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((p) => [p.type, p.value]));
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
    }
  }
  throw new Error('观察日期须为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm');
}

export function isRecent(value, days = 30, now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const lower = new Date(`${day}T00:00:00Z`); lower.setUTCDate(lower.getUTCDate() - days);
  const d = value.slice(0, 10);
  return d >= lower.toISOString().slice(0, 10) && d <= day;
}

function sourceName(value) {
  const s = tidy(value).toLowerCase();
  if (['birdreport', '观鸟记录中心', '中国观鸟记录中心', '观鸟中心'].includes(s)) return 'birdreport';
  if (['personal', '个人', '个人记录'].includes(s)) return 'personal';
  throw new Error('来源只支持 birdreport / personal；eBird 实时数据由代理提供');
}

function normalizedRow(row, defaultSource, line) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('记录必须为对象');
  const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [ALIASES[k] || k, v]));
  if (truthy(r.isSensitive) || truthy(r.isPrivate)) throw new Error('本版不导入标记为私密或敏感的记录，请先脱敏并核对使用权限');
  const out = {};
  for (const field of FIELDS) {
    if (['latitude', 'longitude', 'count'].includes(field)) continue;
    if (r[field] != null && !['string', 'number'].includes(typeof r[field])) throw new Error(`${field} 必须为文本或数字`);
    out[field] = tidy(r[field]);
    if (out[field].length > (field === 'url' ? 2048 : 300)) throw new Error(`${field} 字段过长`);
  }
  out.source = sourceName(out.source || defaultSource);
  if (!out.recordId) throw new Error('缺少报告编号 recordId（个人记录也请自定稳定编号）');
  if (!out.speciesName && !out.scientificName && !out.speciesCode) throw new Error('缺少鸟名、学名或鸟种代码');
  if (!out.locationName && !out.ebirdLocId) throw new Error('缺少地点名称 locationName 或 eBird鸟点ID');
  if (out.ebirdLocId && !/^L\d+$/.test(out.ebirdLocId)) throw new Error('eBird鸟点ID 格式应为 L 后接数字，可留空');
  if (out.speciesCode && !/^[a-z0-9]+$/.test(out.speciesCode)) throw new Error('鸟种代码 speciesCode 格式无效');
  out.observedAt = normalizeDate(out.observedAt);
  out.url = safeURL(out.url);
  const count = tidy(r.count);
  if (!count || count.toUpperCase() === 'X') out.count = 'X';
  else if (/^\d+$/.test(count) && Number.isSafeInteger(Number(count))) out.count = Number(count);
  else throw new Error('数量须为非负整数或 X（只确认出现，数量未知）');
  const lat = tidy(r.latitude), lng = tidy(r.longitude);
  if (!!lat !== !!lng) throw new Error('经纬度须同时填写或同时留空');
  out.latitude = out.longitude = null;
  if (lat) {
    out.latitude = Number(lat); out.longitude = Number(lng);
    if (!Number.isFinite(out.latitude) || !Number.isFinite(out.longitude) || Math.abs(out.latitude) > 90 || Math.abs(out.longitude) > 180) throw new Error('经纬度超出有效范围');
  }
  const crs = out.coordinateSystem.toUpperCase().replace(/[-_]/g, '') || 'UNKNOWN';
  if (!['WGS84', 'GCJ02', 'BD09', 'UNKNOWN'].includes(crs)) throw new Error('坐标系只支持 WGS84、GCJ02、BD09、unknown');
  out.coordinateSystem = crs === 'UNKNOWN' ? 'unknown' : crs;
  // Stable within a source/checklist/taxonomy. Never deduplicate separate platforms automatically.
  const taxonKey = out.sourceTaxonId ? `id:${out.sourceTaxonId}` : out.scientificName ? `sci:${sciKey(out.scientificName)}` : out.speciesName ? `name:${out.speciesName}` : `code:${out.speciesCode}`;
  out.id = JSON.stringify([out.source, out.recordId, out.taxonomyVersion, taxonKey]);
  out.line = line;
  return out;
}

export function prepareImport(text, filename = '', { defaultSource = 'birdreport' } = {}) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('文件超过 5 MB，请拆分后导入');
  if (text.includes('\uFFFD')) throw new Error('文件包含无法解码的文字，请另存为 UTF-8 CSV 或 JSON');
  let rows;
  if (/\.json$/i.test(filename) || /^[\s\uFEFF]*[\[{]/.test(text)) {
    const json = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (json && !Array.isArray(json) && json.schemaVersion != null && json.schemaVersion !== 1) throw new Error('暂不支持此 JSON schemaVersion');
    rows = Array.isArray(json) ? json : json?.records;
    if (!Array.isArray(rows)) throw new Error('JSON 须为记录数组或 {"schemaVersion":1,"records":[]}');
  } else rows = parseCSV(text);
  if (rows.length > MAX_ROWS) throw new Error(`单次最多 ${MAX_ROWS} 条记录`);
  const valid = new Map(), errors = [], warnings = [];
  let repeated = 0;
  rows.forEach((row, i) => {
    try {
      const value = normalizedRow(row, defaultSource, i + 1);
      if (valid.has(value.id)) { repeated++; warnings.push(`第 ${i + 1} 条与前面记录同来源、报告和分类项，采用文件中的最后一条`); }
      valid.set(value.id, value);
    } catch (e) { errors.push(`第 ${i + 1} 条：${e.message}`); }
  });
  return { rows: [...valid.values()], errors, warnings, repeated, total: rows.length };
}

export function mergeRecords(existing, incoming) {
  const map = new Map(existing.map((r) => [r.id, r]));
  const stats = { added: 0, updated: 0, unchanged: 0 };
  for (const input of incoming) {
    const { line, importedAt, ...row } = input;
    const previous = map.get(row.id);
    if (previous) {
      const { importedAt: oldTime, line: oldLine, ...old } = previous;
      if (JSON.stringify(old) === JSON.stringify(row)) { stats.unchanged++; continue; }
      stats.updated++;
    } else stats.added++;
    map.set(row.id, { ...row, importedAt: new Date().toISOString() });
  }
  if (map.size > MAX_SAVED) throw new Error(`本机最多保存 ${MAX_SAVED} 条记录，请先备份并整理`);
  return { rows: [...map.values()], stats };
}

let dbPromise;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前浏览器不支持本地数据保存')); return; }
    const scope = new URL('../', import.meta.url).pathname;
    const request = indexedDB.open(`avianspots-imports:${scope}`, 1);
    let settled = false;
    const fail = (message) => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(message)); } };
    const timer = setTimeout(() => fail('本机存储响应超时，eBird 数据不受影响。请检查浏览器存储设置后重试。'), 8000);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records', { keyPath: 'id' }); };
    request.onsuccess = () => { const db = request.result; if (settled) { db.close(); return; } settled = true; clearTimeout(timer); db.onversionchange = () => db.close(); resolve(db); };
    request.onblocked = () => fail('本机存储被旧标签页占用，请关闭旧页面后重试');
    request.onerror = () => fail('无法打开本地数据，请检查浏览器隐私或存储设置');
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

export async function readRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('records', 'readonly').objectStore('records').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('读取本地记录失败'));
  });
}

export async function saveRecords(incoming) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records');
    let stats, error;
    const req = store.getAll();
    req.onsuccess = () => {
      try { const result = mergeRecords(req.result, incoming); stats = result.stats; for (const row of result.rows) store.put(row); }
      catch (e) { error = e; tx.abort(); }
    };
    tx.oncomplete = () => { window.dispatchEvent(new Event('avianspots-imports-changed')); resolve(stats); };
    tx.onerror = tx.onabort = () => reject(error || new Error('保存失败，可能是浏览器存储空间不足；原记录未被覆盖'));
  });
}

export async function clearRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').clear();
    tx.oncomplete = () => { window.dispatchEvent(new Event('avianspots-imports-changed')); resolve(); };
    tx.onerror = () => reject(new Error('清除本地记录失败'));
  });
}

export function backupText(rows) {
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), timeZone: 'Asia/Shanghai', records: rows.map(({ id, line, importedAt, ...row }) => row) }, null, 2);
}

export function toObservation(record, taxonomy) {
  const explicit = record.speciesCode ? taxonomy.byCode.get(record.speciesCode) : null;
  const matches = !explicit && record.scientificName ? taxonomy.list.filter((t) => t.cat === 'species' && sciKey(t.sci) === sciKey(record.scientificName)) : [];
  const taxon = explicit || (matches.length === 1 ? matches[0] : null);
  return {
    id: record.id, source: record.source, recordId: record.recordId,
    speciesCode: taxon?.code || '', comName: record.speciesName || record.scientificName || record.speciesCode,
    sciName: record.scientificName, obsDt: record.observedAt, howMany: record.count,
    locId: record.ebirdLocId, locName: record.locationName, sourceLocationId: record.locationId,
    url: record.url, latitude: record.latitude, longitude: record.longitude, coordinateSystem: record.coordinateSystem,
    taxonomyVersion: record.taxonomyVersion, mapping: explicit ? 'explicit' : taxon ? 'scientific-name' : 'unmatched',
  };
}

// Conservative cross-source hint only. No merging or summing, and date-only records never match.
export function possibleDuplicateIds(rows) {
  const bins = new Map(), result = new Set();
  for (const row of rows) {
    if (!row.locId || !row.obsDt?.includes(' ') || row.howMany == null || row.howMany === 'X') continue;
    const taxon = row.speciesCode || (row.sciName ? `sci:${sciKey(row.sciName)}` : '');
    if (!taxon) continue;
    const key = JSON.stringify([row.locId, taxon, row.obsDt.slice(0, 16), String(row.howMany)]);
    const group = bins.get(key) || []; group.push(row); bins.set(key, group);
  }
  for (const group of bins.values()) if (new Set(group.map((r) => r.source)).size > 1) for (const r of group) result.add(r.id);
  return result;
}
