import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages 路徑，網址自上線起固定（開發指引 §3.1）
const BASE = '/7cw/';

// 只在正式建置注入 CSP；開發模式的 HMR 需要 inline script
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

const buildDate = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16);

export default defineConfig(({ command, isPreview }) => ({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(`${process.env.npm_package_version ?? '0.0.0'} · ${buildDate}`),
  },
  plugins: [
    react(),
    cspPlugin(),
    // 手機實機開發需要 HTTPS 才能開相機
    command === 'serve' && !isPreview ? basicSsl() : null,
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: '7-11 商品卡錢包',
        short_name: '商品卡',
        description: '本機管理 7-ELEVEN 商品卡，結帳自動配卡',
        lang: 'zh-TW',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f1ea',
        theme_color: '#f4f1ea',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // NFR-04：含 zxing wasm 全部快取，飛航模式可用
        globPatterns: ['**/*.{js,css,html,wasm,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
}));
