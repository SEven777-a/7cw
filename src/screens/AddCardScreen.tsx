// FR-01 新增卡片：同一畫面同時讀到兩條條碼才算成功，並保存該畫面為卡片照片

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '../app/wallet';
import { addCard, findByCodes } from '../db/db';
import { FACE_VALUES, initialFaceChoice } from '../domain/face-value';
import { isValidCode, last4, scanCompleteness } from '../domain/validate';
import { isIOS } from '../platform';
import { captureVideoFrame, compressToJpeg } from '../scan/photo';
import { detectCardCodes, warmUpDetector, type CardCodes } from '../scan/scanner';
import { BlobImage, Header, parseIntInput } from '../ui/common';

interface Scanned {
  code: string;
  hiddenCode: string;
  photo: Blob;
}

/** FR-01 補救：卡號條碼破損解不出，但下方條碼（hiddenCode）已經讀到 */
interface NeedCode {
  hiddenCode: string;
  photo: Blob;
}

export function AddCardScreen() {
  const { go } = useWallet();
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [needCode, setNeedCode] = useState<NeedCode | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  // 上一張存檔的面額；連續新增時下一張沿用
  const [lastFace, setLastFace] = useState<number | null>(null);

  return (
    <div className="screen">
      <Header
        title="新增卡片"
        onBack={() => go({ name: 'tabs', tab: 'cards' })}
        right={savedCount > 0 ? <span className="muted">本次 {savedCount} 張</span> : undefined}
      />
      {scanned ? (
        <CardForm
          scanned={scanned}
          lastFace={lastFace}
          onRescan={() => setScanned(null)}
          onSaved={(continueScan, faceValue) => {
            setSavedCount((n) => n + 1);
            setLastFace(faceValue);
            if (continueScan) setScanned(null);
            else go({ name: 'tabs', tab: 'cards' });
          }}
        />
      ) : needCode ? (
        <ManualCodeForm needCode={needCode} onCancel={() => setNeedCode(null)} onResolved={setScanned} />
      ) : (
        <Scanner onScanned={setScanned} onNeedCode={setNeedCode} />
      )}
    </div>
  );
}

// ───────── 掃描 ─────────

