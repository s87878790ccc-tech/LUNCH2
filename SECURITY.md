# 安全邊界與維護

本專案的 GitHub 原始碼與瀏覽器收到的 HTML、CSS、JavaScript 都是公開內容。API 網址、座號數量、路由及權限判斷方式不是機密。保護依靠伺服器驗證與資料庫權限；壓縮、混淆、停用右鍵或隱藏按鈕不能代替這些控制。

## 不得提交的內容

- 真實密碼、JWT 簽章密鑰、Supabase secret／service-role key、含密碼的資料庫網址。
- `.env`、私鑰、資料庫備份、學生資料匯出、付款紀錄、正式日誌及上傳圖片。
- 測試檔中的密碼及本機連線字串僅供隔離測試，不能用於正式環境。

根目錄 `.gitignore` 防止常見誤提交，`npm run check` 也會拒絕已追蹤的敏感檔案類型。GitHub Actions 會執行程式檢查、回歸測試、依賴稽核及 Gitleaks 歷史／目前版本掃描；報告會遮蔽機密內容。任何掃描都可能漏判。發現真實機密曾提交時，先撤銷或輪替該機密，再評估清理 Git 歷史、分支、快取及已下載副本；刪除最新檔案不足以撤銷已外洩的權限。

## 應用程式控制

- JWT 僅含使用者 ID、不可逆的登入版本標記及必要的期限／用途欄位。有效期限為 8 小時，檢查固定簽章演算法、發行者、接收對象與帳號目前狀態。
- 改密碼（包含直接在資料庫執行的帳號救援）會使舊憑證失效。停用、重新啟用及變更角色也會撤銷舊登入。登出會結束該帳號所有裝置的登入；網路中斷時仍會清除本機登入資料，但不能保證伺服器已收到撤銷請求。
- 帳號安全異動在同一交易鎖內重新驗證呼叫者，防止在途請求沿用已撤銷的管理員權限。密碼變更也比對目標帳號原版本，不能覆蓋後來完成的重設。訂單、付款、菜單、設定及圖片寫入同樣在交易內重新驗證，持有呼叫者的共享列鎖直到提交；撤權先提交時舊請求被拒，寫入先取得鎖時撤權會等待該筆合法操作完成。
- 瀏覽器僅在 `sessionStorage` 保存憑證，不沿用舊 `localStorage` 登入。這不是 HttpOnly cookie；同源惡意 JavaScript 仍可能讀取分頁憑證，因此另外限制腳本與連線來源、跳脫使用者資料，並避免第三方腳本。
- 菜單、訂單、使用者與審計資料需要登入。管理操作在後端驗證角色，座號訂單驗證所屬帳號，不能只靠前端隱藏按鈕。
- 手動餐點預設開放，保留原本用途。管理員可在後台鎖定；鎖定後一般使用者仍可操作菜單餐點，既有手動品項必須保留，由管理員新增、修改或刪除。這是後端交易內強制的規則，訂單與預訂均適用。未鎖定時的自訂品名與單價是刻意允許的行為。
- 一般帳號的新建、變更及重設密碼至少 6 個 Unicode 字元；管理員至少 12 個 Unicode 字元。兩者最多 72 個 UTF-8 位元組；不強制重設既有使用者密碼。
- 登入採每分鐘「來源 IP＋帳號」5 次、帳號合計 10 次、來源 IP 合計 60 次失敗限制，成功登入不占用失敗配額；一般 API 每分鐘每來源 600 次，保留教室共用 IP 的使用空間。密碼修改另依已驗證帳號限流，一般帳號每分鐘 5 次、管理員 60 次，變更 IP 或目標 ID 不會重置配額。計數器仍在記憶體中，重啟會重置，擴充多個執行個體前需改為共享儲存。
- 一般使用者的訂餐時段與預訂日期／開放狀態在寫入交易內檢查並鎖定設定列，不能沿用關閉前的檢查結果送出。時間規則的判斷點為交易內驗證時刻。
- 圖片僅管理員可上傳，限制數量、大小與解碼像素，實際解碼並重編碼為 WebP、移除 EXIF／ICC 等中繼資料。檔名由伺服器產生，只提供允許的圖片副檔名。這不是防毒掃描。
- 圖片 URL 仍為公開可存取的菜單圖片，不得上傳學生個資、付款憑證或其他私人文件。
- API 不記錄查詢字串、Authorization 或密碼，也不把資料庫錯誤細節回傳到客戶端。

