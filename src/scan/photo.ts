// 卡片照片壓縮（§3 照片規格：長邊 1600px、JPEG 0.8，以 Blob 存入 IndexedDB）

export const PHOTO_LONG_SIDE = 1600;
export const PHOTO_QUALITY = 0.8;

export function compressToJpeg(source: CanvasImageSource, srcWidth: number, srcHeight: number): Promise<Blob> {
  const scale = Math.min(1, PHOTO_LONG_SIDE / Math.max(srcWidth, srcHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(srcWidth * scale);
  canvas.height = Math.round(srcHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('無法建立畫布'));
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('照片壓縮失敗'))), 'image/jpeg', PHOTO_QUALITY),
  );
}

/** 擷取目前影片畫面作為卡片照片 */
export function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  return compressToJpeg(video, video.videoWidth, video.videoHeight);
}
