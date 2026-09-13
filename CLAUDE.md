# 7cw — 7-ELEVEN 商品卡本機錢包（PWA）

規格與決策一律以 `7-11-商品卡錢包-開發指引.md` 為準（進度見 §11，待確認見 §12）。

## 技術棧
React 19 + Vite 8 + TypeScript 7、idb、barcode-detector（zxing-wasm）、JsBarcode（只用來編碼）、vite-plugin-pwa、Vitest + fake-indexeddb + fast-check。

## 部署
- 網址固定：https://seven777-a.github.io/7cw/ （repo `SEven777-a/7cw`，Vite `base: '/7cw/'`）。**不可改 repo 名或帳號名**，否則手機資料全失。
- 推 `main` → GitHub Actions 跑測試、建置、部署 Pages（`.github/workflows/deploy.yml`）。

## 指令（PowerShell，在專案根目錄）
- `npm test`：單元測試（演算法、資料層、條碼回讀）
- `npm run typecheck`
- `npm run dev`：HTTPS 開發伺服器，手機同網段可連（自簽憑證要手動信任）
- `npm run build:browser` 後 `npx vite preview`：電腦瀏覽器預覽（允許分頁模式，不可部署）
- `node tools/js_detect.mjs samples\xxx.jpg`：用 App 同一套解碼器讀卡片照片（輸出遮罩）

## 結構
- `src/domain/`：型別、格式驗證、配卡演算法（純函式）
- `src/db/db.ts`：IndexedDB；需一致性的寫入都在單一 transaction
- `src/barcode/code128.ts`：`BARCODE_LAYOUT` 出示版面常數（FT-01 結果只改這裡）
- `src/scan/`：掃描（原生優先、polyfill 備援，wasm 從本站載入）與照片壓縮
- `src/screens/`：各畫面；`src/app/wallet.tsx`：全域狀態與導覽

## Lessons Learned
- 資料夾名稱含中文，`npm init -y` 會失敗；之後 `npm install` 會往上找到 `C:\Users\sn698\package.json` 裝錯地方。本專案已有 package.json，不要再 init。
- `vite preview` 也是 `command === 'serve'`，basic-ssl 要用 `!isPreview` 排除，否則預覽變 HTTPS 打不開。
- zxing-wasm 預設從 jsDelivr 抓 wasm，必須 `prepareZXingModule` 覆寫 `locateFile`；bundle 內仍會留有 jsdelivr 字串，屬正常（CSP 也會擋）。
- 真實卡號、照片、`*.bak-*`（舊版指引含實卡號）不進版控；測試一律用虛構卡號。
