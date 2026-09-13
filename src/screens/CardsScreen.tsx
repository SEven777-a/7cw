// FR-02 卡片清單

import { useWallet } from '../app/wallet';
import { CardName, Header, Money } from '../ui/common';

export function CardsScreen() {
  const { cards, archived, go } = useWallet();
  const total = cards.reduce((s, c) => s + c.balance, 0);

  return (
    <div className="screen">
      <Header title="卡片" right={<button className="link" onClick={() => go({ name: 'add' })}>＋ 新增</button>} />

      <section className="summary">
        <div>
          <span className="summary-label">可用總額</span>
          <Money value={total} className="summary-value" />
        </div>
        <div>
          <span className="summary-label">張數</span>
          <span className="money summary-value">{cards.length}</span>
        </div>
      </section>

      {cards.length === 0 ? (
        <div className="empty">
          <p>掃描第一張卡片的條碼</p>
          <button className="primary" onClick={() => go({ name: 'add' })}>
            新增卡片
          </button>
        </div>
      ) : (
        <>
          <ul className="card-list">
            {cards.map((c) => (
              <li key={c.id}>
                <button className="card-row" onClick={() => go({ name: 'card', id: c.id })}>
                  <CardName card={c} />
                  <Money value={c.balance} source={c.balanceSource} className="card-balance" />
                </button>
              </li>
            ))}
          </ul>
          <p className="legend">
            <span className="money estimated">虛線</span> = 推算餘額，尚未對照收據
          </p>
        </>
      )}

      {archived.length > 0 && (
        <button className="link block" onClick={() => go({ name: 'archived' })}>
          已封存 {archived.length} 張 ›
        </button>
      )}
    </div>
  );
}
