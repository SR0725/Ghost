# Start Here 訂閱問卷 — BDD 規格 v3（極簡版）

## 概述

訂閱完成時是 Ray 最能拿到誠實回答的瞬間：剛掏錢、剛被某幾段文案打到、為什麼買的答案還在腦中熱熱的。

這個功能不是專屬「謝謝頁」中斷使用者，而是 **Modal 浮在內容上**。邏輯極簡：

> **任何頁面載入時，問後端「該不該顯示？」**
> **後端三條件全過才回 unknown（→ 顯示）：**
> 1. 已登入有 session
> 2. 是付費 / 贈閱 member（status !== 'free'）
> 3. 帶有 `start-here` label

> **使用者填完送出 → 記為 answered**
> **使用者按 × / Esc / 點外面 → 記為 dismissed**
> **兩種狀態都會永久不再彈**

資料存 Ghost MySQL（`start_here_surveys` 表）。一個 member 一筆，upsert。

---

## 行為規格

### 場景 1：付費 + 有 start-here label + 未填未拒 → 看到 Modal

**Given** 一個 member 已登入，有 active 訂閱（或 comp），且被標記 `start-here` label
**And**   `start_here_surveys` 表內該 member 沒有紀錄
**When**  該 member 造訪站上任何頁面
**Then**  頁面載入後 < 1 秒，Modal 浮出

### 場景 2：已填過 → 不再看到 Modal

**Given** 該 member 之前已填過問卷
**When**  造訪任何頁面
**Then**  Modal **不**浮出（API 回 `state: 'answered'`，前端不開）

### 場景 3：已拒絕 → 不再看到 Modal

**Given** 該 member 之前按 × 關掉過 Modal
**When**  造訪任何頁面
**Then**  Modal **不**浮出（API 回 `state: 'dismissed'`，前端不開）

### 場景 4：付費但沒 `start-here` label → 不看到 Modal

**Given** member 有付費但沒 `start-here` label（例如未來從其他登陸頁買的訂閱者）
**When**  造訪任何頁面
**Then**  API 回 403，Modal 不浮出

### 場景 5：未付費（free）→ 不看到 Modal

**Given** member 是免費會員（status='free'）
**When**  造訪任何頁面
**Then**  API 回 403，Modal 不浮出

### 場景 6：未登入 → 不看到 Modal

**Given** 訪客沒有 session
**When**  造訪任何頁面
**Then**  API 回 401，Modal 不浮出

### 場景 7：填寫送出

**Given** Modal 已浮出
**And**   Q1 / Q5 各選一個、Q2 勾 1–3 個、Q3 勾恰好 3 個、Q4 / Q6 至少 5 字
**And**   勾「其他」的題目有填對應自由文字
**When**  點「送出」
**Then**  `POST /members/api/start-here-survey` 帶 payload
**And**   後端 upsert：寫入答案 + 把 `dismissed_at` 清為 null（覆蓋既有 dismiss 紀錄）
**And**   Modal 切換到「收到了」+「繼續閱讀」狀態
**When**  使用者點「繼續閱讀」
**Then**  Modal 關閉，**不**呼叫 dismiss endpoint（已 answered，不需要再標 dismiss）

### 場景 8：直接關掉不填

**Given** Modal 已浮出
**When**  使用者點 × / 按 Esc / 點 Modal 外面
**Then**  Modal 立即視覺上關閉
**And**   背景非同步呼叫 `POST /members/api/start-here-survey/dismiss`
**And**   後端 upsert：留答案欄位為 null + 設 `dismissed_at = NOW()`
**And**   即使 dismiss API 失敗（網路問題等）也不影響 UI（重新整理還會看到，可再次關閉）

### 場景 9：提交資料驗證失敗

**Given** Modal 已浮出，使用者填了部分資料
**When**  Q3 只勾了 2 個就按送出
**Then**  Q3 下方紅字「請選恰好 3 個主題」
**And**   API 不呼叫，Modal 不關

### 場景 10：Q2 / Q3 數量強制

