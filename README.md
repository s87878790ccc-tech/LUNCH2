# LUNCH2 — 班級午餐系統

前端：[班級午餐訂單系統](https://s87878790ccc-tech.github.io/LUNCH2/)

原生 HTML / CSS / JavaScript 前端放在 `docs/`，Express API 放在 `server/`；沿用 GitHub Pages、Render 及 Supabase PostgreSQL。

## 2026-10-19 優化內容

- 統一預訂頁與欄位 ID，修正按鈕綁到隱藏頁面、預訂未付款 API 及批次刪除路由被遮蔽的問題。
- 手機使用可捲動導覽與訂單卡片；電腦使用雙欄與表格。加入 44px 觸控目標、表格獨立捲動、鍵盤焦點及登入表單自動填寫。
- 管理員全座號一覽改用單次 `/api/orders` 查詢；原本的 36 次逐座查詢改為兩次批次資料庫讀取。
- 分開「正在編輯」與「已啟用」的菜單，避免管理員選擇編輯另一份菜單時，影響目前點餐顯示。
- 序列化同座號的前端寫入、防止連點、避免快速切換座號／日期與舊請求覆蓋新畫面；失敗後重新載入，重試不沿用已被修改的快取。
- 數量在輸入完成後才儲存；金額、數量、座號、ID、日期與設定均有後端驗證，無效項目會整筆拒絕，不會默默刪除既有餐點。
- 所有非同步 API 交由統一錯誤處理；CORS、JSON 格式錯誤、請求限制與資料庫失敗會回傳 JSON。
- 每次驗證目前帳號狀態與角色，停用／刪除／降權立即生效；登出會清除帳號快取及畫面資料。
- 共用網路的成功登入不會耗盡其他同學的登入額度；支援跨午夜的點餐時段。
- 加入 API 逾時、可讀錯誤訊息、頁面重新顯示與每分鐘狀態更新；編輯菜單／後台時暫停背景更新，保留未儲存的輸入。
- 更新 Express、bcrypt、Multer，納入 `package-lock.json`，方便重現安裝。

## 安全防護

安全邊界、測試方式、手動餐點管理員鎖定、機密保存與部署注意事項請見 [SECURITY.md](SECURITY.md)。手動餐點預設開放；管理員可在後台鎖定，鎖定後保留同學一般菜單點餐功能。

2026-10-20 安全修補：帳號改用個別隨機臨時憑證與首次改密碼、正常啟動不再建立帳號、管理員升權需重新驗證並換密碼，訂單／預訂寫入必填版本。一般使用者自訂密碼仍至少6字元。既有帳號不自動重設；存量共用憑證須經本人核實後個別輪替。正式導入及安全回復見 [SECURITY_REMEDIATION.md](SECURITY_REMEDIATION.md)，此分支不授權自動合併或部署。

## 安裝與驗證

使用 Node.js 24.15 以上的 24.x 版本（也支援 22.22.2 以上的 22.x）。

```sh
cd server
npm ci
npm run check
npm test
npm audit --omit=dev
```

測試使用隔離的記憶體資料庫及 JSDOM，不需要正式資料庫帳密，也不會連線到正式訂單。範圍涵蓋權限、路由、資料驗證、登入／登出、訂餐／預訂、付款、連點、失敗重試及非同步競爭。

JSDOM 不會實際繪製畫面；本次驗證不包含實機 Safari／Chrome 的像素布局、Supabase 真實併發鎖定或 Render 正式部署。上述項目仍須在部署環境驗收。

## Render 設定與部署

Root Directory 為 `server`，Build Command 建議使用 `npm ci --omit=dev`，Start Command 為 `npm start`。

沿用既有環境變數：

| 變數 | 用途 |
| --- | --- |
| `DATABASE_URL` | 既有 PostgreSQL／Supabase Pooler 連線字串 |
| `DATABASE_CA_CERT` | 選填：Supabase SSL 公開 CA 憑證；系統信任鏈不足時必填，不可關閉憑證驗證 |
| `JWT_SECRET` | 固定的登入簽章密鑰 |
| `ADMIN_DEFAULT_USER` / `ADMIN_DEFAULT_PASS` | 僅明確的空安裝CLI使用，正常啟動不建立帳號、不覆寫既有帳號 |
| `SEAT_DEFAULT_PASS` | 已停用；不再建立共用密碼座號 |
| `BUSINESS_TZ` | 預設 `Asia/Taipei` |
| `CORS_ORIGINS` | 額外允許的前端 origin，以逗號分隔；既有 GitHub Pages origin 已內建 |
| `MAX_UPLOAD_BYTES` | 上傳大小限制，預設 2 MiB；前端也限制 2 MiB |

後端沿用原有資料表；本次發布前需另經擁有者授權，先手動套用新增 must_change_password（既有帳號預設false）的增量遷移。程式不自動套用此遷移或改密碼。新系統空安裝另執行明確初始化CLI，不能串入正常啟動。訂單建立使用 PostgreSQL transaction advisory lock；預訂使用原有 `(d, seat)` 唯一索引。

先部署 Render 後端，再更新 GitHub Pages 的 `docs/`，讓前端的新批次 API 可立即使用。圖片仍使用現有 `uploads/` 位置；需要跨重新部署保留圖片時，Render 必須配置持久磁碟或另行接入持久儲存。

審計紀錄寫入失敗時會記錄伺服器錯誤，但不會將已提交的訂單回報為儲存失敗；避免因重試重複新增餐點。請以伺服器紀錄確認這類故障。

Original project: coding by OpenAI 5 + Codex, created by Alex.
