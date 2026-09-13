// FR-04 出示條碼：全螢幕白底、兩條上下排列、Wake Lock、左右滑動換卡

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '../app/wallet';
import { BARCODE_LAYOUT, drawBarcode } from '../barcode/code128';
import { cancelPendingTransaction, getCard, saveSettings, setLineSwiped } from '../db/db';
import type { Card, Transaction } from '../domain/types';
import { last4 } from '../domain/validate';
import { BlobImage } from '../ui/common';

export function PresentScreen({ txId, cardIds }: { txId?: string; cardIds: string[] }) {
  const { db, pending, settings, go, reload, toast } = useWallet();
  const tx: Transaction | undefined = txId && pending?.id === txId ? pending : undefined;
  const [cards, setCards] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [hideHint, setHideHint] = useState(settings.hideBrightnessHint);
  const pagerRef = useRef<HTMLDivElement>(null);

  useWakeLock();

  useEffect(() => {
    void Promise.all(cardIds.map((id) => getCard(db, id))).then((list) => setCards(list.filter((c): c is Card => !!c)));
  }, [db, cardIds]);

  if (!cards) return <div className="present" />;
  const current = cards[index];
  const line = tx?.lines.find((l) => l.cardId === current?.id);

  function scrollTo(i: number) {
    const pager = pagerRef.current;
    if (!pager) return;
    pager.scrollTo({ left: i * pager.clientWidth, behavior: 'auto' });
    // 不依賴 scroll 事件，直接同步頁碼
    setIndex(i);
    setPhotoOpen(false);
  }

  function onScroll() {
    const pager = pagerRef.current;
    if (!pager) return;
    const i = Math.round(pager.scrollLeft / pager.clientWidth);
    if (i !== index) {
      setIndex(i);
      setPhotoOpen(false);
    }
  }

  async function toggleSwiped(checked: boolean) {
    if (!tx || !current) return;
    await setLineSwiped(db, tx.id, current.id, checked);
    await reload();
    if (checked && index < cards!.length - 1) scrollTo(index + 1);
  }

  async function notSwiped() {
    if (!tx) return;
    if (!window.confirm('這筆沒刷成功？\n\n會刪除這筆結帳紀錄，所有卡片餘額不變。')) return;
    await cancelPendingTransaction(db, tx.id);
    await reload();
    toast('已取消，餘額不變');
    go({ name: 'tabs', tab: 'checkout' });
  }

  async function dismissHint() {
    setHideHint(true);
    await saveSettings(db, { hideBrightnessHint: true });
    await reload();
  }

  function finish() {
    if (tx) go({ name: 'backfill', txId: tx.id });
    else go({ name: 'card', id: cardIds[0], afterPresent: true });
  }

  return (
    <div className="present">
      <div className="present-top">
        <span>
          第 {index + 1} / {cards.length} 張 · 末 {current ? last4(current.code) : ''}
        </span>
        {line && <span className="present-deduct">扣 {line.plannedDeduct}</span>}
      </div>

      {!hideHint && (
        <div className="present-hint">
          請將螢幕亮度調到最高
          <button onClick={() => void dismissHint()}>不再顯示</button>
        </div>
      )}

      <div className="pager" ref={pagerRef} onScroll={onScroll}>
        {cards.map((c) => (
          <div className="page" key={c.id}>
            <CardBarcodes card={c} />
          </div>
        ))}
      </div>

      {photoOpen && current?.photoBlob && (
        <div className="photo-overlay" onClick={() => setPhotoOpen(false)}>
          <BlobImage blob={current.photoBlob} alt="卡片原始照片" />
          <span>點一下關閉</span>
        </div>
      )}

      <div className="present-bottom">
        {tx && line && (
          <label className="swiped">
            <input type="checkbox" checked={line.swiped} onChange={(e) => void toggleSwiped(e.target.checked)} />
            已刷過
          </label>
        )}
        <div className="present-nav">
          <button disabled={index === 0} onClick={() => scrollTo(index - 1)}>
            ‹ 上一張
          </button>
          {current?.photoBlob && <button onClick={() => setPhotoOpen(true)}>原始照片</button>}
          <button disabled={index >= cards.length - 1} onClick={() => scrollTo(index + 1)}>
            下一張 ›
          </button>
        </div>
        <div className="present-actions">
          {tx && (
            <button className="ghost" onClick={() => void notSwiped()}>
              這筆沒刷成功
            </button>
          )}
          <button className="primary" onClick={finish}>
            {tx ? '刷完了，回填餘額' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 一張卡的兩條條碼，依 BARCODE_LAYOUT 排列；上方印卡號，下方不印文字 */
function CardBarcodes({ card }: { card: Card }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLCanvasElement | null>>({});

  useEffect(() => {
    const draw = () => {
      const width = Math.min(wrapRef.current?.clientWidth ?? 360, BARCODE_LAYOUT.maxWidthCss);
      for (const key of BARCODE_LAYOUT.order) {
        const canvas = refs.current[key];
        if (canvas) drawBarcode(canvas, card[key], { cssWidth: width, cssHeight: BARCODE_LAYOUT.barHeightCss, showText: key === 'code' });
      }
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [card]);

  return (
    <div className="barcodes" ref={wrapRef} style={{ gap: BARCODE_LAYOUT.barHeightCss * BARCODE_LAYOUT.gapRatio }}>
      {BARCODE_LAYOUT.order.map((key) => (
        <canvas key={key} ref={(el) => void (refs.current[key] = el)} aria-label={key === 'code' ? '卡號條碼' : '下方條碼'} />
      ))}
    </div>
  );
}

/** 出示期間防止螢幕熄滅；切到背景會被系統釋放，回前景時重新申請 */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const request = async () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (!active) void lock.release();
      } catch {
        // 不支援或被拒絕時略過
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
