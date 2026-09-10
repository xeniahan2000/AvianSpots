#!/usr/bin/env python3
"""
build_data.py  把 ebird_probe.py 抓下来的 data/ 目录打包成 PWA 用的静态 JSON。

用法（在 scripts/ 目录下）
  python build_data.py                       # 默认读 ./data，写 ../web/data
  python build_data.py --src ~/ebird-probe/data --out ../web/data

产出（前端直接 fetch，部署时交给静态托管做 gzip）
  index.json            省份列表与统计，应用启动时加载
  taxonomy.json         分类表子集，只含在任一鸟点名录中出现过的 code；末列为中文科名
  hotspots.json         全部鸟点的轻量索引（搜索、附近、鸟种反查用）
  species-index.json    鸟种 -> 鸟点 倒排索引
  regions/CN-11.json    单省全部鸟点 + 各鸟点历史名录
"""

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROVINCE_ZH = {
    "CN-11": "北京", "CN-12": "天津", "CN-13": "河北", "CN-14": "山西", "CN-15": "内蒙古",
    "CN-21": "辽宁", "CN-22": "吉林", "CN-23": "黑龙江", "CN-31": "上海", "CN-32": "江苏",
    "CN-33": "浙江", "CN-34": "安徽", "CN-35": "福建", "CN-36": "江西", "CN-37": "山东",
    "CN-41": "河南", "CN-42": "湖北", "CN-43": "湖南", "CN-44": "广东", "CN-45": "广西",
    "CN-46": "海南", "CN-50": "重庆", "CN-51": "四川", "CN-52": "贵州", "CN-53": "云南",
    "CN-54": "西藏", "CN-61": "陕西", "CN-62": "甘肃", "CN-63": "青海", "CN-64": "宁夏",
    "CN-65": "新疆", "HK": "香港", "MO": "澳门", "TW": "台湾",
}
# eBird 的科名（familyComName）只有英文，这里补一份中文科名（按郑光美《中国鸟类分类与分布名录》习惯）。
# 没有映射到的科在前端回退为英文；新增省份出现新科时在此补充即可。
FAMILY_ZH = {
    "Ducks, Geese, and Waterfowl": "鸭科", "Pheasants, Grouse, and Allies": "雉科", "Pigeons and Doves": "鸠鸽科",
    "Sandgrouse": "沙鸡科", "Bustards": "鸨科", "Cuckoos": "杜鹃科", "Nightjars and Allies": "夜鹰科", "Frogmouths": "蟆口鸱科",
    "Swifts": "雨燕科", "Treeswifts": "凤头雨燕科", "Rails, Gallinules, and Coots": "秧鸡科", "Finfoots": "鳍趾䴘科", "Cranes": "鹤科",
    "Thick-knees": "石鸻科", "Stilts and Avocets": "反嘴鹬科", "Ibisbill": "鹮嘴鹬科", "Oystercatchers": "蛎鹬科",
    "Plovers and Lapwings": "鸻科", "Painted-Snipes": "彩鹬科", "Jacanas": "水雉科", "Sandpipers and Allies": "鹬科",
    "Buttonquail": "三趾鹑科", "Crab-Plover": "蟹鸻科", "Pratincoles and Coursers": "燕鸻科", "Skuas and Jaegers": "贼鸥科",
    "Auks, Murres, and Puffins": "海雀科", "Gulls, Terns, and Skimmers": "鸥科", "Tropicbirds": "鹲科", "Flamingos": "红鹳科",
    "Grebes": "䴙䴘科", "Loons": "潜鸟科", "Albatrosses": "信天翁科", "Southern Storm-Petrels": "洋海燕科",
    "Northern Storm-Petrels": "海燕科", "Shearwaters and Petrels": "鹱科", "Storks": "鹳科", "Frigatebirds": "军舰鸟科",
    "Boobies and Gannets": "鲣鸟科", "Anhingas": "蛇鹈科", "Cormorants and Shags": "鸬鹚科", "Ibises and Spoonbills": "鹮科",
    "Herons, Egrets, and Bitterns": "鹭科", "Pelicans": "鹈鹕科", "Osprey": "鹗科", "Hawks, Eagles, and Kites": "鹰科",
    "Barn-Owls": "草鸮科", "Owls": "鸱鸮科", "Trogons": "咬鹃科", "Hoopoes": "戴胜科", "Hornbills": "犀鸟科",
    "Bee-eaters": "蜂虎科", "Kingfishers": "翠鸟科", "Rollers": "佛法僧科", "Asian Barbets": "拟啄木鸟科", "Honeyguides": "响蜜䴕科",
    "Woodpeckers": "啄木鸟科", "Falcons and Caracaras": "隼科", "Cockatoos": "凤头鹦鹉科", "Old World Parrots": "鹦鹉科",
    "New World and African Parrots": "鹦鹉科", "Asian and Grauer's Broadbills": "阔嘴鸟科", "African and Green Broadbills": "绿阔嘴鸟科",
    "Pittas": "八色鸫科", "Ioras": "雀鹎科", "Cuckooshrikes": "山椒鸟科", "Whistlers and Allies": "啸鹟科",
    "Vireos, Shrike-Babblers, and Erpornis": "莺雀科", "Old World Orioles": "黄鹂科", "Drongos": "卷尾科", "Fantails": "扇尾鹟科",
    "Monarch Flycatchers": "王鹟科", "Shrikes": "伯劳科", "Woodshrikes and Allies": "钩嘴鵙科", "Crows, Jays, and Magpies": "鸦科",
    "Fairy Flycatchers": "玉鹟科", "Tits, Chickadees, and Titmice": "山雀科", "Penduline-Tits": "攀雀科", "Larks": "百灵科",
    "Bearded Reedling": "文须雀科", "Cisticolas and Allies": "扇尾莺科", "Reed Warblers and Allies": "苇莺科",
    "Grassbirds and Allies": "蝗莺科", "Cupwings": "鳞胸鹪鹛科", "Swallows": "燕科", "Bulbuls": "鹎科", "Leaf Warblers": "柳莺科",
    "Bush Warblers and Allies": "树莺科", "Long-tailed Tits": "长尾山雀科", "Sylviid Warblers and Allies": "莺鹛科",
    "Parrotbills": "鸦雀科", "White-eyes, Yuhinas, and Allies": "绣眼鸟科", "Tree-Babblers, Scimitar-Babblers, and Allies": "林鹛科",
    "Ground Babblers and Allies": "幽鹛科", "Alcippe Fulvettas": "雀鹛科", "Laughingthrushes and Allies": "噪鹛科", "Kinglets": "戴菊科",
    "Wallcreeper": "旋壁雀科", "Nuthatches": "䴓科", "Treecreepers": "旋木雀科", "Wrens": "鹪鹩科", "Spotted Elachura": "鹩鹛科",
    "Dippers": "河乌科", "Starlings": "椋鸟科", "Thrushes and Allies": "鸫科", "Old World Flycatchers": "鹟科", "Waxwings": "太平鸟科",
    "Flowerpeckers": "啄花鸟科", "Sunbirds and Spiderhunters": "花蜜鸟科", "Leafbirds": "叶鹎科", "Fairy-bluebirds": "和平鸟科",
    "Weavers and Allies": "织雀科", "Waxbills and Allies": "梅花雀科", "Accentors": "岩鹨科", "Old World Sparrows": "雀科",
    "Wagtails and Pipits": "鹡鸰科", "Przevalski's Pinktail": "朱鹀科", "Finches, Euphonias, and Allies": "燕雀科",
    "Longspurs and Snow Buntings": "铁爪鹀科", "Old World Buntings": "鹀科", "New World Sparrows": "雀鹀科",
}
CJK = re.compile(r"[\u4e00-\u9fff]")
NAME_RE = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")


