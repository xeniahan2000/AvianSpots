# 让我观观 · AvianSpots v0.3.0

手机优先的 H5 / PWA。保留北京、浙江 eBird 静态快照，新增父子热点识别、来源区分和本机 CSV / JSON 导入。无需 npm 构建。本版没有接入观鸟记录中心自动抓取。

## 从旧版升级

1. 停止旧 Python 服务。备份旧 `web/config.js`，记下自己的天地图 Key、代理地址和地图设置。
2. 将压缩包中 **AvianSpots 文件夹里面的内容**覆盖到现有项目根目录，包括 `.github/`、`.gitignore` 等隐藏文件。保留原来的 `.git/`，不要多套一层 AvianSpots 文件夹。
3. 把自己的 `TIANDITU_KEY`、`PROXY_BASE` 等设置填回新 config.js。不要用旧 config.js 整份覆盖新版。eBird Key 仍放在本机环境变量或 Worker Secret 中。
4. 用原来的端口重新启动 `python proxy/local_server.py`。第一次打开 `http://localhost:8080/reset.html`，点“清理缓存并返回”。它会保留收藏和本机导入记录。
5. 首页页脚应显示 **v0.3.0**。如果线上已使用 Worker，需要同时重新部署新版代理，不能只更新网页。

手机访问时将 localhost 换成电脑局域网 IP。GitHub Pages 的缓存修复地址为 `https://xeniahan2000.github.io/AvianSpots/reset.html`。不要为了清理缓存而清除整个网站数据，否则会丢失本机导入记录。

## 本版修正

### 父热点保留子热点记录

已按用户提供的 eBird 热点组截图及原有地点快照，明确核对杭州湾湿地--三北浅滩 `L3968639` 的 5 个子热点：

| 子热点 | ID |
|---|---|
| 半掘浦海滨 | L12202263 |
| 观海卫海滨 | L22179490 |
| 杭州湾国家湿地公园二期 | L55855409 |
| 龙山海滨 | L17997069 |
| 四灶浦水库及附近农田 | L4285153 |

父热点显示全组结果，每条记录保留实际地点和报告链接。子热点可返回父热点。父热点地图坐标代表概览区域，导航前需要选择具体子热点。

本地尚未确认地点归属的返回记录，放在“地点关系待核对”中，数据保留，不擅自判断为错误或重定向。代理已移除旧版“地区 + r=鸟点”的重试，不再自动改变查询范围。

**当前只明确收录上述一个热点组。** 其他点未收录关系不代表一定独立。不会根据距离、同名或双连字符 `--` 猜测分组。后续可补充 `metadata/hotspot-groups.json` 并重新打包。数据中的 `namePrefix` 仅是名称前缀。

官方分组说明：https://support.ebird.org/en/support/solutions/articles/48001280356-explore-ebird-hotspots

“当前列表涉及的报告数”仅统计展示记录中的不同来源与报告编号。eBird recent 每个分类项只返回最近一次，不能据此推算近 30 天全部清单数或总个体数。

### 第二来源仅在本机使用

首页 → **数据来源与本地导入**。下载空白模板，整理自己的记录或已获许可的数据，预览校验后勾选确认再导入。详细字段见 `IMPORT.md`。

数据存储于这个浏览器的 IndexedDB，不上传、不自动同步，不会写进网页文件或 GitHub。没有关联鸟点的记录可在导入页面独立查看；明确关联且在近 30 天内的记录，会显示在对应鸟点和已确认的父热点页。

支持来源筛选、原报告链接、地点关联、重复导入更新、备份导出。不同来源不自动合并或相加个体数。中文同名不会自动匹配分类；唯一学名匹配会标明仍需核对分类口径。坐标只保留，不自动上图或按距离归并。

换设备、换域名、端口或部署路径前，请导出备份。清理整站数据和隐私模式可能导致记录无法保留。当前缓存修复入口不会清除 IndexedDB 或收藏。

## 本地运行

Python 3.10+，无需第三方 Python 依赖。

macOS / Linux：

```bash
export EBIRD_KEY="你的 eBird API Key"
python3 proxy/local_server.py
```

Windows PowerShell：

```powershell
$env:EBIRD_KEY="你的 eBird API Key"
python proxy/local_server.py
```

