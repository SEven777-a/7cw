// FR-07 備份檔容器：加密、解密與二進位格式
//
// 版面（§4 FR-07，位元組）：
//   0..3   魔術字 "7CW1"
//   4      格式版本 (1 byte)
//   5..8   PBKDF2 iterations (uint32, big-endian)
//   9..24  salt (16 bytes)
//   25..36 iv (12 bytes)
//   37..   AES-GCM 密文（含 16 bytes tag）
//
// iterations 寫進檔案而不是寫死在程式裡：日後調高次數時，舊備份檔仍要解得開。

export const MAGIC = '7CW1';
export const FORMAT_VERSION = 1;
/** §4 FR-07 指定值。刻意慢，用來擋離線暴力破解 */
export const DEFAULT_ITERATIONS = 600_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const HEADER_BYTES = 4 + 1 + 4 + SALT_BYTES + IV_BYTES;

export type BackupErrorCode =
  | 'EMPTY_PASSWORD'
  | 'NOT_A_BACKUP' // 魔術字不對或檔案太短：根本不是 .7cw
  | 'UNSUPPORTED_VERSION' // 是備份檔，但版本比這支 App 新
  | 'WRONG_PASSWORD'; // 解密失敗。AES-GCM 驗證不過，也可能是檔案損毀

export class BackupFormatError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

/** 給使用者看的訊息。UI 直接用，不要自己拼 */
export function backupErrorMessage(code: BackupErrorCode): string {
  switch (code) {
    case 'EMPTY_PASSWORD':
      return '請輸入密碼';
    case 'NOT_A_BACKUP':
      return '這不是 7cw 備份檔，請確認選到的是 .7cw 檔案';
    case 'UNSUPPORTED_VERSION':
      return '這個備份檔來自較新版本的 App，請先更新 App 再匯入';
    case 'WRONG_PASSWORD':
      return '密碼不對，或檔案已損毀。沒有任何資料被改動';
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** 明文 JSON → 加密後的備份檔位元組 */
export async function encryptBackup(
  plaintext: string,
  password: string,
  { iterations = DEFAULT_ITERATIONS }: { iterations?: number } = {},
): Promise<Uint8Array> {
  if (!password) throw new BackupFormatError('EMPTY_PASSWORD', backupErrorMessage('EMPTY_PASSWORD'));

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, iterations);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext)),
  );

  const out = new Uint8Array(HEADER_BYTES + cipher.length);
  out.set(new TextEncoder().encode(MAGIC), 0);
  out[4] = FORMAT_VERSION;
  new DataView(out.buffer).setUint32(5, iterations, false);
  out.set(salt, 9);
  out.set(iv, 9 + SALT_BYTES);
  out.set(cipher, HEADER_BYTES);
  return out;
}

/** 備份檔位元組 → 明文 JSON。密碼錯誤一律丟 WRONG_PASSWORD，不透露任何內容 */
export async function decryptBackup(bytes: Uint8Array, password: string): Promise<string> {
  if (!password) throw new BackupFormatError('EMPTY_PASSWORD', backupErrorMessage('EMPTY_PASSWORD'));
  if (bytes.length <= HEADER_BYTES) throw new BackupFormatError('NOT_A_BACKUP', backupErrorMessage('NOT_A_BACKUP'));
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) {
    throw new BackupFormatError('NOT_A_BACKUP', backupErrorMessage('NOT_A_BACKUP'));
  }
  if (bytes[4] > FORMAT_VERSION) {
    throw new BackupFormatError('UNSUPPORTED_VERSION', backupErrorMessage('UNSUPPORTED_VERSION'));
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const iterations = view.getUint32(5, false);
  const salt = bytes.subarray(9, 9 + SALT_BYTES);
  const iv = bytes.subarray(9 + SALT_BYTES, HEADER_BYTES);
  const cipher = bytes.subarray(HEADER_BYTES);

  try {
    const key = await deriveKey(password, salt, iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, cipher as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    throw new BackupFormatError('WRONG_PASSWORD', backupErrorMessage('WRONG_PASSWORD'));
  }
}
