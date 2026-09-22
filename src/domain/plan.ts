// 配卡演算法（開發指引 §8）
// 純函式：不讀寫 DB、不拋例外、只處理整數

import type { Card, Strategy } from './types';

export interface PlanInput {
  amount: number;
  cards: Card[];
  strategy: Strategy;
  maxCards: number;
  /**
   * 允許為了「多清空一張零頭卡」而比策略 A 多付的現金上限（元）。
   * 未提供、非整數或 <= 0 時一律視為 0，行為與 v1.4 完全相同（策略 B 絕不比策略 A 多付現金）。
   */
  cashTopUpTolerance?: number;
}

export interface PlanLine {
  card: Card;
  deduct: number;
  balanceAfter: number;
}

export interface PlanResult {
  lines: PlanLine[]; // 已依出示順序排列
  covered: number;
  cashTopUp: number;
  fullyConsumedCount: number;
  error?: 'INVALID_AMOUNT';
  warning?: 'NO_CARDS' | 'NEED_CASH';
  note?: 'FALLBACK_TO_MIN_CARDS' | 'CASH_TOPUP_FOR_CLEAR';
}

export interface AllocateResult {
  lines: PlanLine[];
  unusedCards: Card[]; // 手動加入但用不到的卡
  covered: number;
  cashTopUp: number;
  fullyConsumedCount: number;
  error?: 'INVALID_AMOUNT';
}

