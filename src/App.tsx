import { useEffect } from 'react';
import { WalletProvider, useWallet, type Tab } from './app/wallet';
import { canUseWallet, requestPersistentStorage } from './platform';
import { AddCardScreen } from './screens/AddCardScreen';
import { ArchivedScreen } from './screens/ArchivedScreen';
import { BackfillScreen } from './screens/BackfillScreen';
import { BackupBanner } from './screens/BackupBanner';
import { BackupScreen } from './screens/BackupScreen';
import { CardDetailScreen } from './screens/CardDetailScreen';
import { CardsScreen } from './screens/CardsScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { InstallGuide } from './screens/InstallGuide';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PresentScreen } from './screens/PresentScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export default function App() {
  // §6.3：iOS 非 standalone（分頁與主畫面 App 儲存分離）與 App 內建瀏覽器一律停用寫入；
  // Android 獨立瀏覽器分頁與已安裝 PWA 共用儲存，可直接使用（canUseWallet，見 platform.ts）
  if (!canUseWallet()) return <InstallGuide />;
  return (
    <WalletProvider>
      <Shell />
    </WalletProvider>
  );
}

const TABS: Array<{ tab: Tab; label: string }> = [
  { tab: 'cards', label: '卡片' },
  { tab: 'checkout', label: '結帳' },
  { tab: 'settings', label: '設定' },
];

function Shell() {
  const { route, go } = useWallet();

  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  switch (route.name) {
    case 'add':
      return <AddCardScreen />;
    case 'card':
      return <CardDetailScreen key={route.id} id={route.id} afterPresent={route.afterPresent} />;
    case 'archived':
      return <ArchivedScreen />;
    case 'present':
      return <PresentScreen txId={route.txId} cardIds={route.cardIds} />;
    case 'backfill':
      return <BackfillScreen txId={route.txId} />;
    case 'onboarding':
      return <OnboardingScreen />;
    case 'backup':
      return <BackupScreen />;
    case 'tabs':
      return (
        <div className="app">
          <main className="tab-body">
            {/* 三個分頁都顯示：FR-07 要求提醒不可關閉，只能延後 */}
            <BackupBanner />
            {route.tab === 'checkout' && <CheckoutScreen />}
            {route.tab === 'cards' && <CardsScreen />}
            {route.tab === 'settings' && <SettingsScreen />}
          </main>
          <nav className="tabbar">
            {TABS.map((t) => (
              <button
                key={t.tab}
                className={route.tab === t.tab ? 'active' : ''}
                onClick={() => go({ name: 'tabs', tab: t.tab })}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      );
  }
}
