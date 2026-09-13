// IndexedDB 資料層（開發指引 §4、FR-01/05/06）
// 所有需要一致性的寫入都在單一 IndexedDB transaction 內完成

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { isNonNegativeInt, isPositiveInt, isValidCode, isValidHiddenCode } from '../domain/validate';
import { DEFAULT_SETTINGS, type Card, type Settings, type Transaction, type TransactionLine } from '../domain/types';

export const DB_NAME = 'seven-card-wallet';
const DB_VERSION = 1;
const SETTINGS_KEY = 'singleton';

interface WalletSchema extends DBSchema {
  cards: {
    key: string;
    value: Card;
    indexes: { status: string; balance: number; code: string; hiddenCode: string };
  };
  transactions: {
    key: string;
    value: Transaction;
    indexes: { status: string };
  };
  settings: {
    key: string;
    value: Settings;
  };
}

export type WalletDB = IDBPDatabase<WalletSchema>;

export function openWalletDB(name = DB_NAME): Promise<WalletDB> {
  return openDB<WalletSchema>(name, DB_VERSION, {
    upgrade(db) {
      const cards = db.createObjectStore('cards', { keyPath: 'id' });
      cards.createIndex('status', 'status');
      cards.createIndex('balance', 'balance');
      cards.createIndex('code', 'code', { unique: true });
      cards.createIndex('hiddenCode', 'hiddenCode', { unique: true });
      const txs = db.createObjectStore('transactions', { keyPath: 'id' });
      txs.createIndex('status', 'status');
      db.createObjectStore('settings');
    },
  });
}

export function newId(): string {
  return crypto.randomUUID();
}

// ───────── 卡片 ─────────

export interface NewCardInput {
  code: string;
  hiddenCode?: string;
  faceValue: number;
  balance?: number;
  nickname?: string;
  photoBlob?: Blob;
}

export type AddCardResult =
  | { ok: true; card: Card }
  | {
      ok: false;
      reason: 'INVALID_CODE' | 'MISSING_HIDDEN_CODE' | 'INVALID_HIDDEN_CODE' | 'INVALID_AMOUNT' | 'DUPLICATE' | 'PARTIAL_DUPLICATE';
      existing?: Card;
    };

export async function addCard(db: WalletDB, input: NewCardInput, now = Date.now()): Promise<AddCardResult> {
  const code = input.code.trim();
  const hiddenCode = (input.hiddenCode ?? '').trim();
  if (!isValidCode(code)) return { ok: false, reason: 'INVALID_CODE' };
  if (!hiddenCode) return { ok: false, reason: 'MISSING_HIDDEN_CODE' };
  if (!isValidHiddenCode(hiddenCode)) return { ok: false, reason: 'INVALID_HIDDEN_CODE' };
  const balance = input.balance ?? input.faceValue;
  if (!isPositiveInt(input.faceValue) || !isNonNegativeInt(balance)) return { ok: false, reason: 'INVALID_AMOUNT' };

  const tx = db.transaction('cards', 'readwrite');
  const [byCode, byHidden] = await Promise.all([
    tx.store.index('code').get(code),
    tx.store.index('hiddenCode').get(hiddenCode),
  ]);
  if (byCode || byHidden) {
    tx.abort();
    await tx.done.catch(() => undefined);
    // 兩者都重複 = 同一張卡已存在；只有一個重複 = 資料可能有誤
    const bothSame = byCode && byHidden && byCode.id === byHidden.id;
    return { ok: false, reason: bothSame ? 'DUPLICATE' : 'PARTIAL_DUPLICATE', existing: byCode ?? byHidden };
  }
  const card: Card = {
    id: newId(),
    code,
    hiddenCode,
    format: 'CODE_128',
    faceValue: input.faceValue,
    balance,
    balanceSource: 'initial',
    nickname: input.nickname?.trim() || undefined,
    photoBlob: input.photoBlob,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await tx.store.add(card);
  await tx.done;
  return { ok: true, card };
}

/** 掃描後先查重複，避免填完表單才被擋 */
export async function findByCodes(db: WalletDB, code: string, hiddenCode: string): Promise<{ byCode?: Card; byHidden?: Card }> {
  const [byCode, byHidden] = await Promise.all([
    db.getFromIndex('cards', 'code', code),
    db.getFromIndex('cards', 'hiddenCode', hiddenCode),
  ]);
  return { byCode, byHidden };
}

export async function listCards(db: WalletDB, status: Card['status'] = 'active'): Promise<Card[]> {
  const list = await db.getAllFromIndex('cards', 'status', status);
  return list.sort((a, b) => a.balance - b.balance || a.createdAt - b.createdAt);
}

export function getCard(db: WalletDB, id: string): Promise<Card | undefined> {
  return db.get('cards', id);
}

export async function updateCard(
  db: WalletDB,
  id: string,
  patch: Partial<Pick<Card, 'balance' | 'nickname' | 'faceValue' | 'balanceSource' | 'status'>>,
  now = Date.now(),
): Promise<Card> {
  if (patch.balance !== undefined && !isNonNegativeInt(patch.balance)) throw new Error('餘額必須是 0 以上的整數');
  if (patch.faceValue !== undefined && !isPositiveInt(patch.faceValue)) throw new Error('面額必須是正整數');
  const tx = db.transaction('cards', 'readwrite');
  const card = await tx.store.get(id);
  if (!card) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error('找不到這張卡');
  }
  const next: Card = { ...card, ...patch, updatedAt: now };
  if ('nickname' in patch) next.nickname = patch.nickname?.trim() || undefined;
  await tx.store.put(next);
  await tx.done;
  return next;
}