/** 餘額由小到大；同餘額依 createdAt 由舊到新；再同則依 id，確保輸入順序不影響結果（UT-17） */
export function compareAsc(a: Card, b: Card): number {
  return a.balance - b.balance || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** 最大者：同餘額時取較舊的（§8.3 第 4 點） */
function compareForLargest(a: Card, b: Card): number {
  return b.balance - a.balance || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function usableCards(cards: Card[]): Card[] {
  return cards.filter((c) => c.status === 'active' && Number.isInteger(c.balance) && c.balance > 0).sort(compareAsc);
}

function normalizeMaxCards(maxCards: number): number {
  return Number.isInteger(maxCards) && maxCards >= 1 ? maxCards : 1;
}

/**
 * 依選定的卡計算扣款（§8.6）。
 * 由小到大逐張扣到用盡，最後一張部分使用，因此輸出順序即出示順序。
 */
export function allocate(selectedCards: Card[], amount: number): AllocateResult {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { lines: [], unusedCards: [...selectedCards], covered: 0, cashTopUp: 0, fullyConsumedCount: 0, error: 'INVALID_AMOUNT' };
  }
  const sorted = [...selectedCards].sort(compareAsc);
  const lines: PlanLine[] = [];
  const unusedCards: Card[] = [];
  let remaining = amount;
  for (const card of sorted) {
    const deduct = Math.min(Math.max(card.balance, 0), remaining);
    if (deduct <= 0) {
      unusedCards.push(card);
      continue;
    }
    remaining -= deduct;
    lines.push({ card, deduct, balanceAfter: card.balance - deduct });
  }
  return {
    lines,
    unusedCards,
    covered: amount - remaining,
    cashTopUp: remaining,
    fullyConsumedCount: lines.filter((l) => l.balanceAfter === 0).length,
  };
}

/** 未選卡中 balance >= remaining 的最小者（pool 已由小到大排序） */
function findSmallestCovering(pool: Card[], remaining: number): Card | undefined {
  return pool.find((c) => c.balance >= remaining);
}

function findLargest(pool: Card[]): Card | undefined {
  return [...pool].sort(compareForLargest)[0];
}

function removeFrom(pool: Card[], card: Card): void {
  const i = pool.indexOf(card);
  if (i >= 0) pool.splice(i, 1);
}

/** 策略 A：最少張數（§8.4），回傳選出的卡 */
function pickMinCards(usable: Card[], amount: number, maxCards: number): Card[] {
  const pool = [...usable];
  const picked: Card[] = [];
  let remaining = amount;
  while (picked.length < maxCards && remaining > 0 && pool.length > 0) {
    const cover = findSmallestCovering(pool, remaining);
    if (cover) {
      picked.push(cover);
      remaining = 0;
      break;
    }
    const largest = findLargest(pool)!;
    picked.push(largest);
    removeFrom(pool, largest);
    remaining -= largest.balance;
  }
  return picked;
}

/** 策略 B-1：貪婪清零頭（§8.5），回傳選出的卡 */
function pickGreedyFragments(usable: Card[], amount: number, maxCards: number): Card[] {
  const pool = [...usable];
  const picked: Card[] = [];
  let remaining = amount;

  const fragments = usable.filter((c) => c.balance < amount); // 已由小到大
  for (const f of fragments) {
    if (picked.length >= maxCards - 1 || remaining <= 0) break;
    picked.push(f);
    removeFrom(pool, f);
    remaining -= f.balance;
  }

  while (remaining > 0 && picked.length < maxCards && pool.length > 0) {
    const closing = findSmallestCovering(pool, remaining);
    if (closing) {
      picked.push(closing);
      remaining = 0;
      break;
    }
    const largest = findLargest(pool)!;
    picked.push(largest);
    removeFrom(pool, largest);
    remaining -= largest.balance;
  }
  return picked;
}

function toPlanResult(alloc: AllocateResult): PlanResult {
  const result: PlanResult = {
    lines: alloc.lines,
    covered: alloc.covered,
    cashTopUp: alloc.cashTopUp,
    fullyConsumedCount: alloc.fullyConsumedCount,
  };
  if (result.cashTopUp > 0) result.warning = 'NEED_CASH';
  return result;
}

/** B-2 比較：回傳 true 表示 a 優於 b */
function isBetter(a: PlanResult, b: PlanResult): boolean {
  if (a.cashTopUp !== b.cashTopUp) return a.cashTopUp < b.cashTopUp;
  if (a.fullyConsumedCount !== b.fullyConsumedCount) return a.fullyConsumedCount > b.fullyConsumedCount;
  return a.lines.length < b.lines.length;
}

export function planPayment(input: PlanInput): PlanResult {
  const { amount, strategy } = input;
  if (!Number.isInteger(amount) || amount <= 0) {
    return { lines: [], covered: 0, cashTopUp: 0, fullyConsumedCount: 0, error: 'INVALID_AMOUNT' };
  }
  const usable = usableCards(input.cards);
  if (usable.length === 0) {
    return { lines: [], covered: 0, cashTopUp: amount, fullyConsumedCount: 0, warning: 'NO_CARDS' };
  }
  const maxCards = normalizeMaxCards(input.maxCards);

  const planA = toPlanResult(allocate(pickMinCards(usable, amount, maxCards), amount));
  if (strategy === 'min_cards') return planA;

  const greedyB = toPlanResult(allocate(pickGreedyFragments(usable, amount, maxCards), amount));

  // B-3（v1.5）：容忍度門檻內，允許用小額現金換「多清空一張零頭卡」。
  // tolerance = 0（預設）時 clearsMoreForSmallCash 恆為 false，B-2 的既有判斷完全不受影響。
  const tolerance = Number.isInteger(input.cashTopUpTolerance) && input.cashTopUpTolerance! > 0 ? input.cashTopUpTolerance! : 0;
  const extraCash = greedyB.cashTopUp - planA.cashTopUp; // 相對策略 A 多付的現金
  const clearsMoreForSmallCash = greedyB.fullyConsumedCount > planA.fullyConsumedCount && extraCash > 0 && extraCash <= tolerance;

  if (isBetter(planA, greedyB) && !clearsMoreForSmallCash) {
    if (greedyB.cashTopUp > planA.cashTopUp) planA.note = 'FALLBACK_TO_MIN_CARDS';
    return planA;
  }
  if (clearsMoreForSmallCash) greedyB.note = 'CASH_TOPUP_FOR_CLEAR';
  return greedyB;
}
