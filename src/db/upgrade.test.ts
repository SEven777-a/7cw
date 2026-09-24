// schema 升級安全性（無對應 DT 編號，屬分享前的防炸測試）
//
// 這組測試存在的唯一理由：upgrade() 若沒有 oldVersion 分支，
// DB_VERSION 一推到 2，既有使用者開 App 就 ConstraintError，卡片全部讀不到。
// 一旦 App 分享出去，這種錯誤是沒有回頭票的，所以在這裡釘死。

import 'fake-indexeddb/auto';
import { openDB, type IDBPDatabase } from 'idb';
import { describe, expect, it } from 'vitest';
import { upgradeWalletDB } from './db';

// 每個測試用獨立 DB 名稱，避免互相影響
let seq = 0;
const nextName = () => `upgrade-test-${++seq}`;

function open(name: string, version: number): Promise<IDBPDatabase> {
  return openDB(name, version, {
    upgrade(db, oldVersion) {
      // 這裡刻意不帶 WalletSchema：測試要驗的是升級行為，不是型別
      upgradeWalletDB(db as never, oldVersion);
    },
  });
}

describe('upgradeWalletDB（schema 升級）', () => {
  it('全新安裝（oldVersion 0）建立三個 store', async () => {
    const name = nextName();
    const db = await open(name, 1);
    expect([...db.objectStoreNames].sort()).toEqual(['cards', 'settings', 'transactions']);
    db.close();
  });

  it('版本從 1 升到 2 不得丟 ConstraintError（既有使用者的升級路徑）', async () => {
    const name = nextName();
    const first = await open(name, 1);
    first.close();

    // 這一行就是整組測試的重點：以前會在這裡炸掉
    await expect(open(name, 2)).resolves.toBeDefined();
  });

  it('升級後既有卡片資料仍在', async () => {
    const name = nextName();
    const first = await open(name, 1);
    await first.put('cards', { id: 'c1', code: '7100000000000011', hiddenCode: 'TESTAA01', balance: 35, status: 'active' });
    first.close();

    const second = await open(name, 2);
    const card = await second.get('cards', 'c1');
    expect(card).toMatchObject({ id: 'c1', balance: 35 });
    second.close();
  });

  it('連跳多版（1 → 5）也不得丟錯', async () => {
    const name = nextName();
    const first = await open(name, 1);
    first.close();
    await expect(open(name, 5)).resolves.toBeDefined();
  });

  it('重複開同一版本不會重建 store', async () => {
    const name = nextName();
    const first = await open(name, 1);
    await first.put('cards', { id: 'c1', code: '7100000000000011', hiddenCode: 'TESTAA01', balance: 35, status: 'active' });
    first.close();

    const second = await open(name, 1);
    expect(await second.get('cards', 'c1')).toBeDefined();
    second.close();
  });

  it('索引在全新安裝時都建好了', async () => {
    const name = nextName();
    const db = await open(name, 1);
    const cards = db.transaction('cards').store;
    expect([...cards.indexNames].sort()).toEqual(['balance', 'code', 'hiddenCode', 'status']);
    db.close();
  });
});
