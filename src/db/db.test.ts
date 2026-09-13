// 資料層測試（開發指引 §10.2）；DT-04~06、DT-10 屬匯出匯入，於 M4 補上
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCard,
  archiveCard,
  cancelPendingTransaction,
  confirmTransaction,
  createPendingTransaction,
  deleteCardPermanently,
  getCard,
  getPendingTransaction,
  getSettings,
  listCards,
  openWalletDB,
  restoreCard,
  saveSettings,
  type WalletDB,
} from './db';

let db: WalletDB;
let n = 0;
beforeEach(async () => {
  n += 1;
  db = await openWalletDB(`test-${n}`);
});

// 虛構卡號
const A = { code: '1234567890120001', hiddenCode: 'AB12CD01', faceValue: 35 };
const B = { code: '1234567890120002', hiddenCode: 'AB12CD02', faceValue: 50 };

async function mustAdd(input: typeof A) {
  const r = await addCard(db, input);
  if (!r.ok) throw new Error(r.reason);
  return r.card;
}

describe('§10.2 資料層', () => {
  it('新增卡片預設餘額等於面額、來源 initial', async () => {
    const c = await mustAdd(A);
    expect(c.balance).toBe(35);
    expect(c.balanceSource).toBe('initial');
    expect(c.status).toBe('active');
  });

  it('DT-01 重複卡號或重複隱藏碼', async () => {
    const first = await mustAdd(A);
    const dup = await addCard(db, A);
    expect(dup).toMatchObject({ ok: false, reason: 'DUPLICATE' });
    const partialCode = await addCard(db, { ...B, code: A.code });
    expect(partialCode).toMatchObject({ ok: false, reason: 'PARTIAL_DUPLICATE' });
    const partialHidden = await addCard(db, { ...B, hiddenCode: A.hiddenCode });
    expect(partialHidden).toMatchObject({ ok: false, reason: 'PARTIAL_DUPLICATE' });
    if (!dup.ok) expect(dup.existing?.id).toBe(first.id);
    expect(await listCards(db)).toHaveLength(1);
  });

  it('DT-01b 只掃到一條條碼不得存檔', async () => {
    expect(await addCard(db, { code: A.code, faceValue: 35 })).toMatchObject({ ok: false, reason: 'MISSING_HIDDEN_CODE' });
    expect(await addCard(db, { ...A, hiddenCode: '' })).toMatchObject({ ok: false, reason: 'MISSING_HIDDEN_CODE' });
    expect(await listCards(db)).toHaveLength(0);
  });

  it('DT-01c 格式不符', async () => {
    expect(await addCard(db, { ...A, hiddenCode: 'AB12CD0' })).toMatchObject({ reason: 'INVALID_HIDDEN_CODE' });
    expect(await addCard(db, { ...A, hiddenCode: 'ab12cd01' })).toMatchObject({ reason: 'INVALID_HIDDEN_CODE' });
    expect(await addCard(db, { ...A, code: '12345678901200A1' })).toMatchObject({ reason: 'INVALID_CODE' });
    expect(await addCard(db, { ...A, faceValue: 35.5 })).toMatchObject({ reason: 'INVALID_AMOUNT' });
    expect(await listCards(db)).toHaveLength(0);
  });

  it('DT-02 回填餘額後寫入 Transaction', async () => {
    const a = await mustAdd(A);
    const b = await mustAdd(B);
    const t = await createPendingTransaction(db, {
      totalAmount: 60,
      strategyUsed: 'clear_fragments',
      cashTopUp: 0,
      lines: [
        { cardId: a.id, plannedDeduct: 35, balanceBefore: 35 },
        { cardId: b.id, plannedDeduct: 25, balanceBefore: 50 },
      ],
    });
    const done = await confirmTransaction(db, t.id, { [a.id]: 0, [b.id]: 24 }, 'receipt');
    expect(done.status).toBe('confirmed');
    expect((await getCard(db, a.id))?.balance).toBe(0);
    const cardB = await getCard(db, b.id);
    expect(cardB?.balance).toBe(24);
    expect(cardB?.balanceSource).toBe('receipt');
    expect(done.lines.find((l) => l.cardId === b.id)?.balanceAfter).toBe(24);
    expect(await getPendingTransaction(db)).toBeUndefined();
  });

  it('DT-03 回填中途關閉 App：pending 保留、餘額不變', async () => {
    const a = await mustAdd(A);
    await createPendingTransaction(db, {
      totalAmount: 10,
      strategyUsed: 'manual',
      cashTopUp: 0,
      lines: [{ cardId: a.id, plannedDeduct: 10, balanceBefore: 35 }],
    });
    db.close();
    db = await openWalletDB(`test-${n}`);
    expect((await getPendingTransaction(db))?.status).toBe('pending');
    expect((await getCard(db, a.id))?.balance).toBe(35);
    await expect(
      createPendingTransaction(db, { totalAmount: 5, strategyUsed: 'manual', cashTopUp: 0, lines: [] }),
    ).rejects.toThrow();
  });

  it('DT-07 封存後還原', async () => {
    const a = await mustAdd({ ...A });
    await archiveCard(db, a.id);
    expect(await listCards(db, 'active')).toHaveLength(0);
    expect(await listCards(db, 'archived')).toHaveLength(1);
    const restored = await restoreCard(db, a.id);
    expect(restored.status).toBe('active');
    expect(restored.balance).toBe(35);
  });

  it('DT-08 這筆沒刷成功：刪除 pending、餘額不變', async () => {
    const a = await mustAdd(A);
    const t = await createPendingTransaction(db, {
      totalAmount: 20,
      strategyUsed: 'manual',
      cashTopUp: 0,
      lines: [{ cardId: a.id, plannedDeduct: 20, balanceBefore: 35 }],
    });
    await cancelPendingTransaction(db, t.id);
    expect(await getPendingTransaction(db)).toBeUndefined();
    expect((await getCard(db, a.id))?.balance).toBe(35);
  });

  it('DT-09 回填寫入中斷時 Card 與 Transaction 同時失敗', async () => {
    const a = await mustAdd(A);
    const b = await mustAdd(B);
    const t = await createPendingTransaction(db, {
      totalAmount: 60,
      strategyUsed: 'manual',
      cashTopUp: 0,
      lines: [
        { cardId: a.id, plannedDeduct: 35, balanceBefore: 35 },
        { cardId: b.id, plannedDeduct: 25, balanceBefore: 50 },
      ],
    });
    // 第二張卡的回填值不合法 → 整筆中止，第一張也不得被寫入
    await expect(confirmTransaction(db, t.id, { [a.id]: 0, [b.id]: 999 }, 'receipt')).rejects.toThrow();
    expect((await getCard(db, a.id))?.balance).toBe(35);
    expect((await getPendingTransaction(db))?.id).toBe(t.id);
  });

  it('pending 交易中的卡不可實體刪除', async () => {
    const a = await mustAdd(A);
    await createPendingTransaction(db, {
      totalAmount: 10,
      strategyUsed: 'manual',
      cashTopUp: 0,
      lines: [{ cardId: a.id, plannedDeduct: 10, balanceBefore: 35 }],
    });
    await expect(deleteCardPermanently(db, a.id)).rejects.toThrow();
    expect(await getCard(db, a.id)).toBeDefined();
  });

  it('設定有預設值且可部分更新', async () => {
    expect((await getSettings(db)).maxCardsPerTransaction).toBe(6);
    await saveSettings(db, { maxCardsPerTransaction: 4 });
    const s = await getSettings(db);
    expect(s.maxCardsPerTransaction).toBe(4);
    expect(s.defaultStrategy).toBe('clear_fragments');
  });
});
