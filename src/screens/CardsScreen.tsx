// FR-02 卡片清單：同面額收成一筆（顯示張數與合計），點一下展開個別卡片

import { useState } from 'react';
import { useWallet } from '../app/wallet';
import { groupByFaceValue } from '../domain/group';
import { CardName, Header, Money } from '../ui/common';

export function CardsScreen() {
  const { cards, archived, go } = useWallet();
  const total = cards.reduce((s, c) => s + c.balance, 0);
  const groups = groupByFaceValue(cards);
  // 展開中的面額；只有一組時預設展開，省一次點擊
  const [open, setOpen] = useState<Set<number>>(() => new Set(groups.length === 1 ? [groups[0].faceValue] : []));

  function toggle(faceValue: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(faceValue)) next.delete(faceValue);
      else next.add(faceValue);
      return next;
    });
  }

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
            {groups.map((g) => {
              const expanded = open.has(g.faceValue);
              return (
                <li key={g.faceValue}>
                  <button className="card-row group-row" aria-expanded={expanded} onClick={() => toggle(g.faceValue)}>
                    <span className="card-name">
                      <span className="card-nick">
                        <span className={`chevron ${expanded ? 'open' : ''}`}>›</span> {g.faceValue} 元卡 × {g.cards.length} 張
                      </span>
                      {g.usedCount > 0 && <span className="card-last4">其中 {g.usedCount} 張已用過</span>}
                    </span>
                    <Money value={g.total} source={g.hasEstimated ? 'estimated' : undefined} className="card-balance" />
                  </button>
                  {expanded && (
                    <ul className="card-sublist">
                      {g.cards.map((c) => (
                        <li key={c.id}>
                          <button className="card-row" onClick={() => go({ name: 'card', id: c.id })}>
                            <CardName card={c} />
                            <Money value={c.balance} source={c.balanceSource} className="card-balance" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
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
