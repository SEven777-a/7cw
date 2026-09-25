// initialFaceChoice 純函式測試（FR-01 連續新增沿用面額）

import { describe, expect, it } from 'vitest';
import { initialFaceChoice } from './face-value';

describe('initialFaceChoice（新增卡片的面額預設值）', () => {
  it('本次還沒存過 → 預設 35', () => {
    expect(initialFaceChoice(null)).toEqual({ face: 35, otherFace: '' });
  });

  it('上一張是快捷面額 → 直接選同一個按鈕', () => {
    expect(initialFaceChoice(50)).toEqual({ face: 50, otherFace: '' });
    expect(initialFaceChoice(100)).toEqual({ face: 100, otherFace: '' });
  });

  it('上一張是「其他」面額 → 選「其他」並帶入數字', () => {
    expect(initialFaceChoice(200)).toEqual({ face: 'other', otherFace: '200' });
  });
});
