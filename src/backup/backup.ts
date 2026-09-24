// FR-07 備份與還原：蒐集資料、打包、還原
//
// 兩種還原模式（§5 FR-07）：
// - overwrite（覆蓋）：清空後照抄備份檔。換手機、手機重置後用這個。
// - merge（合併）：以卡號比對，相同卡號不重複建立，**餘額以匯入檔為準**並回報衝突。
//
// 所有寫入都在單一 IndexedDB transaction 內（DT-09 的一致性要求同樣適用）：
// 要嘛整份進去，要嘛完全沒動。因此照片的 base64 解碼一律在開 transaction 之前做完
// ——在 transaction 內 await 非 IDB 的工作會讓它自動結束。

import { SETTINGS_KEY, newId, type WalletDB } from '../db/db';
import { DEFAULT_SETTINGS, type Card, type Settings, type Transaction } from '../domain/types';
import { decryptBackup, encryptBackup, BackupFormatError, DEFAULT_ITERATIONS } from './format';

export const BACKUP_SCHEMA_VERSION = 1;

/**
 * 不進備份檔的設定欄位。
 * 前三個是 §5 FR-07 明文要求（PIN 與 WebAuthn 憑證）；
 * 後兩個是「這支手機此刻的鎖定狀態」，帶到另一支手機上沒有意義，還可能讓人一匯入就被鎖住。
 */
const SETTINGS_EXCLUDED = ['pinHash', 'pinSalt', 'webauthnCredentialId', 'failedAttempts', 'lockedUntil'] as const;

export interface BackupPhoto {
  type: string;
  data: string; // base64
}

export type BackupCard = Omit<Card, 'photoBlob'> & { photo?: BackupPhoto };

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: number;
  cards: BackupCard[];
  transactions: Transaction[];
  settings: Partial<Settings>;
}

export interface ImportConflict {
  last4: string;
  localBalance: number;
  importedBalance: number;
}

export type ImportMode = 'merge' | 'overwrite';

export interface ImportResult {
  mode: ImportMode;
  cardsAdded: number;
  cardsUpdated: number;
  /** 卡號不同但隱藏碼撞到既有卡片：資料有疑問，不硬寫 */
  cardsSkipped: number;
  conflicts: ImportConflict[];
  transactionsAdded: number;
}

// ───────── base64 ↔ Blob ─────────

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // 一次攤太多參數會爆堆疊，照片動輒數百 KB，分塊處理
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBlob({ data, type }: BackupPhoto): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

// ───────── 蒐集 ─────────

function stripSettings(settings: Settings): Partial<Settings> {
  const out: Record<string, unknown> = { ...settings };
  for (const key of SETTINGS_EXCLUDED) delete out[key];
  return out as Partial<Settings>;
}

/** 讀出整份資料（含封存卡片與已完成交易），照片轉 base64 */
export async function collectBackup(db: WalletDB, now = Date.now()): Promise<BackupPayload> {
  const [rawCards, transactions, storedSettings] = await Promise.all([
    db.getAll('cards'),
    db.getAll('transactions'),
    db.get('settings', SETTINGS_KEY),
  ]);

  const cards = await Promise.all(
    rawCards.map(async ({ photoBlob, ...rest }): Promise<BackupCard> => {
      if (!photoBlob) return rest;
      return { ...rest, photo: { type: photoBlob.type || 'image/jpeg', data: await blobToBase64(photoBlob) } };
    }),
  );

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now,
    cards,
    transactions,
    settings: stripSettings({ ...DEFAULT_SETTINGS, ...storedSettings }),
  };
}

// ───────── 還原 ─────────

function toCard(input: BackupCard): Card {
  const { photo, ...rest } = input;
  return photo ? { ...rest, photoBlob: base64ToBlob(photo) } : rest;
}

export function isBackupPayload(value: unknown): value is BackupPayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<BackupPayload>;
  return typeof p.schemaVersion === 'number' && Array.isArray(p.cards) && Array.isArray(p.transactions);
}

