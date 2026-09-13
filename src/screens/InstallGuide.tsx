// §6.3：非 standalone 模式時唯一顯示的畫面

import { isIOS } from '../platform';

export function InstallGuide() {
  const ios = isIOS();
  return (
    <div className="install">
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={96} height={96} />
      <h1>先加入主畫面再使用</h1>
      <p>
        在瀏覽器分頁裡存的卡片，主畫面 App 看不到，而且可能被 Safari 自動清除。
        <br />
        為了避免卡片資料遺失，這裡不提供新增功能。
      </p>
      {ios ? (
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
      ) : (
        <ol>
          <li>
            用 <b>Chrome</b> 開啟本頁
          </li>
          <li>
            點右上角 <b>⋮</b> 選單 → <b>安裝應用程式</b>（或「加到主畫面」）
          </li>
          <li>從主畫面的「商品卡」圖示開啟</li>
        </ol>
      )}
    </div>
  );
}
