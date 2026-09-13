// 配卡演算法單元測試（開發指引 §10.1）；卡號一律虛構
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate, planPayment, type PlanResult } from './plan';
import type { Card, Strategy } from './types';

let seq = 0;
function card(balance: number, extra: Partial<Card> = {}): Card {
  seq += 1;
  return {
    id: `c${String(seq).padStart(4, '0')}`,
    code: String(1000000000000000 + seq),
    hiddenCode: `T${String(seq).padStart(7, '0')}`,
    format: 'CODE_128',
    faceValue: balance,
    balance,
    balanceSource: 'initial',
    status: 'active',
    createdAt: seq,
    updatedAt: seq,
    ...extra,
  };
}
const cards = (...balances: number[]) => balances.map((b) => card(b));

function plan(amount: number, cs: Card[], strategy: Strategy, maxCards = 6): PlanResult {
  return planPayment({ amount, cards: cs, strategy, maxCards });
}
/** 以 [餘額, 扣款] 表示結果，方便對照規格 */
const summary = (r: PlanResult) => r.lines.map((l) => [l.card.balance, l.deduct]);

describe('§10.1 配卡演算法', () => {
  it('UT-01 單張剛好足夠', () => {
    for (const s of ['min_cards', 'clear_fragments'] as const) {
      const r = plan(100, cards(100), s);
      expect(summary(r)).toEqual([[100, 100]]);
      expect(r.lines[0].balanceAfter).toBe(0);
      expect(r.cashTopUp).toBe(0);
    }
  });

  it('UT-02 單張略多', () => {
    const cs = cards(35, 100, 500);
    expect(summary(plan(85, cs, 'min_cards'))).toEqual([[100, 85]]);
    expect(summary(plan(85, cs, 'clear_fragments'))).toEqual([[35, 35], [100, 50]]);
  });

  it('UT-03 零頭優先', () => {
    const r = plan(200, cards(12, 23, 500), 'clear_fragments');
    expect(summary(r)).toEqual([[12, 12], [23, 23], [500, 165]]);
    expect(r.fullyConsumedCount).toBe(2);
  });

  it('UT-04 達 maxCards 上限', () => {
    const r = plan(300, cards(10, 10, 10, 10, 500), 'clear_fragments', 3);
    expect(summary(r)).toEqual([[10, 10], [10, 10], [500, 280]]);
  });

  it('UT-05 全部加總仍不足', () => {
    for (const s of ['min_cards', 'clear_fragments'] as const) {
      const r = plan(1000, cards(35, 50), s);
      expect(r.covered).toBe(85);
      expect(r.cashTopUp).toBe(915);
      expect(r.warning).toBe('NEED_CASH');
    }
  });

  it('UT-06 無可用卡片', () => {
    for (const s of ['min_cards', 'clear_fragments'] as const) {
      const r = plan(100, [], s);
      expect(r.lines).toEqual([]);
      expect(r.cashTopUp).toBe(100);
      expect(r.warning).toBe('NO_CARDS');
    }
  });

  it('UT-07 餘額為 0 或已封存的卡', () => {
    const target = card(100);
    const cs = [card(0), card(100, { status: 'archived' }), target];
    for (const s of ['min_cards', 'clear_fragments'] as const) {
      const r = plan(50, cs, s);
      expect(r.lines.map((l) => l.card.id)).toEqual([target.id]);
    }
  });

  it('UT-08 金額不合法', () => {
    for (const amount of [0, -50, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const s of ['min_cards', 'clear_fragments'] as const) {
        const r = plan(amount, cards(100), s);
        expect(r.lines).toEqual([]);
        expect(r.error).toBe('INVALID_AMOUNT');
      }
    }
  });

  it('UT-09 單張剛好 vs 貪婪', () => {
    const cs = cards(30, 50);
    for (const s of ['min_cards', 'clear_fragments'] as const) {
      expect(summary(plan(50, cs, s))).toEqual([[50, 50]]);
    }
  });

  it('UT-10 大量零頭卡', () => {
    const cs = [...Array.from({ length: 20 }, () => card(5)), card(1000)];
    const r = plan(500, cs, 'clear_fragments');
    expect(r.lines).toHaveLength(6);
    expect(summary(r)).toEqual([[5, 5], [5, 5], [5, 5], [5, 5], [5, 5], [1000, 475]]);
  });

  it('UT-13 策略 B 不多付現金', () => {
    const r = plan(150, cards(10, 20, 60, 70), 'clear_fragments', 3);
    expect(summary(r)).toEqual([[20, 20], [60, 60], [70, 70]]);
    expect(r.cashTopUp).toBe(0);
    expect(r.note).toBe('FALLBACK_TO_MIN_CARDS');
  });

  it('UT-14 零頭組合優於單張剛好', () => {
    const cs = cards(15, 35, 50);
    expect(summary(plan(50, cs, 'clear_fragments'))).toEqual([[15, 15], [35, 35]]);
    expect(summary(plan(50, cs, 'min_cards'))).toEqual([[50, 50]]);
  });

  it('UT-15 典型小卡結帳', () => {
    const r = plan(187, cards(15, 35, 35, 50, 50, 50, 50), 'clear_fragments');
    expect(summary(r)).toEqual([[15, 15], [35, 35], [35, 35], [50, 50], [50, 50], [50, 2]]);
    expect(r.cashTopUp).toBe(0);
  });

  it('UT-18 手動分配', () => {
    const r = allocate(cards(100, 35), 40);
    expect(summary(r as PlanResult)).toEqual([[35, 35], [100, 5]]);
  });

  it('UT-19 手動分配多餘卡', () => {
    const r = allocate(cards(35, 50, 500), 40);
    expect(summary(r as PlanResult)).toEqual([[35, 35], [50, 5]]);
    expect(r.unusedCards.map((c) => c.balance)).toEqual([500]);
  });
});

