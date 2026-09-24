// 備份與還原測試（開發指引 §10.2 DT-04、DT-05、DT-06、DT-10）
//
// 卡號一律虛構。iterations 除了特別標明的那條以外都調低，
// 600,000 次 PBKDF2 每跑一次要數百毫秒，測試不需要為了驗邏輯付這個代價。

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addCard, getSettings, openWalletDB, saveSettings, type WalletDB } from '../db/db';
import { BackupFormatError, DEFAULT_ITERATIONS, decryptBackup, encryptBackup, MAGIC } from './format';
import { collectBackup, exportBackup, importBackup, markExported } from './backup';

const FAST = { iterations: 1000 };

// 虛構測試卡
const CARD_A = { code: '7100000000000011', hiddenCode: 'TESTAA01', faceValue: 35 };
const CARD_B = { code: '7100000000000029', hiddenCode: 'TESTAA02', faceValue: 50 };
const CARD_C = { code: '7100000000000037', hiddenCode: 'TESTBB03', faceValue: 100 };

let seq = 0;
async function freshDB(): Promise<WalletDB> {
  return openWalletDB(`backup-test-${++seq}`);
}

function makePhoto(): Blob {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5])], { type: 'image/jpeg' });
}

describe('備份檔格式', () => {
  it('加密後以魔術字 7CW1 開頭，版本為 1', async () => {
    const bytes = await encryptBackup('{"hello":1}', 'pw', FAST);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe(MAGIC);
    expect(bytes[4]).toBe(1);
  });

  it('iterations 寫進檔頭，解密時照檔案裡的值跑（日後調高才解得開舊檔）', async () => {
    const bytes = await encryptBackup('{"hello":1}', 'pw', { iterations: 4321 });
    expect(new DataView(bytes.buffer).getUint32(5, false)).toBe(4321);
    await expect(decryptBackup(bytes, 'pw')).resolves.toBe('{"hello":1}');
  });

  it('同樣內容加密兩次結果不同（salt / iv 每次重新產生）', async () => {
    const a = await encryptBackup('{"hello":1}', 'pw', FAST);
    const b = await encryptBackup('{"hello":1}', 'pw', FAST);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('預設 iterations 為規格要求的 600,000', () => {
    expect(DEFAULT_ITERATIONS).toBe(600_000);
  });

  it('空密碼直接拒絕，不產生檔案', async () => {
    await expect(encryptBackup('{}', '', FAST)).rejects.toMatchObject({ code: 'EMPTY_PASSWORD' });
  });

  it('不是備份檔 → NOT_A_BACKUP', async () => {
    await expect(decryptBackup(new Uint8Array(200), 'pw')).rejects.toMatchObject({ code: 'NOT_A_BACKUP' });
  });

  it('檔案太短 → NOT_A_BACKUP', async () => {
    await expect(decryptBackup(new TextEncoder().encode('7CW1'), 'pw')).rejects.toMatchObject({ code: 'NOT_A_BACKUP' });
  });

  it('格式版本比 App 新 → UNSUPPORTED_VERSION', async () => {
    const bytes = await encryptBackup('{}', 'pw', FAST);
    bytes[4] = 99;
    await expect(decryptBackup(bytes, 'pw')).rejects.toMatchObject({ code: 'UNSUPPORTED_VERSION' });
  });

  it('密文被竄改 → WRONG_PASSWORD（AES-GCM 驗不過）', async () => {
    const bytes = await encryptBackup('{"hello":1}', 'pw', FAST);
    bytes[bytes.length - 1] ^= 0xff;
    await expect(decryptBackup(bytes, 'pw')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });
});

describe('DT-10 匯出檔內容不得含明文卡號', () => {
  it('二進位搜尋找不到任何一張卡的 16 碼卡號與 8 碼隱藏碼', async () => {
    const db = await freshDB();
    await addCard(db, CARD_A);
    await addCard(db, CARD_B);

    const { bytes } = await exportBackup(db, 'pw', FAST);
    const haystack = Buffer.from(bytes);

    for (const card of [CARD_A, CARD_B]) {
      expect(haystack.includes(Buffer.from(card.code, 'utf8'))).toBe(false);
      expect(haystack.includes(Buffer.from(card.hiddenCode, 'utf8'))).toBe(false);
      // base64 也要找不到，否則等於換個編碼照樣外洩
      expect(haystack.includes(Buffer.from(Buffer.from(card.code).toString('base64')))).toBe(false);
    }
    db.close();
  });

  it('檔名帶時間戳、副檔名為 .7cw', async () => {
    const db = await freshDB();
    const { filename } = await exportBackup(db, 'pw', { ...FAST, now: Date.parse('2026-09-24T02:30:00Z') });
    expect(filename).toMatch(/^7cw-backup-\d{8}\d{4}\.7cw$/);
    db.close();
  });

  // 「上次備份」的時間點刻意不由 exportBackup 決定：
  // 位元組做好不等於使用者把檔案存出去了（iOS 分享面板可以按取消）。
  // 若在產生位元組時就記成已備份，畫面會顯示今天備份過、14 天提醒也會安靜，實際卻一個檔案都沒有。
  it('產生備份檔本身不會寫 lastExportAt', async () => {
    const db = await freshDB();
    await exportBackup(db, 'pw', { ...FAST, now: Date.parse('2026-09-24T02:30:00Z') });
    expect((await getSettings(db)).lastExportAt).toBeUndefined();
    db.close();
  });

  it('檔案確實送出去後，markExported 才記下時間', async () => {
    const db = await freshDB();
    const now = Date.parse('2026-09-24T02:30:00Z');
    await exportBackup(db, 'pw', { ...FAST, now });
    await markExported(db, now);
    expect((await getSettings(db)).lastExportAt).toBe(now);
    db.close();
  });

  it('markExported 不動其他設定', async () => {
    const db = await freshDB();
    await saveSettings(db, { maxCardsPerTransaction: 3 });
    await markExported(db, 123);
    const s = await getSettings(db);
    expect(s.maxCardsPerTransaction).toBe(3);
    expect(s.lastExportAt).toBe(123);
    db.close();
  });

  it('密碼空白時連備份檔都產不出來', async () => {
    const db = await freshDB();
    await expect(exportBackup(db, '', FAST)).rejects.toMatchObject({ code: 'EMPTY_PASSWORD' });
    expect((await getSettings(db)).lastExportAt).toBeUndefined();
    db.close();
  });

  it('備份密碼本身絕對不進備份檔（鑰匙不能鎖在盒子裡）', async () => {
    const db = await freshDB();
    await addCard(db, CARD_A);
    await saveSettings(db, { rememberBackupPassword: true, backupPassword: 'PASSWORD_SHOULD_NOT_APPEAR' });

    const payload = await collectBackup(db);
    expect(payload.settings.backupPassword).toBeUndefined();
    // 記住密碼這個「開關」可以帶過去，密碼本身不行
    expect(payload.settings.rememberBackupPassword).toBe(true);

    const { bytes } = await exportBackup(db, 'pw', FAST);
    expect(Buffer.from(bytes).includes(Buffer.from('PASSWORD_SHOULD_NOT_APPEAR'))).toBe(false);
    db.close();
  });

  it('PIN 與 WebAuthn 欄位不進備份檔', async () => {
    const db = await freshDB();
    await saveSettings(db, { pinHash: 'HASH_SHOULD_NOT_APPEAR', webauthnCredentialId: 'CRED_SHOULD_NOT_APPEAR', failedAttempts: 3 });
    const payload = await collectBackup(db);
    expect(payload.settings.pinHash).toBeUndefined();
    expect(payload.settings.webauthnCredentialId).toBeUndefined();
    expect(payload.settings.failedAttempts).toBeUndefined();
    // 一般設定要留著
    expect(payload.settings.maxCashTopUpForClear).toBe(20);
    db.close();
  });
});

describe('DT-04 匯出後匯入（覆蓋）', () => {
  it('卡片數、餘額、照片完全一致', async () => {
    const source = await freshDB();
    await addCard(source, { ...CARD_A, photoBlob: makePhoto() });
    await addCard(source, { ...CARD_B, balance: 12 });
    const { bytes } = await exportBackup(source, 'pw', FAST);
    source.close();

    const target = await freshDB();
    const result = await importBackup(target, bytes, 'pw', 'overwrite');
    expect(result.cardsAdded).toBe(2);

    const cards = (await target.getAll('cards')).sort((a, b) => a.code.localeCompare(b.code));
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ code: CARD_A.code, hiddenCode: CARD_A.hiddenCode, balance: 35 });
    expect(cards[1]).toMatchObject({ code: CARD_B.code, balance: 12 });

    // 照片要還原成同樣的位元組
    const photo = cards[0].photoBlob;
    expect(photo).toBeInstanceOf(Blob);
    expect(new Uint8Array(await photo!.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]));
    expect(photo!.type).toBe('image/jpeg');
    target.close();
  });

  it('覆蓋會清掉目標機原有的卡片', async () => {
    const source = await freshDB();
    await addCard(source, CARD_A);
    const { bytes } = await exportBackup(source, 'pw', FAST);
    source.close();

    const target = await freshDB();
    await addCard(target, CARD_C); // 這張不在備份檔裡
    await importBackup(target, bytes, 'pw', 'overwrite');

    const codes = (await target.getAll('cards')).map((c) => c.code);
    expect(codes).toEqual([CARD_A.code]);
    target.close();
  });

  it('封存的卡片也會被備份與還原', async () => {
    const source = await freshDB();
    const added = await addCard(source, CARD_A);
    if (!added.ok) throw new Error('前置失敗');
    await source.put('cards', { ...added.card, status: 'archived' });
    const { bytes } = await exportBackup(source, 'pw', FAST);
    source.close();

    const target = await freshDB();
    await importBackup(target, bytes, 'pw', 'overwrite');
    expect((await target.getAll('cards'))[0].status).toBe('archived');
    target.close();
  });
});