export async function applyBackup(
  db: WalletDB,
  payload: BackupPayload,
  mode: ImportMode,
  now = Date.now(),
): Promise<ImportResult> {
  // 照片解碼放在 transaction 之外（見檔頭說明）
  const incoming = payload.cards.map(toCard);

  const result: ImportResult = {
    mode,
    cardsAdded: 0,
    cardsUpdated: 0,
    cardsSkipped: 0,
    conflicts: [],
    transactionsAdded: 0,
  };

  const tx = db.transaction(['cards', 'transactions', 'settings'], 'readwrite');
  const cardStore = tx.objectStore('cards');
  const txStore = tx.objectStore('transactions');

  if (mode === 'overwrite') {
    await cardStore.clear();
    await txStore.clear();
    for (const card of incoming) {
      await cardStore.put(card);
      result.cardsAdded++;
    }
    for (const t of payload.transactions) {
      await txStore.put(t);
      result.transactionsAdded++;
    }
    // 覆蓋模式連設定一起還原；備份檔裡本來就沒有 PIN 與鎖定狀態
    await tx.objectStore('settings').put({ ...DEFAULT_SETTINGS, ...payload.settings }, SETTINGS_KEY);
  } else {
    const existing = await cardStore.getAll();
    const byCode = new Map(existing.map((c) => [c.code, c]));
    const byHidden = new Map(existing.map((c) => [c.hiddenCode, c]));
    const localIds = new Set(existing.map((c) => c.id));

    for (const card of incoming) {
      const local = byCode.get(card.code);
      if (local) {
        if (local.balance !== card.balance) {
          result.conflicts.push({
            last4: card.code.slice(-4),
            localBalance: local.balance,
            importedBalance: card.balance,
          });
        }
        // 餘額以匯入檔為準（DT-05）。照片本機有就留著，備份檔有才補上。
        await cardStore.put({ ...local, ...card, id: local.id, photoBlob: card.photoBlob ?? local.photoBlob, updatedAt: now });
        result.cardsUpdated++;
      } else if (byHidden.has(card.hiddenCode)) {
        // 卡號不同卻共用隱藏碼 = 兩邊至少有一邊的資料是錯的，交給人判斷，不自動寫入
        result.cardsSkipped++;
      } else {
        // id 撞到只可能是 UUID 相撞（實務上不會發生），還是讓它換一個而不是蓋掉別人
        await cardStore.add(localIds.has(card.id) ? { ...card, id: newId() } : card);
        result.cardsAdded++;
      }
    }

    // 合併模式只補本機沒有的交易紀錄；設定維持本機的不動
    const hasLocalPending = (await txStore.index('status').count('pending')) > 0;
    for (const t of payload.transactions) {
      if (await txStore.get(t.id)) continue;
      // 「同時只有一筆未回填結帳」是資料層的前提，合併不得把它破壞掉
      if (t.status === 'pending' && hasLocalPending) continue;
      await txStore.put(t);
      result.transactionsAdded++;
    }
  }

  await tx.done;
  return result;
}

// ───────── 對外入口 ─────────

export interface ExportOptions {
  iterations?: number;
  now?: number;
}

/** 匯出成 .7cw 位元組，並記下匯出時間（M5 的 14 天提醒要用） */
export async function exportBackup(
  db: WalletDB,
  password: string,
  { iterations = DEFAULT_ITERATIONS, now = Date.now() }: ExportOptions = {},
): Promise<{ bytes: Uint8Array; filename: string }> {
  const payload = await collectBackup(db, now);
  // 密碼空白會在這裡就丟出，下面的 lastExportAt 不會被寫到
  const bytes = await encryptBackup(JSON.stringify(payload), password, { iterations });

  const stamp = new Date(now).toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16).replace(/[-: ]/g, '');
  const settings = await db.get('settings', SETTINGS_KEY);
  await db.put('settings', { ...DEFAULT_SETTINGS, ...settings, lastExportAt: now }, SETTINGS_KEY);

  return { bytes, filename: `7cw-backup-${stamp}.7cw` };
}

/**
 * 匯入 .7cw。密碼錯誤時在碰資料庫之前就丟出（DT-06：不得留下部分寫入的資料）。
 */
export async function importBackup(
  db: WalletDB,
  bytes: Uint8Array,
  password: string,
  mode: ImportMode,
  now = Date.now(),
): Promise<ImportResult> {
  const json = await decryptBackup(bytes, password);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BackupFormatError('WRONG_PASSWORD', '備份檔內容無法解析，檔案可能已損毀');
  }
  if (!isBackupPayload(parsed)) {
    throw new BackupFormatError('NOT_A_BACKUP', '備份檔內容不完整，無法匯入');
  }
  if (parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupFormatError('UNSUPPORTED_VERSION', '這個備份檔來自較新版本的 App，請先更新 App 再匯入');
  }

  return applyBackup(db, parsed, mode, now);
}
