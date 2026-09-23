// splitArchiveTargets 純函式測試（FR-06）：用完的直接封存，有餘額的才問

import { describe, expect, it } from 'vitest';
import { splitArchiveTargets } from './archive';

describe('splitArchiveTargets（回填後的封存分流）', () => {
  it('餘額 0 → 直接封存，不進詢問清單', () => {
    expect(splitArchiveTargets([{ cardId: 'a', balanceAfter: 0 }], 0)).toEqual({ emptied: ['a'], lowBalance: [] });
  });

  it('還有餘額 → 不封存也不詢問（門檻 0 時）', () => {
    expect(splitArchiveTargets([{ cardId: 'a', balanceAfter: 5 }], 0)).toEqual({ emptied: [], lowBalance: [] });
  });

  it('餘額低於門檻但不是 0 → 進詢問清單，不自動封存', () => {
    expect(splitArchiveTargets([{ cardId: 'a', balanceAfter: 5 }], 10)).toEqual({ emptied: [], lowBalance: ['a'] });
  });

  it('餘額剛好等於門檻 → 仍是詢問，不自動封存', () => {
    expect(splitArchiveTargets([{ cardId: 'a', balanceAfter: 10 }], 10)).toEqual({ emptied: [], lowBalance: ['a'] });
  });

  it('餘額超過門檻 → 兩邊都不進', () => {
    expect(splitArchiveTargets([{ cardId: 'a', balanceAfter: 11 }], 10)).toEqual({ emptied: [], lowBalance: [] });
  });

  it('一筆交易混合多張卡 → 依餘額分流，順序與輸入一致', () => {
    const lines = [
      { cardId: 'empty1', balanceAfter: 0 },
      { cardId: 'low', balanceAfter: 3 },
      { cardId: 'rich', balanceAfter: 300 },
      { cardId: 'empty2', balanceAfter: 0 },
    ];
    expect(splitArchiveTargets(lines, 5)).toEqual({ emptied: ['empty1', 'empty2'], lowBalance: ['low'] });
  });

  it('balanceAfter 未定義（沒回填到）→ 狀態不明，兩邊都不歸', () => {
    expect(splitArchiveTargets([{ cardId: 'a' }], 10)).toEqual({ emptied: [], lowBalance: [] });
  });

  it('門檻非正整數一律視為 0，用完的卡仍自動封存', () => {
    for (const threshold of [-5, 0, 2.5, NaN, Infinity]) {
      expect(splitArchiveTargets([{ cardId: 'a', balanceAfter: 0 }, { cardId: 'b', balanceAfter: 3 }], threshold)).toEqual({
        emptied: ['a'],
        lowBalance: [],
      });
    }
  });

  it('餘額為負（資料異常）→ 當作用完，直接封存', () => {
    expect(splitArchiveTargets([{ cardId: 'a', balanceAfter: -1 }], 0)).toEqual({ emptied: ['a'], lowBalance: [] });
  });

  it('空交易 → 兩邊都空', () => {
    expect(splitArchiveTargets([], 10)).toEqual({ emptied: [], lowBalance: [] });
  });
});
