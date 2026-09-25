// 設定（M5 前的最小版本）

import { useEffect, useState } from 'react';
import { useWallet } from '../app/wallet';
import { saveSettings } from '../db/db';
import type { Settings, Strategy } from '../domain/types';
import { isAndroid, isStandalone, isStoragePersisted } from '../platform';
import { Header } from '../ui/common';

export function SettingsScreen() {
  const { db, settings, reload, go } = useWallet();
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
  }, []);

  async function update(patch: Partial<Settings>) {
    await saveSettings(db, patch);
    await reload();
  }

  async function replayOnboarding() {
    await update({ onboardingDone: false });
    go({ name: 'onboarding' });
  }

  return (
    <div className="screen">
      <Header title="設定" />

      <section className="settings-group">
        <h2>結帳建議</h2>
        <div className="setting">
          <span>預設策略</span>
          <div className="segmented">
            {(
              [
                ['clear_fragments', '優先清零頭'],
                ['min_cards', '最少張數'],
              ] as Array<[Strategy, string]>
            ).map(([value, label]) => (
              <button key={value} className={settings.defaultStrategy === value ? 'active' : ''} onClick={() => void update({ defaultStrategy: value })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span>每筆最多刷幾張</span>
          <Stepper value={settings.maxCardsPerTransaction} min={1} max={12} onChange={(v) => void update({ maxCardsPerTransaction: v })} />
        </div>
        <div className="setting">
          <span>剩多少餘額時詢問封存</span>
          <Stepper value={settings.archiveThreshold} min={0} max={20} onChange={(v) => void update({ archiveThreshold: v })} />
        </div>
        <p className="muted">用完（餘額 0）的卡一律自動封存，不會詢問；可在「已封存」還原。設 0 表示還有餘額的卡一律不問。</p>
        <div className="setting">
          <span>允許補現金清零頭（上限）</span>
          <Stepper value={settings.maxCashTopUpForClear} min={0} max={50} onChange={(v) => void update({ maxCashTopUpForClear: v })} />
        </div>
        <p className="muted">設 0 表示絕不為了清零頭多付現金。</p>
      </section>

      <section className="settings-group">
        <h2>出示條碼</h2>
        <label className="setting">
          <span>顯示「請將亮度調到最高」提示</span>
          <input type="checkbox" checked={!settings.hideBrightnessHint} onChange={(e) => void update({ hideBrightnessHint: !e.target.checked })} />
        </label>
      </section>

      <section className="settings-group">
        <h2>備份</h2>
        <div className="setting">
          <span>上次備份</span>
          <span className="muted">
            {settings.lastExportAt ? new Date(settings.lastExportAt).toLocaleDateString('zh-TW') : '從未備份'}
          </span>
        </div>
        <button className="primary block" onClick={() => go({ name: 'backup' })}>
          備份與還原
        </button>
        <p className="muted">卡片只存在這支手機裡。沒有備份檔，手機出事就救不回來。</p>
        <p className="muted">實體卡請保留：條碼毀損時可憑卡申請補發。</p>
      </section>

      <section className="settings-group">
        <h2>資料</h2>
        <div className="setting">
          <span>主畫面模式</span>
          <span className="muted">
            {isStandalone()
              ? '是'
              : isAndroid()
                ? '否，但可使用（瀏覽器分頁，建議加入主畫面更好用）'
                : '否，唯讀（請先加入主畫面才能新增／編輯卡片）'}
          </span>
        </div>
        <div className="setting">
          <span>持久化儲存</span>
          <span className="muted">{persisted === null ? '不支援' : persisted ? '已啟用' : '未啟用'}</span>
        </div>
        <div className="setting">
          <span>版本</span>
          <span className="muted">{__APP_VERSION__}</span>
        </div>
        <button className="link block" onClick={() => void replayOnboarding()}>
          重新顯示新手引導
        </button>
      </section>
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="減少">
        −
      </button>
      <span className="money">{value}</span>
      <button disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="增加">
        ＋
      </button>
    </div>
  );
}
