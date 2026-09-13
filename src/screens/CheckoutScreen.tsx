// FR-03 結帳建議（主畫面）：輸入金額 → 刷卡清單 → 可手動增減 → 開始出示

import { useMemo, useState } from 'react';
import { useWallet } from '../app/wallet';
import { createPendingTransaction } from '../db/db';
import { allocate, compareAsc, planPayment, type PlanLine } from '../domain/plan';
import type { Card, Strategy } from '../domain/types';
import { CardName, ExcludedNotice, Header, Money } from '../ui/common';

const STRATEGY_LABEL: Record<Strategy, string> = {
  clear_fragments: '優先清零頭',
  min_cards: '最少張數',
};

export function CheckoutScreen() {
  const { pending, go, cards } = useWallet();
  const [amountText, setAmountText] = useState('');
  const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null);

  if (pending) {
    return (
      <div className="screen">
        <Header title="結帳" />
        <div className="callout">
          <b>還有一筆結帳沒回填餘額</b>
          <p>卡片已在門市扣款，先對照收據回填，建議才會正確。</p>
          <button className="primary block" onClick={() => go({ name: 'backfill', txId: pending.id })}>
            前往回填
          </button>
        </div>
      </div>
    );
  }

  if (confirmedAmount !== null) {
    return <PlanView amount={confirmedAmount} onEditAmount={() => setConfirmedAmount(null)} />;
  }

  const amount = Number(amountText || '0');
  const press = (k: string) => {
    if (k === '⌫') setAmountText((t) => t.slice(0, -1));
    else if (k === 'C') setAmountText('');
    else setAmountText((t) => (t.length >= 5 || (t === '' && k === '0') ? t : t + k));
  };
  const total = cards.reduce((s, c) => s + c.balance, 0);

  return (
    <div className="screen checkout">
      <Header title="結帳" />
      <div className="amount-display">
        <span className="summary-label">結帳金額</span>
        <span className="amount-value money">{amountText || '0'}</span>
        <span className="muted">
          可用 {cards.length} 張，共 {total.toLocaleString('zh-TW')} 元
        </span>
      </div>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
          <button key={k} className={k === 'C' || k === '⌫' ? 'key-fn' : ''} onClick={() => press(k)}>
            {k}
          </button>
        ))}
      </div>
      <button className="primary block big" disabled={amount <= 0} onClick={() => setConfirmedAmount(amount)}>
        建議刷卡順序
      </button>
      <ExcludedNotice />
    </div>
  );
}

