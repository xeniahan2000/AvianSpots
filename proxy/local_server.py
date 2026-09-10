#!/usr/bin/env python3
"""本地一体服务：静态托管 web/ + 同源代理 /api/… 到 eBird。只用标准库，适合在自己电脑上跑、手机连同一 Wi-Fi 试用。

用法：
  export EBIRD_KEY=你的key           # Windows PowerShell: $env:EBIRD_KEY="你的key"
  python proxy/local_server.py         # 默认 0.0.0.0:8080，托管 ../web
  python proxy/local_server.py --port 9000 --web ./web

网页在 http 下会自动把 PROXY_BASE 设为 '/api'（见 web/config.js），不用改。
手机打开 http://<电脑局域网IP>:8080/。非 localhost 的 http 下浏览器会禁用定位，属于浏览器安全策略，部署到 https 后就正常。

路由：
  /api/health
  /api/recent/<locId>?back=1..30&region=CN-33   某鸟点近 N 天每种最近一次记录（旧版 region 参数仅保留兼容，不改变查询范围）
  /api/notable/<regionCode>?back=1..30          某地区近 N 天罕见鸟记录
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

EBIRD = "https://api.ebird.org/v2"
TTL = 600  # 同一参数 10 分钟内只问 eBird 一次
REGION_RE = re.compile(r"[A-Z]{2}(-[A-Z0-9]{1,3})?")
_cache: dict[str, tuple[float, bytes]] = {}


def ebird_get(key: str, path: str) -> bytes:
    now = time.time()
    hit = _cache.get(path)
    if hit and hit[0] > now:
        return hit[1]
    req = urllib.request.Request(EBIRD + path, headers={"x-ebirdapitoken": key, "accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        body = r.read()
    if len(_cache) >= 512:
        _cache.pop(next(iter(_cache)))
    _cache[path] = (now + TTL, body)
    return body


def recent(key: str, loc: str, back: int, region: str = "") -> bytes:
    """Preserve eBird's geographic semantics, including legitimate parent/sub-hotspot results.
    region is accepted for compatibility only, never used to broaden the query.
    """
    tail = f"back={back}&sppLocale=zh_SIM&includeProvisional=true"
    return ebird_get(key, f"/data/obs/{loc}/recent?{tail}")


class Handler(SimpleHTTPRequestHandler):
    ebird_key = os.environ.get("EBIRD_KEY", "")

    def log_message(self, fmt, *args):  # 精简日志
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        path = urlsplit(self.path).path
        if path.startswith("/api/"):
            self.send_header("access-control-allow-origin", "*")
            self.send_header("cache-control", "no-store")
        elif path.endswith((".json", ".js", ".css", ".html", ".webmanifest")) or path.rstrip("/") == "":
            self.send_header("cache-control", "no-store")  # 调试时改完刷新即见
        super().end_headers()

    def do_GET(self):
        if not self.path.startswith("/api/"):
            return super().do_GET()
        u = urlsplit(self.path)
        q = parse_qs(u.query)
        parts = u.path.split("/")[2:]
        try:
            if parts == ["health"]:
                return self._json(200, {"ok": True, "version": "0.3.0", "keyConfigured": bool(self.ebird_key)})
            if not self.ebird_key:
                return self._json(500, {"error": "未设置环境变量 EBIRD_KEY"})
            if len(parts) == 2 and parts[0] == "recent" and re.fullmatch(r"L\d+", parts[1]):
                back = int(q.get("back", ["30"])[0])
                if not 1 <= back <= 30:
                    return self._json(400, {"error": "back 必须在 1..30 之间"})
                region = q.get("region", [""])[0].upper()
                return self._raw(200, recent(self.ebird_key, parts[1], back, region))
            if len(parts) == 2 and parts[0] == "notable" and REGION_RE.fullmatch(parts[1]):
                back = min(30, max(1, int(q.get("back", ["7"])[0])))
                body = ebird_get(self.ebird_key, f"/data/obs/{parts[1]}/recent/notable?back={back}&sppLocale=zh_SIM&detail=simple")
                return self._raw(200, body)
            return self._json(404, {"error": "not found"})
        except ValueError:
            return self._json(400, {"error": "请求参数格式无效"})
        except urllib.error.HTTPError as e:
            return self._json(502 if e.code >= 500 else e.code, {"error": f"eBird {e.code}"})
        except Exception as e:  # noqa: BLE001
            return self._json(502, {"error": str(e)})

    def _raw(self, status, body: bytes):
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, obj):
        self._raw(status, json.dumps(obj, ensure_ascii=False).encode())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--web", default=str(Path(__file__).resolve().parent.parent / "web"))
    a = ap.parse_args()
    web = Path(a.web).resolve()
    if not (web / "index.html").exists():
        sys.exit(f"找不到 {web / 'index.html'}")
    if not Handler.ebird_key:
        print("提示：未设置 EBIRD_KEY，静态页面可用，“近 30 天”实时接口会报错。")
    srv = ThreadingHTTPServer((a.host, a.port), partial(Handler, directory=str(web)))
    print(f"托管 {web}\n本机打开 http://localhost:{a.port}/  手机用电脑的局域网 IP 替换 localhost\n代理 /api/recent/<locId>  Ctrl+C 退出")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
