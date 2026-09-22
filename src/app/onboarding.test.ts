// shouldShowOnboarding 純函式測試（WP2）：導頁規則，回填優先於新手引導

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { Settings, Transaction } from '../domain/types';
import { shouldShowOnboarding } from './onboarding';

const notDone: Settings = { ...DEFAULT_SETTINGS, onboardingDone: false };
const done: Settings = { ...DEFAULT_SETTINGS, onboardingDone: true };

const pendingTx: Transaction = {
  id: 'tx-1',
  status: 'pending',
  createdAt: Date.now(),
  totalAmount: 100,
  strategyUsed: 'clear_fragments',
  lines: [],
  cashTopUp: 0,
};

describe('shouldShowOnboarding（導頁規則，FR-05 回填優先）', () => {
  it('未完成引導 + 無 pending → true', () => {
    expect(shouldShowOnboarding(notDone, undefined, 0)).toBe(true);
  });

  it('未完成引導 + 有 pending → false（回填優先，不得被 onboarding 蓋過）', () => {
    expect(shouldShowOnboarding(notDone, pendingTx, 0)).toBe(false);
  });

  it('已完成引導 + 無 pending → false', () => {
    expect(shouldShowOnboarding(done, undefined, 0)).toBe(false);
  });

  it('已完成引導 + 有 pending → false', () => {
    expect(shouldShowOnboarding(done, pendingTx, 0)).toBe(false);
  });

  it('未完成引導 + 無 pending + 已經有卡 → false（既有使用者不該被導去新手引導）', () => {
    expect(shouldShowOnboarding(notDone, undefined, 3)).toBe(false);
  });

  it('未完成引導 + 無 pending + 剛好 1 張卡 → false（邊界）', () => {
    expect(shouldShowOnboarding(notDone, undefined, 1)).toBe(false);
  });
});
