// 新手引導導頁判斷（WP2）：抽成純函式以便測試，避免這條路由規則以後被改壞

import type { Settings, Transaction } from '../domain/types';

/**
 * 是否應該在啟動時導向新手引導。
 *
 * 三個條件都要成立才顯示：
 * 1. FR-05 回填優先：有未回填交易時一律不顯示。卡片已在現實中被扣款，
 *    這比新手引導重要得多，不得被 onboarding 蓋過。
 * 2. 尚未完成引導。
 * 3. 這支手機還沒有任何卡片。
 *
 * 第 3 點是給既有使用者的：`onboardingDone` 是後來才加的欄位，在它存在之前就在用這個
 * App 的人，旗標一直是預設的 false，更新後會莫名其妙被導去看新手引導。
 * 「已經有卡」是「早就會用了」最可靠的證據，比一個從沒被寫過的旗標可靠，
 * 等於幫既有使用者做一次隱含的 migration。
 */
export function shouldShowOnboarding(
  settings: Settings,
  pending: Transaction | undefined,
  cardCount: number,
): boolean {
  if (pending) return false;
  if (settings.onboardingDone) return false;
  return cardCount === 0;
}
