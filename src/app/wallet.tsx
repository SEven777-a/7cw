// 全域狀態：資料庫連線、卡片、設定、未回填交易，以及畫面導覽

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getPendingTransaction, getSettings, listCards, openWalletDB, type WalletDB } from '../db/db';
import type { Card, Settings, Transaction } from '../domain/types';
import { shouldShowOnboarding } from './onboarding';

export type Tab = 'checkout' | 'cards' | 'settings';

export type Route =
  | { name: 'tabs'; tab: Tab }
  | { name: 'add' }
  | { name: 'card'; id: string; afterPresent?: boolean }
  | { name: 'archived' }
  | { name: 'present'; txId?: string; cardIds: string[] }
  | { name: 'backfill'; txId: string }
  | { name: 'onboarding' }
  | { name: 'backup' };

interface WalletState {
  db: WalletDB;
  cards: Card[]; // active，餘額由小到大
  archived: Card[];
  settings: Settings;
  pending?: Transaction;
  reload: () => Promise<void>;
  route: Route;
  go: (route: Route) => void;
  toast: (message: string) => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet 必須在 WalletProvider 內使用');
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<WalletDB | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [archived, setArchived] = useState<Card[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pending, setPending] = useState<Transaction | undefined>();
  const [route, setRoute] = useState<Route>({ name: 'tabs', tab: 'checkout' });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async (conn: WalletDB) => {
    const [active, arch, s, p] = await Promise.all([
      listCards(conn, 'active'),
      listCards(conn, 'archived'),
      getSettings(conn),
      getPendingTransaction(conn),
    ]);
    setCards(active);
    setArchived(arch);
    setSettings(s);
    setPending(p);
    // cardCount 含已封存：封存過卡的人顯然也已經會用了
    return { settings: s, pending: p, cardCount: active.length + arch.length };
  }, []);

  useEffect(() => {
    let cancelled = false;
    openWalletDB()
      .then(async (conn) => {
        if (cancelled) return;
        setDb(conn);
        const { settings: s, pending: p, cardCount } = await load(conn);
        // FR-05：啟動時若有未回填交易，直接進回填頁（優先於新手引導，見 shouldShowOnboarding）
        if (p) {
          setRoute({ name: 'backfill', txId: p.id });
        } else if (shouldShowOnboarding(s, p, cardCount)) {
          setRoute({ name: 'onboarding' });
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2600);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const reload = useCallback(async () => {
    if (db) await load(db);
  }, [db, load]);

  const go = useCallback((r: Route) => {
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo<WalletState | null>(
    () =>
      db && settings
        ? { db, cards, archived, settings, pending, reload, route, go, toast: setToastMessage }
        : null,
    [db, cards, archived, settings, pending, reload, route, go],
  );

  if (error) {
    return (
      <div className="fatal">
        <h1>無法開啟本機資料庫</h1>
        <p>{error}</p>
        <p>請確認不是無痕模式，並重新開啟 App。</p>
      </div>
    );
  }
  if (!value) return <div className="splash">載入中…</div>;
  return (
    <WalletContext.Provider value={value}>
      {children}
      {toastMessage && (
        <div className="toast" role="status">
          {toastMessage}
        </div>
      )}
    </WalletContext.Provider>
  );
}
