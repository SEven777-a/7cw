// 首次啟動引導（WP2）：親友第一次打開時，帶去掃描第一張卡
// 不超過 4 步；不宣稱資料已加密（§6.2 明文禁止）——只講「只存在這支手機」

import { useState } from 'react';
import { useWallet } from '../app/wallet';
import { saveSettings } from '../db/db';
import { isIOS, isStandalone } from '../platform';

interface Step {
  title: string;
  body: string;
}

export function OnboardingScreen() {
  const { db, reload, go } = useWallet();
  // 只有已 standalone 才會到達本頁（canUseWallet 的 iOS 分支），這裡是給尚未安裝但用瀏覽器模式
  // （開發／E2E 例外）進來的人看的提醒，非必要不阻擋。
  const showInstallHint = isIOS() && !isStandalone();

  const steps: Step[] = [
    {
      title: '歡迎使用商品卡錢包',
      body: '把 7-ELEVEN 商品卡的條碼存在這支手機，結帳時直接出示條碼給店員掃描，不用再帶實體卡。資料只存在這支手機，不會上傳到任何地方。',
    },
    {
      title: '等一下要用到相機',
      body: '下一步會掃描卡片上的兩條條碼，需要允許使用相機權限；相機只在掃描時開啟。',
    },
    ...(showInstallHint
      ? [
          {
            title: '建議加入主畫面',
            body: '加入主畫面後可以全螢幕使用、桌面有圖示，比較方便；不加入也可以先試用看看。',
          },
        ]
      : []),
  ];

  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;

  async function finish() {
    await saveSettings(db, { onboardingDone: true });
    await reload();
    go({ name: 'add' });
  }

  return (
    <div className="install">
      <p className="muted" style={{ textAlign: 'center' }}>
        {i + 1} / {steps.length}
      </p>
      <h1>{step.title}</h1>
      <p>{step.body}</p>

      {last ? (
        <button className="primary block" onClick={() => void finish()}>
          開始掃描第一張卡
        </button>
      ) : (
        <button className="primary block" onClick={() => setI((n) => n + 1)}>
          下一步
        </button>
      )}
      <button className="link block" onClick={() => void finish()}>
        略過
      </button>
    </div>
  );
}
