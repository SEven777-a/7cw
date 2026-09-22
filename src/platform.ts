// 平台判斷與瀏覽器能力（§6.1、§6.3、FR-04 Wake Lock）

export const ALLOW_BROWSER_MODE = import.meta.env.DEV || import.meta.env.VITE_ALLOW_BROWSER_MODE === 'true';

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Android 裝置 */
export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/** App 內建瀏覽器（WebView）：儲存與獨立瀏覽器隔離，且無法加入主畫面 */
export function isInAppBrowser(): boolean {
  return /; wv\)|Line\/|FBAN|FBAV|FB_IAB|Instagram/.test(navigator.userAgent);
}

/** 可否使用錢包（寫入功能） */
export function canUseWallet(): boolean {
  if (ALLOW_BROWSER_MODE || isStandalone()) return true;
  // Android 獨立瀏覽器：分頁與已安裝 PWA 共用儲存，不必強制先安裝；
  // 但 WebView 儲存隔離且裝不了主畫面，維持擋住。
  return isAndroid() && !isInAppBrowser();
}

/** 申請持久化儲存，降低被瀏覽器清除的機率 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function isStoragePersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null;
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
