// FR-01 面額預設值：連續新增時沿用上一張存檔的面額（小卡通常一疊同面額）

export const FACE_VALUES = [35, 50, 100];

export interface FaceChoice {
  face: number | 'other';
  otherFace: string; // face = 'other' 時輸入框的內容
}

/** 依上一張存檔的面額決定表單初始選項；本次還沒存過（null）時預設 35 */
export function initialFaceChoice(lastFace: number | null): FaceChoice {
  if (lastFace === null) return { face: 35, otherFace: '' };
  if (FACE_VALUES.includes(lastFace)) return { face: lastFace, otherFace: '' };
  return { face: 'other', otherFace: String(lastFace) };
}
