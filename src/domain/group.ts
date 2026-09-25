// FR-02 卡片清單分組：同面額的卡收成一筆，點開才看個別卡片

import type { Card } from './types';

export interface FaceGroup {
  faceValue: number;
  cards: Card[]; // 保持傳入順序（清單已依餘額由小到大排序）
  total: number; // 這組的餘額合計
  usedCount: number; // 已用過部分（餘額 < 面額）的張數
  hasEstimated: boolean; // 有推算餘額時，合計也要標成推算值
}

/** 依面額分組，面額由小到大 */
export function groupByFaceValue(cards: Card[]): FaceGroup[] {
  const map = new Map<number, FaceGroup>();
  for (const c of cards) {
    let g = map.get(c.faceValue);
    if (!g) {
      g = { faceValue: c.faceValue, cards: [], total: 0, usedCount: 0, hasEstimated: false };
      map.set(c.faceValue, g);
    }
    g.cards.push(c);
    g.total += c.balance;
    if (c.balance < c.faceValue) g.usedCount += 1;
    if (c.balanceSource === 'estimated') g.hasEstimated = true;
  }
  return [...map.values()].sort((a, b) => a.faceValue - b.faceValue);
}
