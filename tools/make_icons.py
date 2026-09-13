# 產生 PWA 圖示：綠底、白色卡片、兩條條碼（仿卡面上下排列）
# 用法：py tools\make_icons.py
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (31, 111, 80)
CARD = (255, 253, 248)
INK = (29, 28, 25)
# 固定的裝飾條紋寬度（不是真實條碼）
PATTERN = [2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 1, 1, 2, 1, 2, 1, 1, 3, 2, 1, 1, 2, 1, 1, 3, 1]


def draw_icon(size: int) -> Image.Image:
    s = 4  # 超取樣再縮小，邊緣較平滑
    big = size * s
    img = Image.new("RGB", (big, big), BG)
    d = ImageDraw.Draw(img)
    # maskable 圖示安全區約 80%，卡片放在中央 64%
    cw, ch = big * 0.66, big * 0.46
    x0, y0 = (big - cw) / 2, (big - ch) / 2
    d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], radius=big * 0.05, fill=CARD)

    def bars(top: float, height: float) -> None:
        unit = (cw * 0.8) / sum(PATTERN)
        x = x0 + cw * 0.1
        for i, w in enumerate(PATTERN):
            if i % 2 == 0:
                d.rectangle([x, top, x + w * unit - 1, top + height], fill=INK)
            x += w * unit

    bars(y0 + ch * 0.14, ch * 0.28)
    bars(y0 + ch * 0.58, ch * 0.28)
    return img.resize((size, size), Image.LANCZOS)


for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    draw_icon(size).save(OUT / name, optimize=True)
    print(f"已輸出 {OUT / name}")
