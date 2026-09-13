// 卡片條碼格式驗證（開發指引 §4「格式驗證」）
// 依目前樣本推定；出現不符的卡時停下來確認，不要放寬規則

export const CODE_PATTERN = /^\d{16}$/;
export const HIDDEN_CODE_PATTERN = /^[0-9A-Z]{8}$/;

export function isValidCode(text: string): boolean {
  return CODE_PATTERN.test(text);
}

export function isValidHiddenCode(text: string): boolean {
  return HIDDEN_CODE_PATTERN.test(text);
}

/** 依內容格式判斷是哪一條條碼（不依畫面上下位置，FR-01） */
export function classifyBarcode(text: string): 'code' | 'hiddenCode' | null {
  if (isValidCode(text)) return 'code';
  if (isValidHiddenCode(text)) return 'hiddenCode';
  return null;
}

/** 卡號末 4 碼，畫面上識別卡片用 */
export function last4(code: string): string {
  return code.slice(-4);
}

export function isPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

export function isNonNegativeInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}
