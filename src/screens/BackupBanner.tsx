// FR-07 備份提醒橫幅
//
// 出現時機由 backupStatus() 決定（見 domain/backup-reminder.ts）：主要看「備份檔與現實的落差」，
// 所以刷完卡、回填完餘額之後它會自己跳出來——那正是最該備份、而且使用者手上還有脈絡的時刻。
//
// 依 §5 FR-07，提醒不可關閉，只能延後最多 3 天。這裡不提供「不再顯示」。

import { useState } from 'react';
import { useWallet } from '../app/wallet';
import { createAndShareBackup } from '../backup/share';
import { saveSettings } from '../db/db';
import { backupDueMessage, backupStatus, snoozeUntil } from '../domain/backup-reminder';

export function BackupBanner() {
  const { db, cards, archived, settings, reload, go, toast } = useWallet();
  const [busy, setBusy] = useState(false);

  const status = backupStatus({
    cards: [...cards, ...archived],
    lastExportAt: settings.lastExportAt,
    snoozedUntil: settings.backupReminderSnoozedUntil,
    now: Date.now(),
  });
  if (!status.due) return null;

  // 沒記住密碼就沒辦法一鍵，導去備份頁讓他設定
  const oneTap = settings.rememberBackupPassword && !!settings.backupPassword;

  async function backupNow() {
    if (!oneTap) return go({ name: 'backup' });
    setBusy(true);
    try {
      const outcome = await createAndShareBackup(db, settings.backupPassword!);
      await reload();
      toast(outcome === 'saved' ? '已備份' : '已取消，這次沒有建立備份');
    } catch (e) {
      toast(e instanceof Error ? e.message : '備份失敗');
    } finally {
      setBusy(false);
    }
  }

  async function snooze() {
    await saveSettings(db, { backupReminderSnoozedUntil: snoozeUntil(Date.now()) });
    await reload();
    toast('3 天後再提醒你');
  }

  return (
    <div className="callout warn backup-banner">
      <b>該備份了</b>
      <p>{backupDueMessage(status)}</p>
      <button className="primary block" disabled={busy} onClick={() => void backupNow()}>
        {busy ? '加密中…' : oneTap ? '立即備份' : '去設定備份'}
      </button>
      <button className="link block" disabled={busy} onClick={() => void snooze()}>
        3 天後再說
      </button>
    </div>
  );
}
