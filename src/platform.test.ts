// canUseWallet() 平台判斷測試（WP1）：environment 為 node，沒有 jsdom，用 vi.stubGlobal 模擬
import { afterEach, describe, expect, it, vi } from 'vitest';

const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
  androidLine:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Line/14.0.0',
  androidFacebook:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 [FBAN/EMA;FBAV/400.0.0]',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  samsungInternet:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
};

/** 模擬 navigator / window，並強制 ALLOW_BROWSER_MODE 為 false（platform.ts 以 import.meta.env 決定） */
function stub({ ua, standalone, iosStandaloneFlag = false }: { ua: string; standalone: boolean; iosStandaloneFlag?: boolean }) {
  vi.stubGlobal('navigator', {
    userAgent: ua,
    platform: '',
    maxTouchPoints: 0,
    standalone: iosStandaloneFlag,
  });
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({
      matches: query === '(display-mode: standalone)' ? standalone : false,
    }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

/**
 * 每次都用全新的 module instance 載入，避免 ALLOW_BROWSER_MODE 等模組層常數被快取汙染。
 * vitest 預設 import.meta.env.DEV === true（MODE 是 'test' 不是 'production'），
 * 若不 stub 掉，ALLOW_BROWSER_MODE 永遠是 true，canUseWallet() 就測不出平台差異。
 */
async function loadCanUseWallet() {
  vi.stubEnv('DEV', false);
  const mod = await import('./platform');
  return mod.canUseWallet;
}

describe('canUseWallet（Android 平權）', () => {
  it('iOS + standalone → true', async () => {
    stub({ ua: UA.iphoneSafari, standalone: true, iosStandaloneFlag: true });
    const canUseWallet = await loadCanUseWallet();
    expect(canUseWallet()).toBe(true);
  });

  it('iOS + 非 standalone → false', async () => {
    stub({ ua: UA.iphoneSafari, standalone: false, iosStandaloneFlag: false });
    const canUseWallet = await loadCanUseWallet();
    expect(canUseWallet()).toBe(false);
  });

  it('Android Chrome + 非 standalone → true（本次修的行為，回歸測試）', async () => {
    stub({ ua: UA.androidChrome, standalone: false });
    const canUseWallet = await loadCanUseWallet();
    expect(canUseWallet()).toBe(true);
  });

  it('Android + standalone → true', async () => {
    stub({ ua: UA.androidChrome, standalone: true });
    const canUseWallet = await loadCanUseWallet();
    expect(canUseWallet()).toBe(true);
  });

  it('桌機（非 iOS 非 Android）+ 非 standalone → false', async () => {
    stub({ ua: UA.desktopChrome, standalone: false });
    const canUseWallet = await loadCanUseWallet();
    expect(canUseWallet()).toBe(false);
  });

  it('Android + LINE 內建瀏覽器 + 非 standalone → false', async () => {
    stub({ ua: UA.androidLine, standalone: false });
    const canUseWallet = await loadCanUseWallet();
    expect(canUseWallet()).toBe(false);
  });

  it('Android + Facebook 內建瀏覽器 + 非 standalone → false', async () => {
    stub({ ua: UA.androidFacebook, standalone: false });
    const canUseWallet = await loadCanUseWallet();
    expect(canUseWallet()).toBe(false);
  });

  it('Android + WebView（UA 含 "; wv)"）+ 非 standalone → false', async () => {
    stub({ ua: UA.androidWebView, standalone: false });
    const canUseWallet = await loadCanUseWallet();
    expect(canUseWallet()).toBe(false);
  });

  /**
   * Samsung Internet 是**獨立瀏覽器**（自己的 profile、支援安裝 PWA、分頁與它安裝的 PWA 共用儲存），
   * 不是 App 內建 WebView，所以放行——與 Chrome 同理。
   *
   * 「在 A 瀏覽器存的卡，用 B 瀏覽器打不開」是所有瀏覽器的本質，不是 Samsung 特有；
   * 真正該擋的是 WebView：它裝不了主畫面，而且各 App 各自一份儲存、容易被清。
   * 這條測試把這個決策釘住，避免日後有人看到 `isInAppBrowser()` 沒列 SamsungBrowser
   * 以為是漏掉而「順手補上」，反而把正常使用者擋在門外。
   */
  it('Android + Samsung Internet + 非 standalone → true（獨立瀏覽器，與 Chrome 同理）', async () => {
    stub({ ua: UA.samsungInternet, standalone: false });
    const canUseWallet = await loadCanUseWallet();
    expect(canUseWallet()).toBe(true);
  });
});