function PlanView({ amount, onEditAmount }: { amount: number; onEditAmount: () => void }) {
  const { db, cards, settings, go, reload, toast } = useWallet();
  const [strategy, setStrategy] = useState<Strategy>(settings.defaultStrategy);
  const [manualIds, setManualIds] = useState<string[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState(false);
  const maxCards = settings.maxCardsPerTransaction;

  const auto = useMemo(() => planPayment({ amount, cards, strategy, maxCards }), [amount, cards, strategy, maxCards]);
  const manual = useMemo(() => {
    if (!manualIds) return null;
    const selected = manualIds.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c);
    return allocate(selected, amount);
  }, [manualIds, cards, amount]);

  const lines: PlanLine[] = manual ? manual.lines : auto.lines;
  const cashTopUp = manual ? manual.cashTopUp : auto.cashTopUp;
  const unused = manual?.unusedCards ?? [];
  const selectedIds = manualIds ?? auto.lines.map((l) => l.card.id);
  const others = cards.filter((c) => c.balance > 0 && !selectedIds.includes(c.id)).sort(compareAsc);
  const tooMany = selectedIds.length > maxCards;

  function remove(id: string) {
    setManualIds(selectedIds.filter((x) => x !== id));
  }
  function add(id: string) {
    setManualIds([...selectedIds, id]);
    setPicking(false);
  }

  async function start() {
    if (lines.length === 0) return;
    setStarting(true);
    try {
      const tx = await createPendingTransaction(db, {
        totalAmount: amount,
        strategyUsed: manual ? 'manual' : strategy,
        cashTopUp,
        lines: lines.map((l) => ({ cardId: l.card.id, plannedDeduct: l.deduct, balanceBefore: l.card.balance })),
      });
      await reload();
      go({ name: 'present', txId: tx.id, cardIds: tx.lines.map((l) => l.cardId) });
    } catch (e) {
      toast(e instanceof Error ? e.message : '無法開始出示');
      setStarting(false);
    }
  }

  return (
    <div className="screen">
      <Header title={`結帳 ${amount.toLocaleString('zh-TW')} 元`} onBack={onEditAmount} />

      <div className="segmented">
        {(Object.keys(STRATEGY_LABEL) as Strategy[]).map((s) => (
          <button
            key={s}
            className={!manual && strategy === s ? 'active' : ''}
            onClick={() => {
              setStrategy(s);
              setManualIds(null);
            }}
          >
            {STRATEGY_LABEL[s]}
          </button>
        ))}
      </div>
      {manual && (
        <p className="muted center">
          手動調整中 · <button className="link" onClick={() => setManualIds(null)}>恢復建議</button>
        </p>
      )}
      {!manual && auto.note === 'FALLBACK_TO_MIN_CARDS' && (
        <p className="notice">清零頭會需要多付現金，已改用最少張數的組合。</p>
      )}

      {auto.warning === 'NO_CARDS' && !manual ? (
        <div className="empty">
          <p>沒有可用的卡片，這筆需全額付現。</p>
          <button className="secondary" onClick={() => go({ name: 'add' })}>
            新增卡片
          </button>
        </div>
      ) : (
        <ol className="plan-list">
          {lines.map((l, i) => (
            <li key={l.card.id} className="plan-row">
              <span className="plan-order">{i + 1}</span>
              <div className="plan-main">
                <CardName card={l.card} />
                <span className="muted">
                  <Money value={l.card.balance} source={l.card.balanceSource} /> → <Money value={l.balanceAfter} />
                  {l.balanceAfter === 0 ? '（清空）' : ''}
                </span>
              </div>
              <span className="plan-deduct">
                扣 <Money value={l.deduct} />
              </span>
              <button className="icon" aria-label="移除這張" onClick={() => remove(l.card.id)}>
                ✕
              </button>
            </li>
          ))}
          {unused.map((c) => (
            <li key={c.id} className="plan-row unused">
              <span className="plan-order">–</span>
              <div className="plan-main">
                <CardName card={c} />
                <span className="muted">這張用不到</span>
              </div>
              <span />
              <button className="icon" aria-label="移除這張" onClick={() => remove(c.id)}>
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      {picking ? (
        <div className="picker">
          <p className="summary-label">選一張加入</p>
          {others.length === 0 && <p className="muted">沒有其他可用的卡</p>}
          <ul className="card-list">
            {others.map((c) => (
              <li key={c.id}>
                <button className="card-row" onClick={() => add(c.id)}>
                  <CardName card={c} />
                  <Money value={c.balance} source={c.balanceSource} className="card-balance" />
                </button>
              </li>
            ))}
          </ul>
          <button className="link block" onClick={() => setPicking(false)}>
            取消
          </button>
        </div>
      ) : (
        others.length > 0 && (
          <button className="link block" onClick={() => setPicking(true)}>
            ＋ 手動加一張卡
          </button>
        )
      )}

      <section className="plan-summary">
        <div>
          <span>卡片支付</span>
          <Money value={amount - cashTopUp} />
        </div>
        <div className={cashTopUp > 0 ? 'warn' : ''}>
          <span>需補現金</span>
          <Money value={cashTopUp} />
        </div>
        {tooMany && <p className="warn">超過每筆上限 {maxCards} 張，店員可能不願意一次刷這麼多張。</p>}
      </section>

      <button className="primary block big" disabled={lines.length === 0 || starting} onClick={() => void start()}>
        開始出示（{lines.length} 張）
      </button>
      <ExcludedNotice />
    </div>
  );
}