describe('§10.1 性質測試（各 1000 組）', () => {
  const walletArb = fc.array(
    fc.record({
      balance: fc.integer({ min: 0, max: 600 }),
      archived: fc.boolean(),
      createdAt: fc.integer({ min: 1, max: 20 }), // 刻意製造同 createdAt
    }),
    { maxLength: 25 },
  );
  const toCards = (w: { balance: number; archived: boolean; createdAt: number }[]) =>
    w.map((x, i) =>
      card(x.balance, { id: `p${String(i).padStart(3, '0')}`, createdAt: x.createdAt, status: x.archived ? 'archived' : 'active' }),
    );
  const params = { numRuns: 1000 };
  const strategyArb = fc.constantFrom<Strategy>('min_cards', 'clear_fragments');
  const amountArb = fc.integer({ min: 1, max: 3000 });
  const maxArb = fc.integer({ min: 1, max: 8 });

  it('UT-11 扣款總和一致性', () => {
    fc.assert(
      fc.property(walletArb, amountArb, strategyArb, maxArb, (w, amount, s, max) => {
        const r = plan(amount, toCards(w), s, max);
        const sum = r.lines.reduce((a, l) => a + l.deduct, 0);
        expect(sum + r.cashTopUp).toBe(amount);
        expect(r.covered).toBe(sum);
        expect(r.lines.length).toBeLessThanOrEqual(max);
      }),
      params,
    );
  });

  it('UT-12 餘額不變性', () => {
    fc.assert(
      fc.property(walletArb, amountArb, strategyArb, maxArb, (w, amount, s, max) => {
        const r = plan(amount, toCards(w), s, max);
        r.lines.forEach((l, i) => {
          expect(l.deduct).toBeGreaterThan(0);
          expect(l.balanceAfter).toBeGreaterThanOrEqual(0);
          expect(l.balanceAfter).toBeLessThanOrEqual(l.card.balance);
          if (i < r.lines.length - 1) expect(l.balanceAfter).toBe(0);
        });
        // §8.6：輸出必須能以 allocate 重算出相同扣款
        const again = allocate(r.lines.map((l) => l.card), amount);
        expect(again.lines.map((l) => [l.card.id, l.deduct])).toEqual(r.lines.map((l) => [l.card.id, l.deduct]));
      }),
      params,
    );
  });

  it('UT-16 B 與 A 現金相同', () => {
    fc.assert(
      fc.property(walletArb, amountArb, maxArb, (w, amount, max) => {
        const cs = toCards(w);
        expect(plan(amount, cs, 'clear_fragments', max).cashTopUp).toBe(plan(amount, cs, 'min_cards', max).cashTopUp);
      }),
      params,
    );
  });

  it('UT-17 結果穩定（打亂輸入順序）', () => {
    fc.assert(
      fc.property(walletArb, amountArb, strategyArb, maxArb, fc.infiniteStream(fc.nat()), (w, amount, s, max, rnd) => {
        const cs = toCards(w);
        const shuffled = [...cs];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = rnd.next().value % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const ids = (r: PlanResult) => r.lines.map((l) => [l.card.id, l.deduct]);
        expect(ids(plan(amount, shuffled, s, max))).toEqual(ids(plan(amount, cs, s, max)));
      }),
      params,
    );
  });
});
