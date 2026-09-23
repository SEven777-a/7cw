// FR-06 封存分流：回填完成後，哪些卡直接封存、哪些要問過使用者

/** 只取封存判斷需要的欄位，測試不必造整筆 Transaction */
export interface ArchivableLine {
  cardId: string;
  balanceAfter?: number;
}

export interface ArchiveTargets {
  /** 餘額剛好用完，直接封存不詢問 */
  emptied: string[];
  /** 還有餘額但低於門檻，詢問後才封存 */
  lowBalance: string[];
}

/**
 * 依回填後的餘額決定封存方式。
 *
 * - `balanceAfter === 0`：卡片已經用完，直接封存。封存是可逆的（「已封存」頁可還原），
 *   而且留著只會讓每次結帳建議都要重新掃過一堆空卡，問一次也沒有多一分保障。
 *   FR-06「不自動刪除」講的是**刪除**，這裡不刪任何東西。
 * - `0 < balanceAfter <= threshold`：還有錢，封存就代表這筆錢不再進入配卡建議，
 *   必須由使用者決定，維持詢問。
 * - `balanceAfter` 未定義（這張沒回填到）：狀態不明，兩邊都不歸，不動它。
 *
 * threshold 非正整數時一律視為 0（等於關閉「低餘額詢問」，只剩自動封存）。
 */
export function splitArchiveTargets(lines: ArchivableLine[], archiveThreshold: number): ArchiveTargets {
  const threshold = Number.isInteger(archiveThreshold) && archiveThreshold > 0 ? archiveThreshold : 0;
  const emptied: string[] = [];
  const lowBalance: string[] = [];

  for (const line of lines) {
    const balance = line.balanceAfter;
    if (balance === undefined) continue;
    if (balance <= 0) emptied.push(line.cardId);
    else if (balance <= threshold) lowBalance.push(line.cardId);
  }

  return { emptied, lowBalance };
}
