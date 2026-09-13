# T-01：判定卡片上所有條碼的格式與內容
# 用法：py tools\t01_detect.py samples\card_front.jpg
import sys

import zxingcpp
from PIL import Image, ImageOps

sys.stdout.reconfigure(encoding="utf-8")

img = ImageOps.exif_transpose(Image.open(sys.argv[1]))  # 依手機拍攝方向轉正
results = zxingcpp.read_barcodes(img)

if not results:
    print("讀不到任何條碼：換一張正對、清楚、無反光的照片")

# 依畫面由上到下排序，方便對照卡面位置
results.sort(key=lambda r: r.position.top_left.y)
for i, r in enumerate(results, 1):
    p = r.position.top_left
    print(f"[{i}] 格式={r.format} | 識別碼={r.symbology_identifier} | 長度={len(r.text)} | 位置=({p.x},{p.y})")
    print(f"    內容={r.text}")