export function archiveCard(db: WalletDB, id: string): Promise<Card> {
  return updateCard(db, id, { status: 'archived' });
}

export function restoreCard(db: WalletDB, id: string): Promise<Card> {
  return updateCard(db, id, { status: 'active' });
}

/** 實體刪除（FR-06：UI 端必須二次確認）。有 pending 交易引用時拒絕 */
export async function deleteCardPermanently(db: WalletDB, id: string): Promise<void> {
  const tx = db.transaction(['cards', 'transactions'], 'readwrite');
  const pending = await tx.objectStore('transactions').index('status').getAll('pending');
  if (pending.some((t) => t.lines.some((l) => l.cardId === id))) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error('這張卡在未完成的結帳中，先完成回填');
  }
  await tx.objectStore('cards').delete(id);
  await tx.done;
}

// ───────── 交易（FR-04 / FR-05） ─────────

export interface PendingLineInput {
  cardId: string;
  plannedDeduct: number;
  balanceBefore: number;
}

export async function createPendingTransaction(
  db: WalletDB,
  input: { totalAmount: number; strategyUsed: Transaction['strategyUsed']; lines: PendingLineInput[]; cashTopUp: number },
  now = Date.now(),
): Promise<Transaction> {
  const tx = db.transaction('transactions', 'readwrite');
  const existing = await tx.store.index('status').count('pending');
  if (existing > 0) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error('還有未回填的結帳');
  }
  const record: Transaction = {
    id: newId(),
    status: 'pending',
    createdAt: now,
    totalAmount: input.totalAmount,
    strategyUsed: input.strategyUsed,
    cashTopUp: input.cashTopUp,
    lines: input.lines.map<TransactionLine>((l, i) => ({ ...l, order: i + 1, swiped: false })),
  };
  await tx.store.add(record);
  await tx.done;
  return record;
}

export async function getPendingTransaction(db: WalletDB): Promise<Transaction | undefined> {
  const list = await db.getAllFromIndex('transactions', 'status', 'pending');
  return list.sort((a, b) => a.createdAt - b.createdAt)[0];
}

export async function setLineSwiped(db: WalletDB, txId: string, cardId: string, swiped: boolean): Promise<void> {
  const tx = db.transaction('transactions', 'readwrite');
  const record = await tx.store.get(txId);
  if (record && record.status === 'pending') {
    record.lines = record.lines.map((l) => (l.cardId === cardId ? { ...l, swiped } : l));
    await tx.store.put(record);
  }
  await tx.done;
}

/** 「這筆沒刷成功」：刪除 pending 交易，餘額不變（DT-08） */
export async function cancelPendingTransaction(db: WalletDB, txId: string): Promise<void> {
  const tx = db.transaction('transactions', 'readwrite');
  const record = await tx.store.get(txId);
  if (record && record.status === 'pending') await tx.store.delete(txId);
  await tx.done;
}

/**
 * 回填確認（FR-05）：卡片餘額與交易狀態在同一個 DB transaction 內寫入（DT-09）。
 * source = 'receipt' 表示對照收據確認；'estimated' 表示略過、採用推算值。
 */
export async function confirmTransaction(
  db: WalletDB,
  txId: string,
  balancesAfter: Record<string, number>,
  source: 'receipt' | 'estimated',
  now = Date.now(),
): Promise<Transaction> {
  const tx = db.transaction(['cards', 'transactions'], 'readwrite');
  const fail = async (message: string): Promise<never> => {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error(message);
  };
  const txStore = tx.objectStore('transactions');
  const cardStore = tx.objectStore('cards');
  const record = await txStore.get(txId);
  if (!record || record.status !== 'pending') return fail('找不到未回填的結帳');

  const updatedCards: Card[] = [];
  const lines: TransactionLine[] = [];
  for (const line of record.lines) {
    const after = balancesAfter[line.cardId] ?? line.balanceBefore - line.plannedDeduct;
    if (!isNonNegativeInt(after) || after > line.balanceBefore) return fail('餘額必須是 0 到刷卡前餘額之間的整數');
    const card = await cardStore.get(line.cardId);
    if (!card) return fail('結帳中的卡片已不存在');
    updatedCards.push({ ...card, balance: after, balanceSource: source, updatedAt: now });
    lines.push({ ...line, balanceAfter: after });
  }
  const confirmed: Transaction = { ...record, status: 'confirmed', confirmedAt: now, lines };
  for (const c of updatedCards) await cardStore.put(c);
  await txStore.put(confirmed);
  await tx.done;
  return confirmed;
}

// ───────── 設定 ─────────

export async function getSettings(db: WalletDB): Promise<Settings> {
  const stored = await db.get('settings', SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(db: WalletDB, patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings(db)), ...patch };
  await db.put('settings', next, SETTINGS_KEY);
  return next;
}
