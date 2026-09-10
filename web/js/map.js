// Leaflet 封装：按需加载、瓦片源选择（天地图 WGS-84 / 高德 GCJ-02）、鸟点标记。
import { CONFIG } from '../config.js?v=0.3.0';
import { activity } from './ui.js?v=0.3.0';

let leafletPromise;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const base = CONFIG.LEAFLET_BASE;
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = base + 'leaflet.css'; link.dataset.leaflet = '1';
      document.head.appendChild(link);
    }
    const s = document.createElement('script');
    s.src = base + 'leaflet.js'; s.async = true;
    const timer = setTimeout(() => reject(new Error('Leaflet 加载超时')), 10000);
    s.onload = () => { clearTimeout(timer); resolve(window.L); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('Leaflet 加载失败')); };
    document.head.appendChild(s);
  }).catch((e) => { leafletPromise = null; throw e; });
  return leafletPromise;
}

export function tileProvider() {
  let p = CONFIG.TILES;
  if (p === 'auto') p = CONFIG.TIANDITU_KEY ? 'tianditu' : 'amap';
  if (p === 'tianditu' && !CONFIG.TIANDITU_KEY) p = 'amap';
  return p;
}

// 高德瓦片是 GCJ-02，需要用偏移后的坐标；天地图、OSM 用原始 WGS-84
 export const usesGcj = () => tileProvider() === 'amap';
export const coordOf = (hs) => (usesGcj() && hs.glat != null ? [hs.glat, hs.glng] : [hs.lat, hs.lng]);

function addTiles(L, map) {
  const p = tileProvider();
  const attribution = 'Data provided by <a href="https://ebird.org" target="_blank" rel="noopener">eBird</a>';
  if (p === 'tianditu') {
    const tk = CONFIG.TIANDITU_KEY;
    const wmts = (layer) => `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`;
    const opt = { subdomains: '01234567', maxZoom: 18, attribution: attribution + ' · 天地图' };
    L.tileLayer(wmts('vec'), opt).addTo(map);
    L.tileLayer(wmts('cva'), { ...opt, attribution: '' }).addTo(map);
  } else if (p === 'amap') {
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: '1234', maxZoom: 18, attribution: attribution + ' · 高德地图',
    }).addTo(map);
  } else {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: attribution + ' · © OpenStreetMap' }).addTo(map);
  }
}

export function createMap(el) {
  const L = window.L;
  const map = L.map(el, { zoomControl: false, preferCanvas: true, tap: false });
  addTiles(L, map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  return map;
}

const COLORS = { hot: '#46A171', warm: '#2783DE', cold: '#9B9893', none: '#C9C7C3' };

export function radiusFor(n) {
  if (n >= 250) return 11;
  if (n >= 150) return 9;
  if (n >= 80) return 7;
  if (n >= 30) return 5.5;
  return 4;
}

// 用 canvas 渲染器画出所有鸟点，几百个点也不卡
 export function renderMarkers(map, group, hotspots, { onSelect, selectedId } = {}) {
  const L = window.L;
  group.clearLayers();
  const sorted = [...hotspots].sort((a, b) => a.n - b.n); // 小点先画，大点在上
  for (const hs of sorted) {
    const act = activity(hs.last);
    const selected = hs.id === selectedId;
    const m = L.circleMarker(coordOf(hs), {
      radius: radiusFor(hs.n) + (selected ? 3 : 0),
      color: selected ? '#2C2C2B' : '#ffffff',
      weight: selected ? 2.5 : 1.2,
      fillColor: COLORS[act],
      fillOpacity: act === 'none' ? 0.6 : 0.85,
      bubblingMouseEvents: false,
    });
    m.on('click', () => onSelect?.(hs));
    group.addLayer(m);
  }
}

export function fitTo(map, hotspots, bbox) {
  const L = window.L;
  if (hotspots.length) {
    const b = L.latLngBounds(hotspots.map(coordOf));
    map.fitBounds(b, { padding: [24, 24], maxZoom: 13 });
  } else if (bbox) {
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: [24, 24] });
  }
}