## Supabase 與 Render

前端只呼叫 Render API，不持有資料庫憑證或 Supabase 特權 key。現有 11 張應用表啟用 RLS，並撤銷 `anon`／`authenticated` 的直接表格權限。沒有用戶端 RLS policy 是刻意的拒絕存取模式；Express 目前以既有伺服器資料庫角色連線、執行應用程式授權。

`DATABASE_URL`、`JWT_SECRET` 與初始帳號設定只在 Render 環境設定中保存。建議 JWT 密鑰使用至少 32 位元組的安全隨機值。不要將這些值放入 README、前端、截圖、issue 或 PR。

資料庫 TLS 驗證憑證與主機名稱。若供應商憑證不是系統 CA 簽發，需將 Supabase Dashboard「Database Settings → SSL Configuration」下載的公開 CA 憑證放入 Render 的 `DATABASE_CA_CERT`（支援真正換行或 `\n`）。不可藉由停用憑證驗證來繞過連線問題。URL 中的弱化 SSL 參數不會覆寫程式設定。

啟動時只會新增 `users.auth_version` 與 `settings.manual_locked` 欄位，不刪除既有資料；手動餐點鎖定的初始值是 `false`。首次發布此安全更新後，舊版登入憑證需重新登入。

GitHub Pages 無法由本專案設定完整的 HTTP 回應標頭，因此前端 CSP 使用 HTML meta；`frame-ancestors` 不能透過 meta 生效。前端另在初始化前阻擋嵌入情境的互動介面。API 的 HTTP CSP／禁止嵌入標頭已設定。若要完整的前端防嵌入標頭及同源 HttpOnly cookie，後續需調整前端託管方式。

## 驗證

```sh
cd server
npm ci
npm run check
npm test
npm audit --audit-level=low
python3 scripts/scan-secrets.py
```

自動化使用隔離記憶體資料庫、JSDOM、CI 本機 PostgreSQL 及攔截外部 API 的 Chromium，不更改正式訂單或帳號。正式環境檢查限於已授權的低量讀取、未登入拒絕存取、CORS／標頭與資料庫權限盤點，不執行密碼猜測、負載攻擊、刪除或真實付款操作。實體裝置及供應商帳號的 MFA／復原機制不在這組自動測試範圍內。本輪重現、修補及限制見 `SECURITY_TESTING.md`。

### Persistent authentication limits and protected UI entry

Normal `node server.js` startup uses PostgreSQL-backed login, password-change and upload counters. Apply the additive `persistent_security_limits` migration before deployment. HMAC keys contain no raw account/IP; namespaces and minute windows are independent. PostgreSQL atomic increments are shared across processes/restarts; store failure rejects the operation (503). General API admission remains an in-memory, per-process limiter. Expired security counters are pruned in bounded batches; no business records are pruned. Limit thresholds are unchanged. Repeated denials produce bounded structured security log events; external alert delivery and account MFA require separate configuration.

The existing UI is also served at <https://lunch2.onrender.com/> from the generated `server/public` package (verified byte-for-byte against `docs` in CI; update with `npm run assets`) with HTTP CSP (`frame-ancestors 'none'`), X-Frame-Options DENY and an explicit three-file allowlist. The original GitHub Pages URL remains compatible with its application frame guard; use the Render entry for HTTP-level framing protection. API CSP remains distinct. Changing origin requires signing in again because tokens are tab/origin scoped.
