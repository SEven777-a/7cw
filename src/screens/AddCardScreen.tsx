// FR-01 新增卡片：同一畫面同時讀到兩條條碼才算成功，並保存該畫面為卡片照片

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '../app/wallet';
import { addCard, findByCodes } from '../db/db';
import { last4 } from '../domain/validate';
import { captureVideoFrame, compressToJpeg } from '../scan/photo';
import { detectCardCodes, warmUpDetector, type CardCodes } from '../scan/scanner';
import { BlobImage, Header, parseIntInput } from '../ui/common';

interface Scanned {
  code: string;
  hiddenCode: string;
  photo: Blob;
}

const FACE_VALUES = [35, 50, 100];

export function AddCardScreen() {
  const { go } = useWallet();
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [savedCount, setSavedCount] = useState(0);

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
          onRescan={() => setScanned(null)}
          onSaved={(continueScan) => {
            setSavedCount((n) => n + 1);
            if (continueScan) setScanned(null);
            else go({ name: 'tabs', tab: 'cards' });
          }}
        />
      ) : (
        <Scanner onScanned={setScanned} />
      )}
    </div>
  );
}

// ───────── 掃描 ─────────

function Scanner({ onScanned }: { onScanned: (s: Scanned) => void }) {
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
            if (codes.code && codes.hiddenCode) {
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
      if (codes.code && codes.hiddenCode) {
        await accept({ code: codes.code, hiddenCode: codes.hiddenCode }, photo);
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
          <p>到 iPhone「設定 › Safari › 相機」允許，或改用下方「拍照解碼」。</p>
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

// ───────── 表單 ─────────

function CardForm({ scanned, onRescan, onSaved }: { scanned: Scanned; onRescan: () => void; onSaved: (continueScan: boolean) => void }) {
  const { db, reload, toast } = useWallet();
  const [face, setFace] = useState<number | 'other'>(35);
  const [otherFace, setOtherFace] = useState('');
  const [balanceText, setBalanceText] = useState('35');
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
      onSaved(continueScan);
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
        <legend>面額</legend>
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
