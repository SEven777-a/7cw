// groupByFaceValue 純函式測試（FR-02 同面額分組）

import { describe, expect, it } from 'vitest';
import { groupByFaceValue } from './group';
import type { Card } from './types';

let seq = 0;
function card(faceValue: number, balance: number, balanceSource: Card['balanceSource'] = 'initial'): Card {
  seq += 1;
  return {
    id: `c${seq}`,
    code: `710000000000${String(seq).padStart(4, '0')}`,
    hiddenCode: 'TEST0000',
    format: 'CODE_128',
    faceValue,
    balance,
    balanceSource,
    status: 'active',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('groupByFaceValue（卡片清單依面額分組）', () => {
  it('沒有卡 → 沒有分組', () => {
    expect(groupByFaceValue([])).toEqual([]);
  });

  it('同面額收成一組，面額由小到大', () => {
    const groups = groupByFaceValue([card(50, 50), card(35, 35), card(50, 50), card(35, 35), card(35, 35)]);
    expect(groups.map((g) => [g.faceValue, g.cards.length, g.total])).toEqual([
      [35, 3, 105],
      [50, 2, 100],
    ]);
  });

  it('組內保持傳入順序（清單已依餘額排序）', () => {
    const a = card(50, 12);
    const b = card(50, 30);
    const c = card(50, 50);
    expect(groupByFaceValue([a, b, c])[0].cards.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it('計算已用過的張數，並標記是否含推算餘額', () => {
    const [g] = groupByFaceValue([card(50, 12, 'estimated'), card(50, 50), card(50, 0, 'receipt')]);
    expect(g.usedCount).toBe(2);
    expect(g.hasEstimated).toBe(true);
    expect(groupByFaceValue([card(35, 35)])[0].hasEstimated).toBe(false);
  });
});