打开 `http://localhost:8080/`。同一 Wi-Fi 下手机使用电脑局域网 IP。没有 eBird Key 时，历史快照和本地导入仍可用。

`/api/health` 只显示版本和 Key 是否配置，不验证 Key 有效性，也不返回 Key 本身。http 调试不启用离线缓存；局域网 http 下定位可能受浏览器限制，部署至 https 后再测。

## 网页配置

修改 `web/config.js`：

- `APP_NAME` 为首页名称；浏览器标题和主屏幕名称另外在 index.html、manifest.webmanifest 中设置。
- `PROXY_BASE` 默认 http 用 `/api`，https 为空。部署代理后把 https 分支替换为 Worker 地址。
- `TIANDITU_KEY` 填天地图浏览器端 Key，发布后设置合理域名白名单。
- `TILES` 支持 auto / tianditu / amap / osm。对外发布请使用获得许可的底图服务。
- `LEAFLET_BASE` 是地图组件资源地址，默认 CDN，也可自行托管。

eBird Key 不得写到网页文件中。前端地图 Key 对访客可见，需要用地图服务商的来源限制保护。

## GitHub Pages 与 Worker

仓库自带工作流，将 **web/** 自动发布至 GitHub Pages。已经有仓库时：

```bash
git add .
git commit -m "Fix hotspot groups and add local imports (v0.3.0)"
git push
```

Settings → Pages → Source 选择 **GitHub Actions**。站点为 `https://xeniahan2000.github.io/AvianSpots/`。Pages 只能托管静态文件，不能运行 Python 代理。线上未配置代理时，只有 eBird 近期来源不可用，本机导入仍可用。

如需 Worker：

```bash
npm install -g wrangler
wrangler login
cd proxy
wrangler secret put EBIRD_KEY
wrangler deploy
```

按提示在自己终端设置 Secret。`ALLOWED_ORIGINS` 填网页来源，例如 `https://xeniahan2000.github.io`，不含仓库路径。CORS 只限制浏览器跨域读取，不是身份认证或完整限流；推广前需补充防滥用措施。

代理有请求超时和 10 分钟缓存。新版缓存前缀不复用旧版回退结果。“刷新”会重新访问代理，但代理可能仍返回有效期内缓存。

## 更新静态数据

在原 ebird-probe 项目抓取后运行：

```bash
python scripts/build_data.py --src ../ebird-probe/data --out web/data
```

脚本同时复制经核对的 metadata/hotspot-groups.json，也可用 `--groups` 指定别的分组文件。当前静态观测快照仍来自此前提供的数据；本次修改没有用真实 eBird API 更新观测。

历史名录目前覆盖 100 个鸟点，全部地点 993 个。找鸟索引只覆盖已抓取名录，不包含所有地点，也不混入本机导入数据。

## 主要文件

- `web/js/groups.js` 处理明确分组；`metadata/hotspot-groups.json` 保存关系与依据。
- `web/js/spot-view.js` 显示父子热点和来源；`web/js/sources-view.js` 提供导入与备份界面。
- `web/js/imports.js` 实现校验、来源保留与本机存储。
- `web/reset.html`、`web/js/cache-tools.js` 仅修复当前应用路径的缓存。
- `web/templates/` 是空模板，不含演示观察；`tests/` 使用合成数据，不会被 Pages 工作流发布。

## 测试

Node.js 20+ 可运行逻辑测试，无需 npm install：

```bash
node --test tests/core.test.mjs
python -m unittest discover -s tests -p "test_*.py" -v
```

测试使用合成响应，不是对真实鸟类数据的验证。以后修改代码发布时，需一起更新 config.js 和 sw.js 的版本号，以及 index.html、各模块的版本查询参数，避免混用新旧文件。只修改 Key 等配置值无需改版本号。

## 数据许可

页面保留 `Data provided by eBird (www.ebird.org)` 署名。使用 API 请遵守 eBird 条款。

观鸟记录中心协议：https://www.birdreport.cn/home/terms/page.html

本版没有从记录中心抓取、打包第三方观测。导入者需要确认访问与使用许可；对外发布另需核对署名、许可和敏感物种地点规则。不要把私密、敏感或不允许公开的数据上传到公开仓库。
