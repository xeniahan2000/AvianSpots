// 部署前只需改这一个文件
export const CONFIG = {
  // 应用名（顶栏显示）。图标上的名字在 index.html 和 manifest.webmanifest 里改
  APP_NAME: '让我观观',
  // 代理地址，用于“近 30 天”页签。
  //   http（本机/局域网调试，搭配 proxy/local_server.py）自动用同源的 '/api'；
  //   https（线上）填部署好的 Worker 地址，如 'https://avianspots-proxy.xxx.workers.dev'，空字符串 = 不启用。
  PROXY_BASE: location.protocol === 'https:' ? 'https://avianspots-proxy.avianspots.workers.dev' : '/api',
  // 天地图免费 key（https://console.tianditu.gov.cn/ → 应用管理 → 浏览器端），空 = 回退到高德瓦片
  TIANDITU_KEY: '80dd5d4ce74bca4aea87b6298a8cd942',
  // 'auto' | 'tianditu' | 'amap' | 'osm'；auto = 有 key 用天地图，否则高德
  TILES: 'auto',
  // Leaflet 资源地址；境内访问 jsDelivr 一般比 unpkg 稳。也可下载到 web/vendor/leaflet/ 后改成 'vendor/leaflet/'
  LEAFLET_BASE: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/',
  // “附近”页面的搜索半径与条数
  NEARBY_KM: 100,
  NEARBY_LIMIT: 40,
  VERSION: '0.3.0',
};
