// §6.3：canUseWallet() 為 false 時唯一顯示的畫面
// 會看到這頁的情況：iOS 非 standalone、Android 內建瀏覽器（WebView）、或其他桌機瀏覽器

import { isAndroid, isInAppBrowser, isIOS } from '../platform';

/**
 * 安裝前就要讓人知道的兩件事。
 *
 * 放在這裡而不是只放新手引導：這頁是很多人第一個看到的畫面，而且「資料會不見」
 * 這件事應該在他把卡存進去之前就知道，不是存完才補說明。
 * 新手引導有同樣一步，兩邊都留——沒安裝的人看不到引導，略過引導的人看過這頁。
 */
function RiskNotice() {
  return (
    <div className="callout warn">
      <b>先知道這兩件事</b>
      <p>
        <b>卡片只存在你自己的手機裡</b>，不會上傳到任何地方，別人也看不到。
        代價是手機掉了、清除瀏覽器資料、刪掉主畫面圖示，卡片紀錄就沒了。存好卡之後請到「設定 → 備份」匯出備份檔。
      </p>
      <p>
        <b>出示條碼的畫面等同現金。</b>不要截圖傳給別人，手機也不要隨便借人。
      </p>
    </div>
  );
}

export function InstallGuide() {
  const ios = isIOS();
  const androidWebView = isAndroid() && isInAppBrowser();

  return (
    <div className="install">
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={96} height={96} />
      {androidWebView ? (
        <>
          <h1>請改用 Chrome 開啟</h1>
          <p>
            LINE、Facebook 這類 App 內建的瀏覽器彼此儲存空間互相隔離，而且無法加入主畫面，
            <br />
            在這裡存的卡片下次可能找不到。請改用 Chrome 開啟本頁。
          </p>
          <ol>
            <li>
              點右上角的 <b>⋮</b> 選單（或「⋯」）
            </li>
            <li>
              選 <b>用瀏覽器開啟</b>（或「用 Chrome 開啟」）
            </li>
          </ol>
        </>
      ) : ios ? (
        <>
          <h1>先加入主畫面再使用</h1>
          <p>
            在瀏覽器分頁裡存的卡片，主畫面 App 看不到，而且可能被 Safari 自動清除。
            <br />
            為了避免卡片資料遺失，這裡不提供新增功能。
          </p>
          <ol>
            <li>
              確認是用 <b>Safari</b> 開啟（LINE、Facebook 內建瀏覽器不行，請點右上角改用 Safari 開啟）
            </li>
            <li>
              點下方工具列的 <b>分享</b> 按鈕（方框加向上箭頭）
            </li>
            <li>
              往下滑，點 <b>加入主畫面</b>，再點 <b>加入</b>
            </li>
            <li>回到主畫面，點「商品卡」圖示開啟</li>
          </ol>
        </>
      ) : (
        <>
          {/* 桌機等非 iOS／非 Android 的環境。會走到這裡就是已經被 canUseWallet() 擋下，
              所以文案不能說「用分頁也能用」——那與眼前的畫面自相矛盾。 */}
          <h1>請用手機開啟</h1>
          <p>
            這個錢包是設計給結帳時拿出手機出示條碼用的，卡片資料只存在開啟它的那台裝置上。
            <br />
            請用手機的 Chrome（Android）或 Safari（iPhone）開啟本頁。
          </p>
          <ol>
            <li>用手機瀏覽器開啟這個網址</li>
            <li>
              iPhone：點 <b>分享</b> → <b>加入主畫面</b>
            </li>
            <li>
              Android：可直接使用，或點 <b>⋮</b> → <b>安裝應用程式</b> 更好用
            </li>
          </ol>
        </>
      )}

      <RiskNotice />
    </div>
  );
}