**Given** Q2 / Q3 已勾滿 3 個
**When**  使用者勾第 4 個
**Then**  第 4 個 checkbox 立刻被自動取消
**And**   Q2 顯示「最多 3 個」/ Q3 顯示「請選恰好 3 個」

### 場景 11：「其他」選項展開自由文字

**Given** Q1 / Q2 / Q5 任一題勾「其他」
**When**  該選項被勾起
**Then**  下方出現 `<input type="text">`
**When**  該選項被取消勾選
**Then**  輸入框隱藏並清空，送出時對應 *_other 欄位為 null

### 場景 12：填過後又想改答案（罕見）

**Given** member 已填過
**When**  直接 POST /members/api/start-here-survey 帶新答案（理論上需要 Modal 開啟才會這樣做，但邏輯允許）
**Then**  upsert 覆蓋既有答案，`updated_at` 更新

---

## 題目最終文案

> Modal 標題：「謝謝你訂閱。花 2 分鐘回 6 題，幫我把選題做對。」
> Modal 副標：「這份回答會直接決定接下來三個月我寫什麼。也可以隨時關掉，之後再來。」

### Q1（單選，必填）
> 你目前的情況最接近哪個？

- A. 還在想做什麼，連方向都沒鎖
- B. 方向有了，但還沒做出第一個產品
- C. 產品上線了，但還沒收到第一塊錢
- D. 有收入但不穩（月 < 3 萬）
- E. 月入 3–10 萬，想穩定 + 系統化
- F. 月入 10 萬+，想擴張或長期玩
- G. 我有正職，想用 AI 把副業跑起來
- H. 純粹想看 Ray 這個人，不一定自己做
- I. 其他：____

### Q2（複選，最多 3 個，至少 1，必填）
> 你為什麼買這個訂閱？

- Codex / Claude Code 怎麼變成我的隱形員工
- 個人開發軟體從 0 ship 的真實流程
- 個人 IP × AI 自媒體經營
- 美國公司日記（LLC / Stripe / 海外稅）
- 跟上最新 AI 應用攻略
- AI 超級個體的生活方式 / 心法
- 想看真實 Stripe 數字 / ROAS，不要被唬爛
- 想看 Ray 這個人，內容是其次
- 想加入這個訂閱者社群
- 其他：____

### Q3（複選，恰好 3 個，必填，無「其他」）
> 下列 6 個主題，最想我先寫哪 3 個？

- **Codex 一人公司工作術** — Claude Code / Codex 變成你的隱形員工
- **個人開發軟體從 0 ship** — Indie SaaS 真實流程
- **個人 IP × AI 自媒體** — Threads / 部落格從 0 變生意
- **美國公司日記** — LLC、Stripe、海外稅務踩坑
- **最新 AI 應用攻略** — 廣告 / Landing / 工具 / workflow
- **AI 超級個體心法** — 一個人活得像一間公司、不 burnout

### Q4（開放，必填，最少 5 字）
> 你現在最大的卡點是什麼？

Placeholder：「例：『我看了 Claude Code 一堆教學但每次都從零開始，串不成每天的 workflow』」

### Q5（單選，必填）
> 你是怎麼認識我的？

- iOS App 開發課程學員
- Threads @ray.realms
- LINE 社群
- 朋友 / 同事推薦
- Google 搜尋 / 我的部落格
- 廣告（Meta / Google）
- 其他：____

### Q6（開放，必填，最少 5 字）
> 如果三個月內我只能交付一件事，讓你覺得「這 NT$300/月超值」，那一件事是什麼？

Placeholder：「例：『教我把 Codex 串到 Stripe 自動寄發票』」

---

## Acceptance Criteria

### 後端：資料與 API

- [ ] **AC-01** Migration 建 `start_here_surveys` 表：
  - `id` CHAR(24) PRIMARY KEY
  - `member_id` CHAR(24) UNIQUE NOT NULL，FK to members.id ON DELETE CASCADE
  - `q1_situation` VARCHAR(50) **NULLABLE**（dismiss 行 q* 全 null）
  - `q2_reasons`, `q3_top_topics`, `q4_blocker`, `q6_kpi` TEXT NULLABLE
  - `q5_source` VARCHAR(50) NULLABLE
  - `q1/2/3/5_other` VARCHAR(191) NULLABLE
  - **`dismissed_at` DATETIME NULLABLE**
  - `created_at`, `updated_at` DATETIME NOT NULL