describe('DT-05 匯出後匯入（合併）', () => {
  it('相同卡號不重複建立，餘額以匯入檔為準並回報衝突', async () => {
    const source = await freshDB();
    await addCard(source, { ...CARD_A, balance: 20 });
    const { bytes } = await exportBackup(source, 'pw', FAST);
    source.close();

    const target = await freshDB();
    await addCard(target, { ...CARD_A, balance: 35 }); // 同一張卡，本機餘額不同
    await addCard(target, CARD_C); // 本機獨有

    const result = await importBackup(target, bytes, 'pw', 'merge');
    expect(result.cardsAdded).toBe(0);
    expect(result.cardsUpdated).toBe(1);
    expect(result.conflicts).toEqual([{ last4: '0011', localBalance: 35, importedBalance: 20 }]);

    const cards = await target.getAll('cards');
    expect(cards).toHaveLength(2); // 沒有重複建立
    expect(cards.find((c) => c.code === CARD_A.code)!.balance).toBe(20); // 以匯入檔為準
    expect(cards.find((c) => c.code === CARD_C.code)!.balance).toBe(100); // 本機獨有的留著
    target.close();
  });

  it('餘額相同就不算衝突', async () => {
    const source = await freshDB();
    await addCard(source, CARD_A);
    const { bytes } = await exportBackup(source, 'pw', FAST);
    source.close();

    const target = await freshDB();
    await addCard(target, CARD_A);
    const result = await importBackup(target, bytes, 'pw', 'merge');
    expect(result.conflicts).toEqual([]);
    expect(result.cardsUpdated).toBe(1);
    target.close();
  });

  it('備份檔裡的新卡會被加進來', async () => {
    const source = await freshDB();
    await addCard(source, CARD_A);
    await addCard(source, CARD_B);
    const { bytes } = await exportBackup(source, 'pw', FAST);
    source.close();

    const target = await freshDB();
    await addCard(target, CARD_A);
    const result = await importBackup(target, bytes, 'pw', 'merge');
    expect(result.cardsAdded).toBe(1);
    expect(await target.count('cards')).toBe(2);
    target.close();
  });

  it('卡號不同卻共用隱藏碼 → 跳過不寫，不讓唯一索引炸掉整筆匯入', async () => {
    const source = await freshDB();
    await addCard(source, { code: CARD_B.code, hiddenCode: CARD_A.hiddenCode, faceValue: 50 });
    const { bytes } = await exportBackup(source, 'pw', FAST);
    source.close();

    const target = await freshDB();
    await addCard(target, CARD_A); // 已經佔用了 TESTAA01
    const result = await importBackup(target, bytes, 'pw', 'merge');
    expect(result.cardsSkipped).toBe(1);
    expect(result.cardsAdded).toBe(0);
    expect(await target.count('cards')).toBe(1); // 本機那張還在
    target.close();
  });

  it('合併不覆蓋本機設定', async () => {
    const source = await freshDB();
    await saveSettings(source, { maxCardsPerTransaction: 3 });
    const { bytes } = await exportBackup(source, 'pw', FAST);
    source.close();

    const target = await freshDB();
    await saveSettings(target, { maxCardsPerTransaction: 6 });
    await importBackup(target, bytes, 'pw', 'merge');
    expect((await getSettings(target)).maxCardsPerTransaction).toBe(6);
    target.close();
  });

  it('覆蓋模式才會還原設定', async () => {
    const source = await freshDB();
    await saveSettings(source, { maxCardsPerTransaction: 3 });
    const { bytes } = await exportBackup(source, 'pw', FAST);
    source.close();

    const target = await freshDB();
    await saveSettings(target, { maxCardsPerTransaction: 6 });
    await importBackup(target, bytes, 'pw', 'overwrite');
    expect((await getSettings(target)).maxCardsPerTransaction).toBe(3);
    target.close();
  });
});

