# Resend 廣發系統交接文件

## 1. 文件目的
本文件提供 Ghost 專案內「Resend 獨立廣發電子郵件系統」的完整交接資訊，供後續工程師維運、除錯、擴充。

適用版本：本文件對應目前工作分支上已實作的程式碼。

## 2. 系統定位
此系統是獨立於既有 Mailgun Newsletter 發送流程之外的新流程，核心需求如下：

- 文章編輯頁（Post settings）可建立 Resend campaign。
- 只能針對已發布文章送出。
- 發送前可先估算受眾人數。
- 使用者需二次確認後才正式送出。
- 支援排程（以台灣時間為單位）。
- 後端批次送信：每批 100 人、批次間隔 1.1 秒。
- 可查看進度、同步狀態、查看收件人明細、匯出 CSV。

## 3. 實作範圍總覽
### 3.1 後端
新增 Resend Campaign 服務與 API：

- `ghost/core/core/server/services/resend-campaigns/resend-campaigns-service.js`
- `ghost/core/core/server/services/resend-campaigns/resend-campaigns-service-wrapper.js`
- `ghost/core/core/server/services/resend-campaigns/resend-client.js`
- `ghost/core/core/server/services/resend-campaigns/jobs/process-scheduled.js`
- `ghost/core/core/server/services/resend-campaigns/index.js`
- `ghost/core/core/server/api/endpoints/resend-campaigns.js`

註冊與啟動點：

- `ghost/core/core/server/api/endpoints/index.js`
- `ghost/core/core/server/web/api/endpoints/admin/routes.js`
- `ghost/core/core/boot.js`

### 3.2 前端（Admin / Ember）
Post settings 新增 Resend 區塊：

- `ghost/admin/app/components/gh-post-settings-menu.js`
- `ghost/admin/app/components/gh-post-settings-menu.hbs`

### 3.3 資料庫
新增資料表（migration + schema）：

- `ghost/core/core/server/data/migrations/versions/6.16/2026-02-08-09-00-00-add-resend-campaign-tables.js`
- `ghost/core/core/server/data/schema/schema.js`

資料表：

- `resend_campaigns`
- `resend_campaign_batches`
- `resend_campaign_recipients`
- `resend_campaign_events`

## 4. 功能流程
### 4.1 建立與送出流程
1. 使用者在 Post settings 選受眾與（可選）排程時間。
2. 點擊「Estimate recipients」呼叫 estimate API。
3. 顯示影響人數。
4. 點擊「Send with confirmation」第一次只會進入 armed 狀態（前端提示二次確認）。
5. 第二次點擊才會：
- 建立 campaign（`awaiting_confirmation`）
- 帶 token 立即呼叫 confirm API
- 若未來時間排程：狀態轉 `scheduled`
- 若立即送：狀態轉 `running`，排入 job
6. job 執行批次送信，更新 campaign/batch/recipient 狀態。
7. 發送完成後 campaign 狀態為 `completed`。

### 4.2 排程流程
1. 建立 campaign 時帶 `scheduled_at_taipei`。
2. 後端使用 `Asia/Taipei` 解析，轉 UTC 存 `scheduled_for`。
3. 系統每秒巡檢排程 job（`resend-campaigns-scheduler`）。
4. 到時後把 `scheduled` campaign 改為 `running` 並 enqueue 發送 job。

### 4.3 進度/追蹤流程
1. 前端定期輪詢 campaign 清單（running/scheduled 時每 3 秒）。
2. 使用者可點 `Sync metrics` 手動同步。
3. 同步邏輯會從 Resend list emails 拉狀態，映射到 recipient status，再重算 campaign aggregate。
4. 使用者可查看收件者（目前載入前 100 筆）並匯出 CSV。

## 5. 受眾定義
受眾欄位 `audience`：

- `staff_members`：`users.status = active` 且有 email
- `newsletter_members`：在 `members_newsletters` 有訂閱、`members.email_disabled = 0`、`members.status in (free, paid, comped)`
- `paid_members`：`members.email_disabled = 0`、`members.status in (paid, comped)`

去重：依 email 小寫去重。

## 6. 狀態機
### 6.1 campaign 狀態
- `awaiting_confirmation`
- `scheduled`
- `running`
- `completed`
- `failed`
- `canceled`（目前預留，尚無取消 API）

### 6.2 batch 狀態
- `pending`
- `submitting`
- `submitted`
- `failed`

### 6.3 recipient 狀態
- `pending`
- `sent`
- `delivered`
- `opened`
- `clicked`
- `failed`

## 7. API 一覽（Admin API）
Base 路徑：`/ghost/api/admin`