- [ ] **AC-02** `schema.js` 對應結構，含 `dismissed_at` 與 q* nullable
- [ ] **AC-03** Service `services/start-here-survey/index.js` 公開：`isEligibleMember`, `submitSurvey`, `markDismissed`, `getSurveyForMember`
- [ ] **AC-04** `isEligibleMember(member)` = `isPaidMember(member) && hasStartHereLabel(member)`，async
- [ ] **AC-05** `hasStartHereLabel` 查 `members_labels` join `labels` where `labels.slug = 'start-here'`
- [ ] **AC-06** `submitSurvey` 驗證 payload（Q1/Q5 已知選項、Q2 1–3、Q3 恰好 3、Q4/Q6 至少 5 字、勾「其他」必附文字）、upsert、寫入答案 + `dismissed_at = null`
- [ ] **AC-07** `markDismissed` upsert：若已 answered → no-op；否則寫入 q* = null + `dismissed_at = NOW()`
- [ ] **AC-08** `getSurveyForMember` 回 `{ state, answered, dismissed, ...fields }`，state 為 `'answered' | 'dismissed' | 'unknown'`
- [ ] **AC-09** 三支 Members API endpoint：
  - `GET /api/start-here-survey` 回 survey 或 null
  - `POST /api/start-here-survey` 提交答案
  - `POST /api/start-here-survey/dismiss` 標記拒絕
- [ ] **AC-10** 三支 endpoint 都走 `requireEligibleMember` 統一 gate：401 未登入 / 403 不符合條件（未付費或無 label）

### 前端：Modal

- [ ] **AC-11** `partials/start-here-survey.hbs` 提供 Modal markup + style + JS；`default.hbs` 在 `{{ghost_foot}}` 前引入
- [ ] **AC-12** 觸發邏輯：頁面載入 → `fetch GET API` → 若回 `state: 'unknown'` 或 `survey: null` → `openModal()`。任何其他結果（401 / 403 / answered / dismissed / 網路錯誤）都靜默不開
- [ ] **AC-13** Modal 開啟：背景遮罩 + 居中卡片 + `body.shs-no-scroll` 防滾、`role="dialog" aria-modal="true"`
- [ ] **AC-14** 關閉方式（任一）：× / 點背景遮罩 / Esc / 提交成功後「繼續閱讀」
- [ ] **AC-15** 非提交途徑的關閉（× / 背景 / Esc）會背景呼叫 `POST /dismiss`（fire-and-forget，失敗不影響 UI）；用 `dismissSent` flag 防止重複呼叫
- [ ] **AC-16** 提交成功後「繼續閱讀」按 `{skipDismiss: true}` 關閉 → 不呼叫 dismiss
- [ ] **AC-17** 6 題文字與「題目最終文案」章節一致
- [ ] **AC-18** Q2 已勾 3 個時勾第 4 個 → 自動取消 + 顯示「最多 3 個」
- [ ] **AC-19** Q3 已勾 3 個時勾第 4 個 → 自動取消 + 顯示「請選恰好 3 個」
- [ ] **AC-20** Q1 / Q2 / Q5 的「其他」勾起時下方出現 input，取消時隱藏並清空
- [ ] **AC-21** 提交前前端驗證；失敗顯示對應紅字、不送 API、不關 Modal
- [ ] **AC-22** 提交成功 → Modal 切到「收到了」+「繼續閱讀」

### 範圍外（明確不做）

- ❌ Admin UI 查看問卷答案的儀表板（你選了直接 MySQL 查；之後可加）
- ❌ Email 通知
- ❌ 匿名提交
- ❌ A/B test 不同題目
- ❌ i18n
- ❌ PostHog
- ❌ 任何 localStorage 持久化（DB 即源頭）
- ❌ URL 參數依賴（移除 `?action=signup&success=true` gate）
- ❌ Race condition retry（webhook 已完成時自然會看到；沒完成時下次頁面載入會看到）
