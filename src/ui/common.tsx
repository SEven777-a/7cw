// 共用小元件

import { useEffect, useState, type ReactNode } from 'react';
import type { Card } from '../domain/types';
import { last4 } from '../domain/validate';

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="header">
      {onBack ? (
        <button className="header-back" onClick={onBack} aria-label="返回">
          ‹ 返回
        </button>
      ) : (
        <span />
      )}
      <h1>{title}</h1>
      <span className="header-right">{right}</span>
    </header>
  );
}

/** 卡片識別：暱稱＋末 4 碼（§9） */
export function CardName({ card }: { card: Card }) {
  return (
    <span className="card-name">
      <span className="card-nick">{card.nickname || `${card.faceValue} 元卡`}</span>
      <span className="card-last4">末 {last4(card.code)}</span>
    </span>
  );
}

/** 金額：等寬數字；估算值加虛線底線（§9） */
export function Money({ value, source, className = '' }: { value: number; source?: Card['balanceSource']; className?: string }) {
  return (
    <span className={`money ${source === 'estimated' ? 'estimated' : ''} ${className}`} title={source ? SOURCE_LABEL[source] : undefined}>
      {value.toLocaleString('zh-TW')}
    </span>
  );
}

export const SOURCE_LABEL: Record<Card['balanceSource'], string> = {
  receipt: '收據確認',
  estimated: '推算值',
  initial: '初始面額',
};

export function SourceTag({ source }: { source: Card['balanceSource'] }) {
  return <span className={`source-tag ${source}`}>{SOURCE_LABEL[source]}</span>;
}

/** 非兌換商品提醒（§1、§9） */
export function ExcludedNotice() {
  return <p className="notice">不可兌換：菸品、代收代售、遊戲點數卡、宅急便、電信儲值卡、i預購、線上購物中心等</p>;
}

/** 以 object URL 顯示照片 Blob，離開時釋放 */
export function BlobImage({ blob, alt, className }: { blob: Blob; alt: string; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt={alt} className={className} /> : null;
}

/** 解析使用者輸入的整數；空字串或非整數回傳 null */
export function parseIntInput(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return Number.isSafeInteger(n) ? n : null;
}
