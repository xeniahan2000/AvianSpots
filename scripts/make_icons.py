#!/usr/bin/env python3
"""生成 PWA 图标（蓝底白字“鸟”）。需要 Pillow 和一个中文字体。"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / 'web' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)
FONT_CANDIDATES = [
    '/usr/share/fonts/google-noto-cjk/NotoSansSC-Bold.otf',
    '/usr/share/fonts/google-noto-cjk/NotoSansSC-Medium.otf',
    '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc',
    '/System/Library/Fonts/PingFang.ttc',
    'C:/Windows/Fonts/msyhbd.ttc',
]


def font(size):
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    sys.exit('找不到中文字体，请在 FONT_CANDIDATES 里加一个')


def make(size, maskable=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, size, size], fill='#2783DE')
        glyph = int(size * 0.46)
    else:
        r = int(size * 0.22)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill='#2783DE')
        glyph = int(size * 0.56)
    f = font(glyph)
    text = '鸟'
    l, t, r_, b = d.textbbox((0, 0), text, font=f)
    w, hgt = r_ - l, b - t
    d.text(((size - w) / 2 - l, (size - hgt) / 2 - t), text, font=f, fill='white')
    return img


make(192).save(OUT / 'icon-192.png')
make(512).save(OUT / 'icon-512.png')
make(512, maskable=True).save(OUT / 'icon-512-maskable.png')
make(180).save(OUT / 'apple-touch-icon.png')
print('icons written to', OUT)
