// Code 128 條碼繪製（FR-04）
// JsBarcode 只負責編碼成 0/1 模組序列，繪製自己控制，確保模組寬為整數實體像素

import JsBarcode from 'jsbarcode';

/** 出示版面集中定義；T-03 / FT-01 若發現店員掃法不同，只改這裡 */
export const BARCODE_LAYOUT = {
  order: ['code', 'hiddenCode'] as const, // 仿卡面：上卡號、下隱藏碼
  barHeightCss: 96, // 單條條碼高度（CSS px）
  gapRatio: 0.5, // 兩條間距 / 條碼高度，規格要求 ≥ 1/3
  quietModules: 10, // 左右靜區，規格要求 ≥ 10 倍模組寬
  maxWidthCss: 420, // 條碼最大寬度
  codeTextSizeCss: 16, // 卡號數字字級
};

/** 回傳 '1011…' 模組序列（1 = 黑條） */
export function encodeCode128(text: string): string {
  const target: { encodings?: { data: string }[] } = {};
  JsBarcode(target, text, { format: 'CODE128' });
  return (target.encodings ?? []).map((e) => e.data).join('');
}

export interface BarcodeGeometry {
  modulePx: number;
  widthPx: number;
  bars: Array<{ x: number; w: number }>; // 黑條的 x 與寬，單位實體像素
}

/** 依可用寬度（實體像素）決定整數模組寬並計算每條黑條位置 */
export function barcodeGeometry(bits: string, availableWidthPx: number, quietModules = BARCODE_LAYOUT.quietModules): BarcodeGeometry {
  const totalModules = bits.length + quietModules * 2;
  const modulePx = Math.max(1, Math.floor(availableWidthPx / totalModules));
  const bars: BarcodeGeometry['bars'] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let j = i;
      while (j < bits.length && bits[j] === '1') j++;
      bars.push({ x: (quietModules + i) * modulePx, w: (j - i) * modulePx });
      i = j;
    } else {
      i++;
    }
  }
  return { modulePx, widthPx: totalModules * modulePx, bars };
}

/**
 * 在 canvas 上畫一條條碼：白底黑條，依 devicePixelRatio 使用實體像素。
 * showText 為 true 時在條碼下方印出內容（只用於 16 碼卡號）。
 */
export function drawBarcode(
  canvas: HTMLCanvasElement,
  text: string,
  opts: { cssWidth: number; cssHeight: number; showText: boolean; dpr?: number },
): void {
  const dpr = opts.dpr ?? window.devicePixelRatio ?? 1;
  const geo = barcodeGeometry(encodeCode128(text), Math.floor(opts.cssWidth * dpr));
  const barHeight = Math.round(opts.cssHeight * dpr);
  const textSize = Math.round(BARCODE_LAYOUT.codeTextSizeCss * dpr);
  const textBlock = opts.showText ? Math.round(textSize * 1.6) : 0;

  canvas.width = geo.widthPx;
  canvas.height = barHeight + textBlock;
  canvas.style.width = `${geo.widthPx / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (const bar of geo.bars) ctx.fillRect(bar.x, 0, bar.w, barHeight);

  if (opts.showText) {
    ctx.font = `${textSize}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 每 4 碼空一格方便店員核對
    ctx.fillText(text.replace(/(.{4})(?=.)/g, '$1 '), canvas.width / 2, barHeight + textBlock / 2);
  }
}
