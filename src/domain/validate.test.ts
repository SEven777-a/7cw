// scanCompleteness 純函式測試（WP4 子任務 1）：FR-01 補救路徑的分歧點

import { describe, expect, it } from 'vitest';
import { scanCompleteness } from './validate';

describe('scanCompleteness（掃描/解碼結果夠不夠進下一步）', () => {
  it('兩條都讀到 → complete', () => {
    expect(scanCompleteness({ code: '1234567890123456', hiddenCode: 'ABCD1234' })).toBe('complete');
  });

  it('只讀到下方條碼（卡號條碼破損）→ need-code，進手動輸入卡號表單', () => {
    expect(scanCompleteness({ hiddenCode: 'ABCD1234' })).toBe('need-code');
  });

  it('只讀到卡號、下方條碼沒讀到 → need-hidden（hiddenCode 卡面沒印，不可手動輸入）', () => {
    expect(scanCompleteness({ code: '1234567890123456' })).toBe('need-hidden');
  });

  it('兩條都沒讀到 → none', () => {
    expect(scanCompleteness({})).toBe('none');
  });
});
