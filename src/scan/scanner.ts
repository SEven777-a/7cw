// 條碼掃描（§3 掃描）：原生 BarcodeDetector 優先，iOS 走 barcode-detector polyfill
// zxing wasm 從本站載入，不走 CDN（NFR-01）

import { BarcodeDetector as PolyfillDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { classifyBarcode } from '../domain/validate';

interface MinimalDetector {
  detect(source: ImageBitmapSource | HTMLVideoElement): Promise<Array<{ rawValue: string; format: string }>>;
}

let wasmConfigured = false;
let detectorPromise: Promise<MinimalDetector> | null = null;

export function getDetector(): Promise<MinimalDetector> {
  detectorPromise ??= createDetector();
  return detectorPromise;
}

async function createDetector(): Promise<MinimalDetector> {
  const Native = (globalThis as { BarcodeDetector?: { new (o: object): MinimalDetector; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector;
  if (Native) {
    try {
      if ((await Native.getSupportedFormats()).includes('code_128')) return new Native({ formats: ['code_128'] });
    } catch {
      // 原生實作異常時改用 polyfill
    }
  }
  if (!wasmConfigured) {
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    });
    wasmConfigured = true;
  }
  return new PolyfillDetector({ formats: ['code_128'] }) as unknown as MinimalDetector;
}

export interface CardCodes {
  code?: string;
  hiddenCode?: string;
}

/** 從一次偵測結果挑出卡號與隱藏碼（依格式判斷，不依位置） */
export function pickCardCodes(results: Array<{ rawValue: string; format: string }>): CardCodes {
  const found: CardCodes = {};
  for (const r of results) {
    if (r.format !== 'code_128') continue;
    const kind = classifyBarcode(r.rawValue);
    if (kind && !found[kind]) found[kind] = r.rawValue;
  }
  return found;
}

export async function detectCardCodes(source: ImageBitmapSource | HTMLVideoElement): Promise<CardCodes> {
  const detector = await getDetector();
  return pickCardCodes(await detector.detect(source));
}

/** 預先載入 wasm，避免第一次掃描卡頓 */
export function warmUpDetector(): void {
  void getDetector().then((d) => {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    return d.detect(c).catch(() => undefined);
  });
}
