// 用 App 相同的 zxing-wasm 解碼器讀卡片照片，確認分類規則（輸出遮罩，不印完整卡號與隱藏碼）
// 用法：node tools/js_detect.mjs samples/card_front.jpg
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { prepareZXingModule, readBarcodesFromImageFile } from 'zxing-wasm/reader';

const require = createRequire(import.meta.url);
prepareZXingModule({
  overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')).buffer },
});

const file = process.argv[2];
const results = await readBarcodesFromImageFile(new Blob([readFileSync(file)]), { formats: ['Code128'] });
const mask = (t) => t.slice(0, 2) + '*'.repeat(Math.max(0, t.length - 4)) + t.slice(-2);
const classify = (t) => (/^\d{16}$/.test(t) ? 'code' : /^[0-9A-Z]{8}$/.test(t) ? 'hiddenCode' : '不符規則');
if (results.length === 0) console.log('讀不到 Code 128');
for (const r of results) {
  console.log(`${r.format} ${r.symbologyIdentifier} 長度=${r.text.length} 內容=${mask(r.text)} → ${classify(r.text)}`);
}
