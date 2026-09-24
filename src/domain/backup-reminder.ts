// FR-07 備份提醒（v1.9 改版）
//
// 舊規格是「超過 14 天未匯出就提醒」。實際用起來這個條件是錯的方向：
// 14 天沒動過卡，既有的備份檔其實還是完全正確的，這時候跳提醒只會訓練使用者無視它；
// 反過來，一個週末刷了三次，隔天備份就已經過期了，但天數還沒到。
//
// 所以改成**以「備份檔和現實的落差」為主、天數為保底**：
// 只要有卡片在上次備份之後變動過，備份就是舊的，該重做。
//
// 落差不另外維護計數器，直接從 Card.updatedAt 算：
// 新增卡（createdAt = updatedAt）、回填餘額（confirmTransaction 寫 updatedAt）、
// 封存與還原（updateCard 寫 updatedAt）全都會被算進去，不會漏掉任何一個呼叫點。

import type { Card } from './types';

/** 保底天數：即使完全沒動過卡，超過這麼久也提醒一次（沿用舊規格的 14 天） */
export const BACKUP_DAY_THRESHOLD = 14;
/** 幾張卡變動就算落差。1 = 只要動過一張就提醒 */
export const BACKUP_CHANGE_THRESHOLD = 1;
/** §5 FR-07：提醒不可關閉，只能延後，最多 3 天 */
export const BACKUP_SNOOZE_DAYS = 3;

const DAY = 24 * 60 * 60 * 1000;

export type BackupDueReason =
  | 'never' // 有卡片但從來沒備份過
  | 'changes' // 上次備份後卡片有變動
  | 'days'; // 沒變動，但太久沒備份了

export interface BackupStatus {
  due: boolean;
  reason: BackupDueReason | null;
  /** 上次備份後變動過的卡片數 */
  changedCards: number;
  /** 距離上次備份幾天；從未備份為 null */
  daysSinceExport: number | null;
}

export interface BackupStatusInput {
  /** 全部卡片，含已封存 */
  cards: Card[];
  lastExportAt?: number;
  snoozedUntil?: number;
  now: number;
  dayThreshold?: number;
  changeThreshold?: number;
}

export function backupStatus({
  cards,
  lastExportAt,
  snoozedUntil,
  now,
  dayThreshold = BACKUP_DAY_THRESHOLD,
  changeThreshold = BACKUP_CHANGE_THRESHOLD,
}: BackupStatusInput): BackupStatus {
  const daysSinceExport = lastExportAt === undefined ? null : Math.floor((now - lastExportAt) / DAY);
  const changedCards = lastExportAt === undefined ? cards.length : cards.filter((c) => c.updatedAt > lastExportAt).length;
  const idle: BackupStatus = { due: false, reason: null, changedCards, daysSinceExport };

  // 一張卡都沒有就沒有東西可以損失，不要對著空錢包嘮叨
  if (cards.length === 0) return idle;
  // 延後期間一律安靜。呼叫端負責把延後上限壓在 BACKUP_SNOOZE_DAYS
  if (snoozedUntil !== undefined && now < snoozedUntil) return idle;

  if (lastExportAt === undefined) return { ...idle, due: true, reason: 'never' };
  if (changedCards >= changeThreshold) return { ...idle, due: true, reason: 'changes' };
  if (daysSinceExport !== null && daysSinceExport >= dayThreshold) return { ...idle, due: true, reason: 'days' };
  return idle;
}

/** 延後到什麼時候（上限 BACKUP_SNOOZE_DAYS，不提供永久關閉） */
export function snoozeUntil(now: number, days = BACKUP_SNOOZE_DAYS): number {
  return now + Math.min(days, BACKUP_SNOOZE_DAYS) * DAY;
}

/** 提醒橫幅上的一句話 */
export function backupDueMessage(status: BackupStatus): string {
  switch (status.reason) {
    case 'never':
      return '這支手機還沒有任何備份。手機出事的話，卡片救不回來。';
    case 'changes':
      return `上次備份之後有 ${status.changedCards} 張卡變動過，備份檔已經是舊的了。`;
    case 'days':
      return `已經 ${status.daysSinceExport} 天沒有備份了。`;
    default:
      return '';
  }
}