function Scanner({ onScanned, onNeedCode }: { onScanned: (s: Scanned) => void; onNeedCode: (n: NeedCode) => void }) {
  const { db } = useWallet();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [partial, setPartial] = useState<CardCodes>({});
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const doneRef = useRef(false);

  /** 兩條都到手後查重複；重複則提示並繼續掃描 */
  const accept = useCallback(
    async (codes: Required<CardCodes>, photo: Blob): Promise<boolean> => {
      const { byCode, byHidden } = await findByCodes(db, codes.code, codes.hiddenCode);
      if (byCode || byHidden) {
        const existing = byCode ?? byHidden!;
        const name = `${existing.nickname ? existing.nickname + ' ' : ''}末 ${last4(existing.code)}`;
        const same = byCode && byHidden && byCode.id === byHidden.id;
        setMessage(same ? `這張卡已經存過了（${name}）` : `資料可能有誤，請重掃（與 ${name} 部分相同）`);
        return false;
      }
      doneRef.current = true;
      onScanned({ ...codes, photo });
      return true;
    },
    [db, onScanned],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let lastRejected = '';
    warmUpDetector();

    async function loop() {
      const video = videoRef.current;
      while (!stopped && !doneRef.current) {
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          try {
            const codes = await detectCardCodes(video);
            setPartial(codes);
            if (scanCompleteness(codes) === 'complete' && codes.code && codes.hiddenCode) {
              const key = codes.code + codes.hiddenCode;
              if (key !== lastRejected) {
                const photo = await captureVideoFrame(video);
                const ok = await accept({ code: codes.code, hiddenCode: codes.hiddenCode }, photo);
                if (!ok) lastRejected = key;
              }
            }
          } catch {
            // 單一畫面解碼失敗不中斷
          }
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stopped) return;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        void loop();
      } catch (e) {
        setCameraError(e instanceof Error && e.name === 'NotAllowedError' ? '相機權限被拒絕' : '無法開啟相機');
      }
    })();

    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [accept]);

  /** 備援：拍照或選照片後離線解碼 */
  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const bitmap = await createImageBitmap(file);
      const codes = await detectCardCodes(bitmap);
      const photo = await compressToJpeg(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      const completeness = scanCompleteness(codes);
      if (completeness === 'complete') {
        await accept({ code: codes.code!, hiddenCode: codes.hiddenCode! }, photo);
      } else if (completeness === 'need-code') {
        // 卡號條碼破損解不出，下方條碼已讀到：帶著 hiddenCode 與照片進手動輸入卡號表單（FR-01）
        onNeedCode({ hiddenCode: codes.hiddenCode!, photo });
      } else {
        setPartial(codes);
        setMessage(hintFor(codes, true));
      }
    } catch {
      setMessage('照片讀取失敗，請重拍');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="scanner">
      {cameraError ? (
        <div className="callout">
          <b>{cameraError}</b>
          <p>
            {isIOS()
              ? '到 iPhone「設定 › Safari › 相機」允許，或改用下方「拍照解碼」。'
              : '到手機「設定 › App › Chrome › 權限 › 相機」允許，或點瀏覽器網址列的鎖頭圖示允許相機，也可改用下方「拍照解碼」。'}
          </p>
        </div>
      ) : (
        <div className="viewfinder">
          <video ref={videoRef} playsInline muted autoPlay />
          <div className="viewfinder-frame" />
        </div>
      )}

      <div className="scan-status">
        <span className={partial.code ? 'ok' : ''}>{partial.code ? '✓' : '○'} 卡號條碼</span>
        <span className={partial.hiddenCode ? 'ok' : ''}>{partial.hiddenCode ? '✓' : '○'} 下方條碼</span>
      </div>
      <p className="scan-hint">{message ?? hintFor(partial, false)}</p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button className="secondary block" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? '解碼中…' : '掃不到？改用拍照解碼'}
      </button>
    </div>
  );
}

function hintFor(codes: CardCodes, fromPhoto: boolean): string {
  if (codes.code && !codes.hiddenCode) return '還差下方條碼：讓整張卡都在框內';
  if (!codes.code && codes.hiddenCode) return '還差卡號條碼：讓整張卡都在框內';
  return fromPhoto
    ? '照片裡讀不到條碼：正對卡片、避免反光、光線充足後重拍'
    : '把卡片正面放進框內，兩條條碼都要入鏡，距離約 15–20 公分';
}

// ───────── 手動輸入卡號（FR-01 補救：卡號條碼破損，hiddenCode 已讀到）─────────

