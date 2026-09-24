// FR-07 備份與還原
//
// 輸出方式刻意優先用 navigator.share({ files })：iOS 主畫面模式（standalone）下
// <a download> 不可靠，分享面板才能存到「檔案」或傳給自己。桌機與不支援的環境退回下載連結。

import { useRef, useState } from 'react';
import { useWallet } from '../app/wallet';
import { exportBackup, importBackup, markExported, type ImportMode, type ImportResult } from '../backup/backup';
import { BackupFormatError } from '../backup/format';
import { Header } from '../ui/common';

type Busy = 'export' | 'import' | null;

export function BackupScreen() {
  const { db, go, reload, settings, toast } = useWallet();
  const [exportPassword, setExportPassword] = useState('');
  const [exportConfirm, setExportConfirm] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function runExport() {
    if (exportPassword.length < 6) return toast('密碼至少 6 個字');
    if (exportPassword !== exportConfirm) return toast('兩次輸入的密碼不一樣');

    setBusy('export');
    try {
      const { bytes, filename } = await exportBackup(db, exportPassword);
      const file = new File([bytes as BlobPart], filename, { type: 'application/octet-stream' });

      if (navigator.canShare?.({ files: [file] })) {
        // 取消會丟 AbortError，下面接住；沒丟就代表檔案確實送出去了
        await navigator.share({ files: [file], title: '7cw 備份' });
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

      // 檔案確定送出去了才記「上次備份」（見 backup.ts 的說明）
      await markExported(db);
      await reload();
      setExportPassword('');
      setExportConfirm('');
      toast('已匯出，請確認檔案有存到你找得到的地方');
    } catch (e) {
      // 在分享面板按取消：沒有備份成功，要講清楚，不能默默當作沒事
      if (e instanceof DOMException && e.name === 'AbortError') {
        toast('已取消，這次沒有建立備份');
        return;
      }
      toast(e instanceof Error ? e.message : '匯出失敗');
    } finally {
      setBusy(null);
    }
  }

  async function runImport(file: File) {
    if (!importPassword) return toast('請輸入備份檔的密碼');
    if (mode === 'overwrite' && !window.confirm('覆蓋模式會刪掉這支手機上現有的所有卡片，改成備份檔的內容。\n\n確定要繼續嗎？')) {
      return;
    }

    setBusy('import');
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await importBackup(db, bytes, importPassword, mode);
      await reload();
      setResult(r);
      setImportPassword('');
      toast('匯入完成');
    } catch (e) {
      toast(e instanceof BackupFormatError || e instanceof Error ? e.message : '匯入失敗');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="screen">
      <Header title="備份與還原" onBack={() => go({ name: 'tabs', tab: 'settings' })} />

      <p className="muted">
        卡片只存在這支手機裡。手機掉了、清除瀏覽器資料、刪掉主畫面圖示，資料都會不見，而且救不回來。
        {settings.lastExportAt
          ? `上次備份：${new Date(settings.lastExportAt).toLocaleString('zh-TW')}`
          : '你還沒備份過。'}
      </p>

      <section className="settings-group">
        <h2>匯出備份</h2>
        <div className="callout">
          <b>忘記密碼，備份檔永遠無法解開。</b>
          <p>沒有任何人能幫你救回來，包括這個 App 的作者。請把密碼記在你找得到的地方。</p>
        </div>
        <div className="form">
          <label>
            設定密碼（至少 6 個字）
            <input type="password" autoComplete="new-password" value={exportPassword} onChange={(e) => setExportPassword(e.target.value)} />
          </label>
          <label>
            再輸入一次
            <input type="password" autoComplete="new-password" value={exportConfirm} onChange={(e) => setExportConfirm(e.target.value)} />
          </label>
        </div>
        <button className="primary block" disabled={busy !== null} onClick={() => void runExport()}>
          {busy === 'export' ? '加密中…' : '匯出備份檔'}
        </button>
        <p className="muted">備份檔是加密的，裡面找不到卡號明文。但檔案＋密碼等同你的全部卡片，兩者不要放在一起。</p>
      </section>

      <section className="settings-group">
        <h2>從備份檔還原</h2>
        <div className="form">
          <label>
            備份檔的密碼
            <input type="password" autoComplete="current-password" value={importPassword} onChange={(e) => setImportPassword(e.target.value)} />
          </label>
        </div>

        <div className="setting">
          <span>還原方式</span>
          <div className="segmented">
            <button className={mode === 'merge' ? 'active' : ''} onClick={() => setMode('merge')}>
              合併
            </button>
            <button className={mode === 'overwrite' ? 'active' : ''} onClick={() => setMode('overwrite')}>
              覆蓋
            </button>
          </div>
        </div>
        <p className="muted">
          {mode === 'merge'
            ? '把備份檔的卡片加進來。相同卡號不會重複建立，餘額以備份檔為準，有差異會列出來給你看。'
            : '刪掉這支手機上現有的全部卡片，完全換成備份檔的內容。換手機、手機重置後用這個。'}
        </p>

        {/* iOS 會把未知副檔名顯示為灰色不可選，所以不設 accept（§5 FR-07） */}
        <input
          ref={fileRef}
          type="file"
          className="file-input"
          disabled={busy !== null}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void runImport(file);
          }}
        />
        {busy === 'import' && <p className="muted">解密中…</p>}
      </section>

      {result && (
        <section className="settings-group">
          <h2>匯入結果</h2>
          <ul className="plain-list">
            <li>新增 {result.cardsAdded} 張</li>
            {result.mode === 'merge' && <li>更新 {result.cardsUpdated} 張</li>}
            {result.cardsSkipped > 0 && <li>跳過 {result.cardsSkipped} 張（隱藏碼與既有卡片重複，請人工確認）</li>}
            {result.transactionsAdded > 0 && <li>補回 {result.transactionsAdded} 筆結帳紀錄</li>}
          </ul>
          {result.conflicts.length > 0 && (
            <>
              <div className="callout">
                <b>有 {result.conflicts.length} 張卡的餘額不一樣</b>
                <p>已採用備份檔的數字。如果本機的才是對的，請到卡片詳情手動改回來。</p>
              </div>
              <ul className="plain-list">
                {result.conflicts.map((c) => (
                  <li key={c.last4}>
                    末 {c.last4}：本機 {c.localBalance} 元 → 備份檔 {c.importedBalance} 元
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
