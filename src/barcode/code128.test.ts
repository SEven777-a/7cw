// 重繪條碼回讀驗證：用與手機相同的 zxing 解碼器確認繪出的條碼可被讀回原內容（卡號虛構）
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { prepareZXingModule, readBarcodesFromImageData } from 'zxing-wasm/reader';
import { barcodeGeometry, encodeCode128 } from './code128';

const require = createRequire(import.meta.url);
prepareZXingModule({
  overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')).buffer as ArrayBuffer },
});

/** 依幾何資訊產生 RGBA 影像（與 canvas 繪製同一套座標） */
function rasterize(text: string, widthPx: number, heightPx = 120) {
  const geo = barcodeGeometry(encodeCode128(text), widthPx);
  const data = new Uint8ClampedArray(geo.widthPx * heightPx * 4).fill(255);
  for (const bar of geo.bars) {
    for (let y = 0; y < heightPx; y++) {
      for (let x = bar.x; x < bar.x + bar.w; x++) {
        const p = (y * geo.widthPx + x) * 4;
        data[p] = data[p + 1] = data[p + 2] = 0;
      }
    }
  }
  return { geo, image: { data, width: geo.widthPx, height: heightPx, colorSpace: 'srgb' } as ImageData };
}

describe('Code 128 重繪', () => {
  it.each([
    ['16 碼卡號', '1234567890120001'],
    ['8 碼隱藏碼', 'AB12CD01'],
    ['全數字隱藏碼', '00112233'],
  ])('%s 可回讀', async (_, text) => {
    for (const width of [400, 1170]) {
      const { geo, image } = rasterize(text, width);
      expect(Number.isInteger(geo.modulePx)).toBe(true);
      expect(geo.widthPx).toBeLessThanOrEqual(width);
      const results = await readBarcodesFromImageData(image, { formats: ['Code128'], tryHarder: false });
      expect(results.map((r) => [r.format, r.text])).toEqual([['Code128', text]]);
      expect(results[0].symbologyIdentifier).toBe(']C0');
    }
  });

  it('模組寬至少 1px 且留足靜區', () => {
    const bits = encodeCode128('1234567890120001');
    const geo = barcodeGeometry(bits, 50);
    expect(geo.modulePx).toBe(1);
    expect(geo.bars[0].x).toBeGreaterThanOrEqual(10 * geo.modulePx);
  });
});
