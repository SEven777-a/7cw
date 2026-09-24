// 備份提醒判斷測試（FR-07，v1.9）

import { describe, expect, it } from 'vitest';
import { BACKUP_SNOOZE_DAYS, backupStatus, snoozeUntil } from './backup-reminder';
import type { Card } from './types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-24T12:00:00+08:00');

function card(updatedAt: number, code = '7100000000000011'): Card {
  return {
    id: code,
    code,
    hiddenCode: 'TESTAA01',
    format: 'CODE_128',
    faceValue: 35,
    balance: 35,
    balanceSource: 'initial',
    status: 'active',
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('backupStatus（該不該提醒備份）', () => {
  it('沒有任何卡片 → 不提醒（沒有東西可以損失）', () => {
    expect(backupStatus({ cards: [], now: NOW }).due).toBe(false);
  });

  it('沒有卡片時，即使從未備份也不提醒', () => {
    expect(backupStatus({ cards: [], lastExportAt: undefined, now: NOW }).due).toBe(false);
  });

  it('有卡片但從未備份 → 提醒，reason = never', () => {
    const s = backupStatus({ cards: [card(NOW - DAY)], now: NOW });
    expect(s).toMatchObject({ due: true, reason: 'never', changedCards: 1, daysSinceExport: null });
  });

  it('備份後沒有任何變動、天數也沒到 → 不提醒', () => {
    const s = backupStatus({ cards: [card(NOW - 5 * DAY)], lastExportAt: NOW - 2 * DAY, now: NOW });
    expect(s).toMatchObject({ due: false, reason: null, changedCards: 0 });
  });

  it('備份後有一張卡變動 → 提醒，reason = changes', () => {
    const s = backupStatus({ cards: [card(NOW - DAY)], lastExportAt: NOW - 2 * DAY, now: NOW });
    expect(s).toMatchObject({ due: true, reason: 'changes', changedCards: 1 });
  });

  it('只算上次備份之後變動的那些卡', () => {
    const cards = [card(NOW - 10 * DAY, '7100000000000011'), card(NOW - DAY, '7100000000000029'), card(NOW - 2 * DAY, '7100000000000037')];
    const s = backupStatus({ cards, lastExportAt: NOW - 3 * DAY, now: NOW });
    expect(s.changedCards).toBe(2);
  });

  it('剛好等於上次備份時間的卡不算變動（備份當下的狀態就在檔案裡）', () => {
    const exportAt = NOW - 3 * DAY;
    const s = backupStatus({ cards: [card(exportAt)], lastExportAt: exportAt, now: NOW });
    expect(s).toMatchObject({ due: false, changedCards: 0 });
  });

  it('沒變動但超過保底天數 → 提醒，reason = days', () => {
    const s = backupStatus({ cards: [card(NOW - 40 * DAY)], lastExportAt: NOW - 15 * DAY, now: NOW });
    expect(s).toMatchObject({ due: true, reason: 'days', changedCards: 0, daysSinceExport: 15 });
  });

  it('保底天數差一天還不提醒', () => {
    const s = backupStatus({ cards: [card(NOW - 40 * DAY)], lastExportAt: NOW - 13 * DAY, now: NOW });
    expect(s.due).toBe(false);
  });

  it('變動優先於天數：兩個條件都成立時 reason = changes', () => {
    const s = backupStatus({ cards: [card(NOW - DAY)], lastExportAt: NOW - 20 * DAY, now: NOW });
    expect(s.reason).toBe('changes');
  });

  it('延後期間內一律安靜，即使有變動', () => {
    const s = backupStatus({
      cards: [card(NOW - DAY)],
      lastExportAt: NOW - 2 * DAY,
      snoozedUntil: NOW + DAY,
      now: NOW,
    });
    expect(s.due).toBe(false);
  });

  it('延後到期後恢復提醒', () => {
    const s = backupStatus({
      cards: [card(NOW - DAY)],
      lastExportAt: NOW - 2 * DAY,
      snoozedUntil: NOW - 1,
      now: NOW,
    });
    expect(s).toMatchObject({ due: true, reason: 'changes' });
  });

  it('延後也擋得住「從未備份」（但只能擋到期滿，不能永久關閉）', () => {
    const cards = [card(NOW - DAY)];
    expect(backupStatus({ cards, snoozedUntil: NOW + DAY, now: NOW }).due).toBe(false);
    expect(backupStatus({ cards, snoozedUntil: NOW + DAY, now: NOW + 2 * DAY }).due).toBe(true);
  });

  it('changedCards 與 daysSinceExport 即使不提醒也照算（畫面要顯示）', () => {
    const s = backupStatus({ cards: [card(NOW - DAY)], lastExportAt: NOW - 2 * DAY, snoozedUntil: NOW + DAY, now: NOW });
    expect(s).toMatchObject({ due: false, changedCards: 1, daysSinceExport: 2 });
  });

  it('門檻可調：changeThreshold 調高就要更多張才提醒', () => {
    const cards = [card(NOW - DAY, '7100000000000011'), card(NOW - DAY, '7100000000000029')];
    const base = { cards, lastExportAt: NOW - 2 * DAY, now: NOW };
    expect(backupStatus({ ...base, changeThreshold: 3 }).due).toBe(false);
    expect(backupStatus({ ...base, changeThreshold: 2 }).due).toBe(true);
  });

  it('封存的卡片一樣算變動（封存本身就是要記進備份的狀態）', () => {
    const archived: Card = { ...card(NOW - DAY), status: 'archived' };
    expect(backupStatus({ cards: [archived], lastExportAt: NOW - 2 * DAY, now: NOW }).due).toBe(true);
  });
});

describe('snoozeUntil（延後上限）', () => {
  it('預設延後 3 天', () => {
    expect(snoozeUntil(NOW)).toBe(NOW + 3 * DAY);
  });

  it('要求超過上限也只給 3 天（FR-07：不可關閉，只能延後）', () => {
    expect(snoozeUntil(NOW, 30)).toBe(NOW + BACKUP_SNOOZE_DAYS * DAY);
  });

  it('要求少於上限就照給', () => {
    expect(snoozeUntil(NOW, 1)).toBe(NOW + DAY);
  });
});