describe('DT-06 錯誤密碼匯入', () => {
  let target: WalletDB;
  let bytes: Uint8Array;

  beforeEach(async () => {
    const source = await freshDB();
    await addCard(source, CARD_A);
    await addCard(source, CARD_B);
    ({ bytes } = await exportBackup(source, 'pw-correct', FAST));
    source.close();

    target = await freshDB();
    await addCard(target, CARD_C);
  });

  it('明確報錯，且一張卡都沒被改動', async () => {
    await expect(importBackup(target, bytes, 'pw-wrong', 'overwrite')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });

    // 覆蓋模式若在解密前就動手，本機這張早就沒了
    const cards = await target.getAll('cards');
    expect(cards).toHaveLength(1);
    expect(cards[0].code).toBe(CARD_C.code);
  });

  it('錯誤是 BackupFormatError，訊息說明資料沒被改動', async () => {
    const err = await importBackup(target, bytes, 'pw-wrong', 'merge').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackupFormatError);
    expect((err as BackupFormatError).message).toContain('沒有任何資料被改動');
  });

  it('密碼正確就匯得進去（確認上面的失敗不是因為檔案本身壞了）', async () => {
    const result = await importBackup(target, bytes, 'pw-correct', 'merge');
    expect(result.cardsAdded).toBe(2);
    expect(await target.count('cards')).toBe(3);
  });
});

describe('整趟來回（換手機的實際路徑）', () => {
  it('用規格指定的 600,000 iterations 匯出再匯入，資料一致', async () => {
    const source = await freshDB();
    await addCard(source, { ...CARD_A, nickname: '阿嬤給的', photoBlob: makePhoto() });
    await addCard(source, { ...CARD_B, balance: 7 });
    const before = await collectBackup(source);
    const { bytes } = await exportBackup(source, '我的備份密碼 123'); // 不指定 iterations = 走預設
    source.close();

    const target = await freshDB();
    await importBackup(target, bytes, '我的備份密碼 123', 'overwrite');
    const after = await collectBackup(target);

    expect(after.cards).toHaveLength(before.cards.length);
    expect(after.cards.map((c) => [c.code, c.balance, c.nickname]).sort()).toEqual(
      before.cards.map((c) => [c.code, c.balance, c.nickname]).sort(),
    );
    target.close();
  }, 30_000);
});
