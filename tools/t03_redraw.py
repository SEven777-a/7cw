# T-03：從卡片照片解出一維條碼，重繪成手機出示用的圖，並回讀驗證
# 用法：py tools\t03_redraw.py samples\card_front.jpg
# 輸出：samples\redraw_card.png（兩條上下排列，仿卡面）
# 注意：輸出圖等同現金，不要傳給別人、不要進版控
import sys
from io import BytesIO
from pathlib import Path

import barcode
import zxingcpp
from barcode.writer import ImageWriter
from PIL import Image, ImageOps

sys.stdout.reconfigure(encoding="utf-8")

src = Path(sys.argv[1])
img = ImageOps.exif_transpose(Image.open(src))
linear = [r for r in zxingcpp.read_barcodes(img) if r.format != zxingcpp.BarcodeFormat.QRCode]
linear.sort(key=lambda r: r.position.top_left.y)  # 由上到下，與卡面順序一致
if not linear:
    sys.exit("照片中讀不到一維條碼")


def render(text: str, show_text: bool) -> Image.Image:
    """以 Code 128 繪製單條條碼，模組寬取整數像素避免模糊"""
    buf = BytesIO()
    barcode.get("code128", text, writer=ImageWriter()).write(
        buf,
        options={
            "module_width": 0.254,   # 300 dpi 下 = 3 px/模組
            "module_height": 18,
            "quiet_zone": 7.62,      # 30 px ≥ 10 倍模組寬
            "dpi": 300,
            "write_text": show_text,
            "font_size": 12,
            "text_distance": 4,
        },
    )
    buf.seek(0)
    return Image.open(buf).convert("L")


# 上面那條（16 碼卡號）印數字，下面那條（卡面沒印數字）不印
parts = [render(r.text, show_text=len(r.text) == 16) for r in linear]
gap = 60
width = max(p.width for p in parts)
canvas = Image.new("L", (width, sum(p.height for p in parts) + gap * (len(parts) - 1)), 255)
y = 0
for p in parts:
    canvas.paste(p, (0, y))
    y += p.height + gap

out = src.parent / "redraw_card.png"
canvas.save(out)

# 回讀驗證：重繪圖必須解出與原卡完全相同的內容與順序
back = sorted(zxingcpp.read_barcodes(canvas), key=lambda r: r.position.top_left.y)
expect = [r.text for r in linear]
got = [r.text for r in back]
print(f"原卡：{expect}")
print(f"重繪：{got}")
print(f"已輸出 {out}（{canvas.width}x{canvas.height}）")
print("回讀一致，可以拿去門市測試" if got == expect else "回讀不一致，不要拿去門市")
