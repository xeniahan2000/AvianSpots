// 小工具：DOM 构造、格式化、toast。不依赖任何框架。

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // 只用于自己写的 SVG，不要传数据
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export const ICONS = {
  back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4 6.3 20.5l1.2-6.4L2.8 9.7l6.4-.8z"/></svg>',
  starFilled: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4 6.3 20.5l1.2-6.4L2.8 9.7l6.4-.8z"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s-6-5.3-6-11a6 6 0 1 1 12 0c0 5.7-6 11-6 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  map: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  bird: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13c4 0 6-2 8-5 1-1.5 2.5-2 4-2l2-2 1 2h3l-3 2c0 5-3 9-9 9H5l3-3H3z"/><path d="M9 20l2-4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  locate: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
};

export const icon = (name, cls = 'icon') => h('span', { class: cls, html: ICONS[name], 'aria-hidden': 'true' });

export function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - d) / 86400000));
}

export function agoText(dateStr) {
  const d = daysSince(dateStr);
  if (d == null) return '暂无记录';
  if (d === 0) return '今天';
  if (d === 1) return '昨天';
  if (d < 30) return `${d} 天前`;
  if (d < 365) return `${Math.floor(d / 30)} 个月前`;
  return `${Math.floor(d / 365)} 年前`;
}

// 活跃度分级：7 天内 hot，30 天内 warm，其余 cold
 export function activity(dateStr) {
  const d = daysSince(dateStr);
  if (d == null) return 'none';
  if (d <= 7) return 'hot';
  if (d <= 30) return 'warm';
  return 'cold';
}

export function fmtKm(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function fmtDateTime(s) {
  // '2026-09-09 15:17' -> '9/9 15:17'，跨年时带年
  if (!s) return '';
  const [date, time] = s.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const nowY = new Date().getFullYear();
  return (y === nowY ? `${m}/${d}` : `${y}/${m}/${d}`) + (time ? ` ${time}` : '');
}

let toastTimer;
export function toast(msg, { action, onAction, sticky } = {}) {
  const el = document.getElementById('toast');
  el.replaceChildren(h('span', null, msg), action ? h('button', { class: 'toast-action', onClick: () => { onAction?.(); el.hidden = true; } }, action) : null);
  el.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function spinner(text = '加载中…') {
  return h('div', { class: 'state' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', null, text));
}

export function emptyState(title, desc) {
  return h('div', { class: 'state' }, h('p', { class: 'state-title' }, title), desc ? h('p', { class: 'muted' }, desc) : null);
}

// 顶栏：返回键 + 标题 + 右侧动作
 export function header(title, { sub, back = true, actions = [] } = {}) {
  return h('header', { class: 'topbar' },
    back ? h('button', { class: 'iconbtn', 'aria-label': '返回', onClick: () => history.length > 1 ? history.back() : (location.hash = '#/regions') }, icon('back')) : h('span', { class: 'iconbtn-gap' }),
    h('div', { class: 'topbar-title' }, h('h1', null, title), sub ? h('p', { class: 'muted small ellipsis' }, sub) : null),
    h('div', { class: 'topbar-actions' }, ...actions),
  );
}
