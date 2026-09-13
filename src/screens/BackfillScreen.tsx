// FR-05 餘額回填：對照收據確認每張卡刷完後的餘額

import { useEffect, useState } from 'react';
import { useWallet } from '../app/wallet';
import { archiveCard, cancelPendingTransaction, confirmTransaction, getCard } from '../db/db';
import type { Card } from '../domain/types';
import { CardName, Header, Money, parseIntInput } from '../ui/common';

export function BackfillScreen({ txId }: { txId: string }) {
  const { db, pending, settings, go, reload, toast } = useWallet();
  const tx = pending?.id === txId ? pending : undefined;
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toArchive, setToArchive] = useState<Card[] | null>(null);

  useEffect(() => {
    if (!tx) return;
    void Promise.all(tx.lines.map((l) => getCard(db, l.cardId))).then((list) => {
      const map: Record<string, Card> = {};
      list.forEach((c) => c && (map[c.id] = c));
      setCards(map);
    });
    // 預設值 = 推算餘額
    setValues((prev) =>
      Object.keys(prev).length > 0
        ? prev
        : Object.fromEntries(tx.lines.map((l) => [l.cardId, String(l.balanceBefore - l.plannedDeduct)])),
    );
  }, [db, tx]);

  // 回填完成後的封存提示（FR-06）
  if (toArchive) {
    return (
      <div className="screen">
        <Header title="已回填" />
        <div className="callout">
          <b>這些卡餘額已用完，要封存嗎？</b>
          <p>封存後不會出現在清單與建議中，可隨時還原。</p>
        </div>
        <ul className="card-list">
          {toArchive.map((c) => (
            <li key={c.id} className="card-row static">
              <CardName card={c} />
              <Money value={c.balance} className="card-balance" />
            </li>
          ))}
        </ul>
        <button
          className="primary block"
          onClick={async () => {
            for (const c of toArchive) await archiveCard(db, c.id);
            await reload();
            toast(`已封存 ${toArchive.length} 張`);
            go({ name: 'tabs', tab: 'checkout' });
          }}
        >
          全部封存
        </button>
        <button className="secondary block" onClick={() => go({ name: 'tabs', tab: 'checkout' })}>
          先不要
        </button>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="screen">
        <Header title="回填餘額" onBack={() => go({ name: 'tabs', tab: 'checkout' })} />
        <p className="empty">沒有待回填的結帳</p>
      </div>
    );
  }

  async function submit(source: 'receipt' | 'estimated') {
    if (!tx) return;
    const balances: Record<string, number> = {};
    if (source === 'receipt') {
      for (const l of tx.lines) {
        const v = parseIntInput(values[l.cardId] ?? '');
        if (v === null || v > l.balanceBefore) {
          toast(`末 ${cards[l.cardId]?.code.slice(-4) ?? ''} 的餘額要在 0 到 ${l.balanceBefore} 之間`);
          return;
        }
        balances[l.cardId] = v;
      }
    }
    setSaving(true);
    try {
      const done = await confirmTransaction(db, tx.id, balances, source);
      await reload();
      toast(source === 'receipt' ? '已依收據回填' : '已用推算值回填');
      const emptied = done.lines
        .filter((l) => (l.balanceAfter ?? 1) <= settings.archiveThreshold)
        .map((l) => cards[l.cardId])
        .filter((c): c is Card => !!c)
        .map((c) => ({ ...c, balance: done.lines.find((l) => l.cardId === c.id)?.balanceAfter ?? c.balance }));
      if (emptied.length > 0) setToArchive(emptied);
      else go({ name: 'tabs', tab: 'checkout' });
    } catch (e) {
      toast(e instanceof Error ? e.message : '回填失敗');
    } finally {
      setSaving(false);
    }
  }

  async function notSwiped() {
    if (!tx || !window.confirm('這筆沒刷成功？\n\n會刪除這筆結帳紀錄，所有卡片餘額不變。')) return;
    await cancelPendingTransaction(db, tx.id);
    await reload();
    toast('已取消，餘額不變');
    go({ name: 'tabs', tab: 'checkout' });
  }

  return (
    <div className="screen">
      <Header title="回填餘額" />
      <p className="muted">
        結帳 {tx.totalAmount} 元{tx.cashTopUp > 0 ? `（補現金 ${tx.cashTopUp} 元）` : ''}。對照收據（零值交易明細）上的餘額，數字不同就改掉。
      </p>

      <ol className="plan-list">
        {tx.lines.map((l) => {
          const card = cards[l.cardId];
          return (
            <li key={l.cardId} className="plan-row backfill-row">
              <span className="plan-order">{l.order}</span>
              <div className="plan-main">
                {card ? <CardName card={card} /> : <span>…</span>}
                <span className="muted">
                  刷前 <Money value={l.balanceBefore} /> · 預計扣 <Money value={l.plannedDeduct} />
                </span>
              </div>
              <label className="backfill-input">
                <span className="summary-label">刷後餘額</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={values[l.cardId] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [l.cardId]: e.target.value }))}
                />
              </label>
            </li>
          );
        })}
      </ol>

      <button className="primary block big" disabled={saving} onClick={() => void submit('receipt')}>
        確認（已對照收據）
      </button>
      <button className="secondary block" disabled={saving} onClick={() => void submit('estimated')}>
        沒拿收據，先用推算值
      </button>
      <div className="row-actions">
        <button className="link" onClick={() => go({ name: 'present', txId: tx.id, cardIds: tx.lines.map((l) => l.cardId) })}>
          ‹ 回到出示頁
        </button>
        <button className="link danger-text" onClick={() => void notSwiped()}>
          這筆沒刷成功
        </button>
      </div>
    </div>
  );
}
