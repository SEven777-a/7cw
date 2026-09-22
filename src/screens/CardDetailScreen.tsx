// 卡片詳細：修改餘額與暱稱、出示單張、照片、封存 / 還原 / 永久刪除（FR-06）

import { useEffect, useState } from 'react';
import { useWallet } from '../app/wallet';
import { archiveCard, deleteCardPermanently, getCard, restoreCard, updateCard } from '../db/db';
import type { Card } from '../domain/types';
import { last4 } from '../domain/validate';
import { BlobImage, Header, Money, SourceTag, parseIntInput } from '../ui/common';

export function CardDetailScreen({ id, afterPresent }: { id: string; afterPresent?: boolean }) {
  const { db, go, reload, toast, pending } = useWallet();
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [balanceText, setBalanceText] = useState('');
  const [nickname, setNickname] = useState('');
  const [showPhoto, setShowPhoto] = useState(false);

  useEffect(() => {
    void getCard(db, id).then((c) => {
      setCard(c ?? null);
      if (c) {
        setBalanceText(String(c.balance));
        setNickname(c.nickname ?? '');
      }
    });
  }, [db, id]);

  if (card === undefined) return <div className="splash">載入中…</div>;
  const back = () => go(card?.status === 'archived' ? { name: 'archived' } : { name: 'tabs', tab: 'cards' });
  if (card === null) {
    return (
      <div className="screen">
        <Header title="卡片" onBack={back} />
        <p className="empty">找不到這張卡</p>
      </div>
    );
  }

  const inPending = pending?.lines.some((l) => l.cardId === card.id) ?? false;
  const newBalance = parseIntInput(balanceText);
  const dirty = newBalance !== card.balance || nickname.trim() !== (card.nickname ?? '');

  async function save() {
    if (!card) return;
    if (newBalance === null) {
      toast('餘額請輸入 0 以上的整數');
      return;
    }
    const patch: Parameters<typeof updateCard>[2] = { nickname };
    if (newBalance !== card.balance) Object.assign(patch, { balance: newBalance, balanceSource: 'estimated' });
    const next = await updateCard(db, card.id, patch);
    setCard(next);
    await reload();
    toast('已儲存');
    if (next.status === 'active' && next.balance === 0 && window.confirm('餘額已歸零，要封存這張卡嗎？')) {
      await archive();
    }
  }

  async function archive() {
    if (!card) return;
    setCard(await archiveCard(db, card.id));
    await reload();
    toast('已封存，可在「已封存」還原');
  }

  async function restore() {
    if (!card) return;
    setCard(await restoreCard(db, card.id));
    await reload();
    toast('已還原');
  }

  async function remove() {
    if (!card) return;
    if (!window.confirm(`永久刪除「末 ${last4(card.code)}」？\n\n刪除後無法復原。若卡片還有餘額，等於把錢丟掉。`)) return;
    if (!window.confirm('再確認一次：真的要永久刪除嗎？')) return;
    try {
      await deleteCardPermanently(db, card.id);
      await reload();
      toast('已永久刪除');
      go({ name: 'archived' });
    } catch (e) {
      toast(e instanceof Error ? e.message : '刪除失敗');
    }
  }

  return (
    <div className="screen">
      <Header title={card.nickname || `${card.faceValue} 元卡`} onBack={back} />

      {afterPresent && (
        <div className="callout">
          <b>剛才有刷這張卡嗎？</b>
          <p>對照收據（零值交易明細）把餘額改成實際數字再儲存。沒刷就直接返回。</p>
        </div>
      )}

      <section className="detail-hero">
        <span className="summary-label">目前餘額</span>
        <Money value={card.balance} source={card.balanceSource} className="hero-money" />
        <SourceTag source={card.balanceSource} />
        <p className="muted">
          卡號末 {last4(card.code)} · 面額 {card.faceValue} 元{card.status === 'archived' ? ' · 已封存' : ''}
        </p>
      </section>

      {card.status === 'active' && (
        <button className="primary block" onClick={() => go({ name: 'present', cardIds: [card.id] })}>
          出示這張卡的條碼
        </button>
      )}

      <section className="form">
        <label>
          餘額（元）
          <input inputMode="numeric" pattern="[0-9]*" value={balanceText} onChange={(e) => setBalanceText(e.target.value)} />
        </label>
        <label>
          暱稱
          <input value={nickname} maxLength={20} placeholder="例如：客戶送的" onChange={(e) => setNickname(e.target.value)} />
        </label>
        <button className="secondary block" disabled={!dirty} onClick={() => void save()}>
          儲存變更
        </button>
      </section>

      {card.photoBlob && (
        <section>
          <button className="link block" onClick={() => setShowPhoto((v) => !v)}>
            {showPhoto ? '隱藏原始照片' : '顯示原始照片'}
          </button>
          {showPhoto && <BlobImage blob={card.photoBlob} alt="卡片原始照片" className="photo" />}
        </section>
      )}

      <section className="danger-zone">
        {card.status === 'active' ? (
          <button className="secondary block" disabled={inPending} onClick={() => void archive()}>
            封存這張卡
          </button>
        ) : (
          <>
            <button className="secondary block" onClick={() => void restore()}>
              還原到卡片清單
            </button>
            <button className="danger block" onClick={() => void remove()}>
              永久刪除
            </button>
          </>
        )}
        {inPending && <p className="muted">這張卡在未回填的結帳中，完成回填後才能封存。</p>}
      </section>
    </div>
  );
}
