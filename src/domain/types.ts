// 資料模型（開發指引 §4）

export type BarcodeFormat = 'CODE_128';

export type BalanceSource = 'receipt' | 'estimated' | 'initial';
export type CardStatus = 'active' | 'archived';
export type Strategy = 'min_cards' | 'clear_fragments';

export interface Card {
  id: string;
  code: string; // 上方條碼：16 位數字（卡面有印）；畫面只顯示末 4 碼
  hiddenCode: string; // 下方條碼：8 位英數字（卡面未印）；畫面一律不以文字顯示
  format: BarcodeFormat;
  faceValue: number;
  balance: number;
  balanceSource: BalanceSource;
  nickname?: string;
  photoBlob?: Blob;
  status: CardStatus;
  createdAt: number;
  updatedAt: number;
}

export interface TransactionLine {
  cardId: string;
  order: number; // 出示順序，從 1 起算
  plannedDeduct: number;
  balanceBefore: number;
  balanceAfter?: number; // 回填後才有值
  swiped: boolean;
}

export interface Transaction {
  id: string;
  status: 'pending' | 'confirmed';
  createdAt: number;
  confirmedAt?: number;
  totalAmount: number;
  strategyUsed: Strategy | 'manual';
  lines: TransactionLine[];
  cashTopUp: number;
  note?: string;
}

export interface Settings {
  defaultStrategy: Strategy;
  maxCardsPerTransaction: number;
  archiveThreshold: number;
  maxCashTopUpForClear: number; // v1.5 §8.5 B-3：為多清空零頭卡，願意比策略 A 多付的現金上限（元）
  lockEnabled: boolean;
  lockMethod: 'webauthn' | 'pin';
  pinHash?: string;
  pinSalt?: string;
  webauthnCredentialId?: string;
  failedAttempts: number;
  lockedUntil?: number;
  lastExportAt?: number;
  backupReminderSnoozedUntil?: number;
  onboardingDone: boolean;
  hideBrightnessHint: boolean; // FR-04「請將亮度調到最高」不再顯示
}

export const DEFAULT_SETTINGS: Settings = {
  defaultStrategy: 'clear_fragments',
  maxCardsPerTransaction: 6,
  archiveThreshold: 0,
  maxCashTopUpForClear: 20,
  lockEnabled: false,
  lockMethod: 'pin',
  failedAttempts: 0,
  onboardingDone: false,
  hideBrightnessHint: false,
};