def split_name(raw: str):
    """'沙河水库--巩华城半岛 (Shahe Reservoir--Gonghuacheng Peninsula)' -> (中文全名, 英文全名, 名称前缀或 None；不是官方分组依据)"""
    zh, en = raw.strip(), ""
    m = NAME_RE.match(raw)
    if m and CJK.search(m.group(1)):
        zh, en = m.group(1).strip(), m.group(2).strip()
    elif not CJK.search(raw):
        en = raw.strip()
    parent = zh.split("--", 1)[0].strip() if "--" in zh else None
    return zh, en, parent


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def dump(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    p.write_text(s, encoding="utf-8")
    return len(s.encode("utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="data", help="ebird_probe.py 的 data 目录")
    ap.add_argument("--out", default="../web/data", help="输出目录（会被覆写）")
    ap.add_argument("--groups", default=str(Path(__file__).resolve().parent.parent / "metadata/hotspot-groups.json"), help="经核对的父子热点关系文件")
    args = ap.parse_args()
    src, out = Path(args.src), Path(args.out)
    if not (src / "taxonomy_zh.json").exists():
        sys.exit(f"找不到 {src / 'taxonomy_zh.json'}，先运行 ebird_probe.py")

    tax = {t["code"]: t for t in load_json(src / "taxonomy_zh.json")}
    spp = {}
    for f in (src / "spplist").glob("L*.json"):
        spp[f.stem] = load_json(f)

    now = datetime.now()
    regions, hotspots_all, sp_index, used_codes = [], {}, {}, set()
    for f in sorted((src / "hotspots").glob("*.json")):
        code = f.stem
        raw_hs = load_json(f)
        hs, active30, with_list = [], 0, 0
        for h in raw_hs:
            zh, en, parent = split_name(h["locName"])
            last = h.get("latestObsDt") or None
            rec = {
                "id": h["locId"], "name": zh, "en": en, "namePrefix": parent,
                "lat": round(h["lat"], 5), "lng": round(h["lng"], 5),
                "glat": round(h.get("gcj_lat", h["lat"]), 5), "glng": round(h.get("gcj_lng", h["lng"]), 5),
                "n": h.get("numSpeciesAllTime", 0), "ck": h.get("numChecklistsAllTime", 0), "last": last,
            }
            if last and datetime.strptime(last[:10], "%Y-%m-%d") >= now - timedelta(days=30):
                active30 += 1
            codes = spp.get(h["locId"])
            if codes is not None:
                rec["spp"] = codes
                with_list += 1
                used_codes.update(codes)
                for c in codes:
                    sp_index.setdefault(c, []).append(h["locId"])
            hs.append(rec)
            hotspots_all[h["locId"]] = [code, zh, en, rec["n"], last, rec["lat"], rec["lng"], 1 if codes is not None else 0]
        hs.sort(key=lambda r: -r["n"])
        name = PROVINCE_ZH.get(code, code)
        size = dump(out / "regions" / f"{code}.json", {"code": code, "name": name, "hotspots": hs})
        lats, lngs = [r["lat"] for r in hs], [r["lng"] for r in hs]
        regions.append(
            {
                "code": code, "name": name, "n": len(hs), "active30": active30, "withList": with_list,
                "bbox": [min(lats), min(lngs), max(lats), max(lngs)] if hs else None,
            }
        )
        print(f"{code} {name:<4} 鸟点 {len(hs):>4}  近30天活跃 {active30:>4}  已有名录 {with_list:>4}  -> regions/{code}.json {size/1024:.0f} KB")

    group_file = Path(args.groups)
    if group_file.exists():
        dump(out / "hotspot-groups.json", load_json(group_file))
    else:
        dump(out / "hotspot-groups.json", {"schemaVersion": 1, "groups": []})
        print("提示：未提供已核对的热点组关系，不会按名称或距离推断。")

    regions.sort(key=lambda r: -r["n"])
    # 分类表子集：[code, 中文, 英文, 学名, 分类序, 科(英文), 类别, 科(中文，可能为空)]
    tax_rows = []
    for c in used_codes:
        t = tax.get(c)
        if t:
            tax_rows.append([c, t["zh"], t["en"], t["sci"], t["order"], t["family"], t["category"], FAMILY_ZH.get(t["family"], "")])
        else:
            tax_rows.append([c, c, c, "", 999999, "", "unknown", ""])
    tax_rows.sort(key=lambda r: r[4])
    missing_fam = sorted({r[5] for r in tax_rows if r[5] and not r[7]})
    if missing_fam:
        print(f"提示：{len(missing_fam)} 个科没有中文名，前端将显示英文，可补充 FAMILY_ZH：{', '.join(missing_fam)}")
    n_species = sum(1 for r in tax_rows if r[6] == "species")

    sizes = {
        "index.json": dump(out / "index.json", {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "eBird API 2.0 (www.ebird.org)",
            "regions": regions,
            "totals": {"hotspots": len(hotspots_all), "withList": sum(r["withList"] for r in regions), "species": n_species},
        }),
        "taxonomy.json": dump(out / "taxonomy.json", tax_rows),
        "hotspots.json": dump(out / "hotspots.json", hotspots_all),
        "species-index.json": dump(out / "species-index.json", sp_index),
    }
    print("\n" + "  ".join(f"{k} {v/1024:.0f} KB" for k, v in sizes.items()))
    print(f"合计：鸟点 {len(hotspots_all)}，有名录的鸟点 {sum(r['withList'] for r in regions)}，鸟种 {n_species}（另有杂交等 {len(tax_rows) - n_species} 项）")
    missing = [c for c in used_codes if c not in tax]
    if missing:
        print(f"提醒：{len(missing)} 个 code 不在分类表中，请用 --refresh 重下分类表: {missing[:5]}")


if __name__ == "__main__":
    main()
