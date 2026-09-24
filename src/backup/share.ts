// 產生備份檔並交給使用者存起來。備份頁與提醒橫幅共用這一條路徑。
//
// 為什麼不能做到「設定一次路徑、之後自動寫入」：
// 能記住檔案位置再寫回去的 File System Access API，iOS Safari 與 Android Chrome 都不支援；
// OPFS 雖然能寫，但清除網站資料就一起沒，當備份等於沒備份。
// navigator.share 每次都需要使用者手勢，這一下省不掉，只能把前面的步驟壓到最少。

import { exportBackup, markExported } from './backup';
import type { WalletDB } from '../db/db';

export type ShareOutcome = 'saved' | 'cancelled';

export async function createAndShareBackup(db: WalletDB, password: string): Promise<ShareOutcome> {
  const { bytes, filename } = await exportBackup(db, password);
  const file = new File([bytes as BlobPart], filename, { type: 'application/octet-stream' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '7cw 備份' });
    } catch (e) {
      // 在分享面板按取消：沒有產生檔案，不能記成備份過
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 立刻 revoke 有機會讓下載中途斷掉，留一段時間再收
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  await markExported(db);
  return 'saved';
}