- `GET /posts/:id/resend-campaigns`
- `POST /posts/:id/resend-campaigns/estimate`
- `POST /posts/:id/resend-campaigns`
- `POST /posts/:id/resend-campaigns/:campaign_id/confirm`
- `GET /posts/:id/resend-campaigns/:campaign_id`
- `POST /posts/:id/resend-campaigns/:campaign_id/sync`
- `GET /posts/:id/resend-campaigns/:campaign_id/recipients`
- `GET /posts/:id/resend-campaigns/:campaign_id/recipients/export`

### 7.1 estimate 範例
Request:

```json
{
  "resend_campaigns": [
    {
      "audience": "newsletter_members"
    }
  ]
}
```

Response:

```json
{
  "resend_campaigns": [
    {
      "audience": "newsletter_members",
      "recipient_count": 1234
    }
  ]
}
```

### 7.2 create 範例
Request:

```json
{
  "resend_campaigns": [
    {
      "audience": "paid_members",
      "scheduled_at_taipei": "2026-02-10T10:30"
    }
  ]
}
```

Response（節錄）：

```json
{
  "resend_campaigns": [
    {
      "id": "...",
      "status": "awaiting_confirmation",
      "confirmation_token": "...",
      "estimated_recipient_count": 321
    }
  ]
}
```

### 7.3 confirm 範例
Request:

```json
{
  "resend_campaigns": [
    {
      "confirmation_token": "..."
    }
  ]
}
```

## 8. 環境變數與設定
本系統讀取 `bulkEmail.resend`：

必要：

- `bulkEmail__resend__apiKey`
- `bulkEmail__resend__from`

選填：

- `bulkEmail__resend__baseUrl`（預設 `https://api.resend.com`）
- `bulkEmail__resend__replyTo`

`docker-compose` 範例：

```yaml
environment:
  bulkEmail__resend__apiKey: re_xxxxxxxxx
  bulkEmail__resend__from: "My Site <newsletter@yourdomain.com>"
  bulkEmail__resend__baseUrl: "https://api.resend.com"
  bulkEmail__resend__replyTo: "support@yourdomain.com"
```

注意：Ghost config loader 以 `__` 作為巢狀分隔符。

## 9. 部署步驟
1. 佈署程式碼。
2. 設定 Resend 環境變數。
3. 執行 migration。
4. 重啟 Ghost。
5. 用已發布文章做 smoke test：estimate -> create -> confirm -> check progress。

## 10. 維運操作手冊
### 10.1 常用操作
- 看 campaign 列表：Post settings 內建 `Refresh`。
- 同步狀態：`Sync metrics`。
- 明細匯出：`Export CSV`。

### 10.2 建議監控
- 監控 `resend_campaigns.status = failed`。
- 監控 `resend_campaign_batches.failed_count`。
- 監控 `resend_campaigns.progress_pct` 長時間停滯。

## 11. 已知限制
1. `read_duration_ms` 目前為預留欄位，尚未有完整資料來源寫入。
2. `resend_campaign_events` 已建表但尚未接 webhook ingestion。
3. `canceled` 狀態已預留，尚無 cancel API。
4. 目前 sync 依賴 `list emails` 做狀態比對，非 webhook 即時推送。
5. 發送內容目前採文章 `html/plaintext` 直接組裝，未做模板化版本管理。

## 12. 建議下一步（Roadmap）
1. 新增 Resend webhook endpoint，落地 event ingestion。
2. 用 webhook 驅動 `opened/clicked/read_duration` 即時更新。
3. 新增 cancel/retry API。
4. 增加 campaign 級別權限與審計紀錄。
5. 將收件人列表改為 server-side 分頁 + filter。
6. 擴充 dashboard 指標（開信率、點擊率、失敗原因分佈）。

## 13. 驗證與測試記錄
本次已透過 Docker 進行 lint 檢查：

- Core 端新增/修改檔案 lint 通過（0 errors）
- Admin 端 `gh-post-settings-menu.js/.hbs` lint 通過（0 errors）

## 14. 故障排查
### 14.1 顯示「Resend is not configured」
檢查：

- `bulkEmail__resend__apiKey`
- `bulkEmail__resend__from`

### 14.2 campaign 一直 `scheduled`
檢查：

- `scheduled_for` 是否為未來 UTC
- 服務是否正常啟動（`boot.js` 會 `resendCampaigns.init()`）
- job manager 是否運作

### 14.3 campaign `failed`
檢查：

- `resend_campaigns.error`
- 對應 `resend_campaign_batches.error`
- Resend API key/domain sender 是否有效

### 14.4 sync 沒有更新
檢查：

- recipient 是否已有 `resend_email_id`
- Resend API 權限
- list emails 是否能查到對應資料

## 15. 交接清單
1. 確認環境變數已配置。
2. 確認 migration 已在目標環境執行。
3. 確認有至少一篇已發布文章可測試。
4. 完成一次完整流程測試。
5. 建立監控與告警。
6. 排定 webhook ingestion 的後續開發。