/** 只有一個欄位：卡號。hiddenCode 卡面沒印，一律不可手動輸入（§5 FR-01、§6.2） */
function ManualCodeForm({
  needCode,
  onCancel,
  onResolved,
}: {
  needCode: NeedCode;
  onCancel: () => void;
  onResolved: (s: Scanned) => void;
}) {
  const { db } = useWallet();
  const [codeText, setCodeText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit() {
    const code = codeText.trim();
    if (!isValidCode(code)) {
      setMessage('卡號需為 16 位數字，請對照卡面重新輸入');
      return;
    }
    setChecking(true);
    setMessage(null);
    try {
      const { byCode, byHidden } = await findByCodes(db, code, needCode.hiddenCode);
      if (byCode || byHidden) {
        const existing = byCode ?? byHidden!;
        const name = `${existing.nickname ? existing.nickname + ' ' : ''}末 ${last4(existing.code)}`;
        const same = byCode && byHidden && byCode.id === byHidden.id;
        setMessage(same ? `這張卡已經存過了（${name}）` : `資料可能有誤，請重新核對卡號（與 ${name} 部分相同）`);
        return;
      }
      onResolved({ code, hiddenCode: needCode.hiddenCode, photo: needCode.photo });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="form">
      <div className="scanned-card">
        <BlobImage blob={needCode.photo} alt="剛拍的卡片" className="photo-thumb" />
        <div>
          <b>下方條碼讀到了，卡號條碼讀不到</b>
          <p className="muted">請對照卡面數字輸入卡號，App 不會幫你檢查是否正確</p>
        </div>
      </div>

      <label>
        卡號（16 位數字）
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={16}
          value={codeText}
          onChange={(e) => setCodeText(e.target.value)}
        />
      </label>
      {message && <p className="scan-hint">{message}</p>}

      <button className="primary block" disabled={checking} onClick={() => void submit()}>
        {checking ? '確認中…' : '確認卡號'}
      </button>
      <button className="link block" onClick={onCancel}>
        取消，重新掃描
      </button>
    </div>
  );
}

// ───────── 表單 ─────────

function CardForm({
  scanned,
  lastFace,
  onRescan,
  onSaved,
}: {
  scanned: Scanned;
  lastFace: number | null;
  onRescan: () => void;
  onSaved: (continueScan: boolean, faceValue: number) => void;
}) {
  const { db, reload, toast } = useWallet();
  const [initial] = useState(() => initialFaceChoice(lastFace));
  const [face, setFace] = useState<number | 'other'>(initial.face);
  const [otherFace, setOtherFace] = useState(initial.otherFace);
  // 餘額預設等於面額；上一張改過的餘額不沿用
  const [balanceText, setBalanceText] = useState(String(lastFace ?? 35));
  const [balanceTouched, setBalanceTouched] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);

  const faceValue = face === 'other' ? parseIntInput(otherFace) : face;

  function pickFace(v: number | 'other') {
    setFace(v);
    if (!balanceTouched) setBalanceText(v === 'other' ? otherFace : String(v));
  }

  async function save(continueScan: boolean) {
    const balance = parseIntInput(balanceText);
    if (!faceValue || faceValue <= 0) return toast('面額請輸入正整數');
    if (balance === null) return toast('餘額請輸入 0 以上的整數');
    setSaving(true);
    try {
      const r = await addCard(db, {
        code: scanned.code,
        hiddenCode: scanned.hiddenCode,
        faceValue,
        balance,
        nickname,
        photoBlob: scanned.photo,
      });
      if (!r.ok) {
        toast(r.reason === 'DUPLICATE' ? '這張卡已經存過了' : '資料可能有誤，請重掃');
        return;
      }
      await reload();
      toast(`已存 末 ${last4(scanned.code)} · ${balance} 元`);
      onSaved(continueScan, faceValue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form">
      <div className="scanned-card">
        <BlobImage blob={scanned.photo} alt="剛拍的卡片" className="photo-thumb" />
        <div>
          <b>讀到兩條條碼</b>
          <p className="muted">卡號末 {last4(scanned.code)}（請與卡面數字核對）</p>
        </div>
      </div>

      <fieldset>
        <legend>面額{lastFace !== null && <span className="muted">（沿用上一張）</span>}</legend>
        <div className="segmented">
          {FACE_VALUES.map((v) => (
            <button key={v} className={face === v ? 'active' : ''} onClick={() => pickFace(v)}>
              {v}
            </button>
          ))}
          <button className={face === 'other' ? 'active' : ''} onClick={() => pickFace('other')}>
            其他
          </button>
        </div>
        {face === 'other' && (
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="面額"
            value={otherFace}
            onChange={(e) => {
              setOtherFace(e.target.value);
              if (!balanceTouched) setBalanceText(e.target.value);
            }}
          />
        )}
      </fieldset>

      <label>
        目前餘額（用過的卡請改成實際餘額）
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={balanceText}
          onChange={(e) => {
            setBalanceTouched(true);
            setBalanceText(e.target.value);
          }}
        />
      </label>
      <label>
        暱稱（選填）
        <input value={nickname} maxLength={20} placeholder="例如：客戶送的" onChange={(e) => setNickname(e.target.value)} />
      </label>

      <button className="primary block" disabled={saving} onClick={() => void save(true)}>
        存檔，掃下一張
      </button>
      <button className="secondary block" disabled={saving} onClick={() => void save(false)}>
        存檔並結束
      </button>
      <button className="link block" onClick={onRescan}>
        重掃
      </button>
    </div>
  );
}
