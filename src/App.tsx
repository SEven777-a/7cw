import { useEffect } from 'react';
import { WalletProvider, useWallet, type Tab } from './app/wallet';
import { ALLOW_BROWSER_MODE, isStandalone, requestPersistentStorage } from './platform';
import { AddCardScreen } from './screens/AddCardScreen';
import { ArchivedScreen } from './screens/ArchivedScreen';
import { BackfillScreen } from './screens/BackfillScreen';
import { CardDetailScreen } from './screens/CardDetailScreen';
import { CardsScreen } from './screens/CardsScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { InstallGuide } from './screens/InstallGuide';
import { PresentScreen } from './screens/PresentScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export default function App() {
  // §6.3：非 standalone 只顯示加入主畫面教學，所有寫入功能停用
  if (!isStandalone() && !ALLOW_BROWSER_MODE) return <InstallGuide />;
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
    case 'tabs':
      return (
        <div className="app">
          <main className="tab-body">
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
