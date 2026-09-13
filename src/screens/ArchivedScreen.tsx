// FR-06 已封存清單

import { useWallet } from '../app/wallet';
import { CardName, Header, Money } from '../ui/common';

export function ArchivedScreen() {
  const { archived, go } = useWallet();
  return (
    <div className="screen">
      <Header title="已封存" onBack={() => go({ name: 'tabs', tab: 'cards' })} />
      {archived.length === 0 ? (
        <p className="empty">沒有封存的卡片</p>
      ) : (
        <ul className="card-list">
          {archived.map((c) => (
            <li key={c.id}>
              <button className="card-row" onClick={() => go({ name: 'card', id: c.id })}>
                <CardName card={c} />
                <Money value={c.balance} source={c.balanceSource} className="card-balance" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
