# Step 7E Browser Smoke Closeout

## 1. 任務背景

Step 7E Seller Agent Settings UI 已部署在主 workspace active preview branch：

```
qa/step7e-seller-agent-settings-active-preview
```

Preview port：
- shop-app：`22696` (→ Replit external port 3000)
- API server：`19080`

本輪記錄使用者在 Replit Preview 完成的人工 browser smoke test，並清理 smoke test 期間建立的測試資料。

## 2. Active Preview Branch

```
branch: qa/step7e-seller-agent-settings-active-preview
HEAD:   8790e75 docs-step7e-active-preview-switch
起點:   qa/step7e-seller-agent-settings-ui
```

包含的必要 commits：
- `6a8153a` feat-ui-step7e-seller-agent-settings
- `b17403b` docs-step7e-seller-agent-settings-ui-review
- `3e82926` docs-step7e-seller-agent-settings-ui-preview-port-fix
- `8790e75` docs-step7e-active-preview-switch

## 3. 使用者人工測試結果

**結論：Browser smoke test PASS**

測試日期：2026-06-09

| 測試項目 | 結果 | 說明 |
|---------|------|------|
| `/settings/agent` 可進入 | ✅ PASS | 畫面正常顯示「AI 代查設定」 |
| 啟用 AI 代查 | ✅ PASS | 可切換啟用狀態 |
| Agent 模式改成外部 Agent | ✅ PASS | 可選取 external_agent |
| 查詢頻率改成每日 | ✅ PASS | 可設定 daily |
| 物流來源勾選 7-11 | ✅ PASS | enabled_logistics = ["seven_eleven"] |
| Webhook 開啟 | ✅ PASS | webhook_enabled = true |
| Webhook URL 填入 https://example.com/webhook | ✅ PASS | URL 保留 |
| 按「儲存設定」資料保留 | ✅ PASS | POST/PATCH 成功 |
| 重新整理後設定仍保留 | ✅ PASS | GET 正確回傳儲存值 |
| Webhook Secret 可更換 | ✅ PASS | 狀態顯示「已設定」 |
| Webhook Secret 可清除 | ✅ PASS | 狀態回到「未設定」 |
| 畫面未顯示 secret 明文 | ✅ PASS | 僅顯示狀態 |
| 畫面未顯示 webhookSecretHash | ✅ PASS | hash 未外洩 |

## 4. DB 測試資料狀態（清理前）

清理前 `seller_agent_settings WHERE store_id = 1`：

| 欄位 | 值 |
|------|-----|
| id | 9 |
| store_id | 1 |
| agent_status | enabled |
| agent_mode | external_agent |
| enabled_logistics | ["seven_eleven"] |
| query_methods | ["manual"] |
| query_frequency | daily |
| notify_on_unknown | true |
| webhook_enabled | true |
| webhook_url | https://example.com/webhook |
| has_webhook_secret | false（使用者已清除） |
| created_at | 2026-06-09 14:18:41 UTC |
| updated_at | 2026-06-09 14:20:40 UTC |

## 5. DB Cleanup 結果

```sql
DELETE FROM public.seller_agent_settings WHERE store_id = 1;
```

結果：

| 項目 | 值 |
|------|-----|
| 刪除 rows | 1 |
| cleanup 後 remaining_rows | 0 |
| 驗收 | ✅ PASS |

## 6. 結論

**Browser smoke test：PASS**

所有手動測試項目通過，smoke test 資料已清理。

Step 7E Seller Agent Settings UI 功能驗收完成：

- 設定頁面可正常存取
- 所有設定欄位可修改並儲存
- 資料持久化（重整後保留）
- Webhook 功能（URL 保存、Secret 管理）正常
- 安全性：secret 未外洩，hash 未顯示

## 7. 未執行項目

| 項目 | 原因 |
|------|------|
| 自動化 E2E 測試 | 超出本輪範疇，留待 CI 環境建立後執行 |
| 多 store 併發測試 | 超出本輪範疇 |
| 錯誤處理邊界測試 | 超出本輪範疇 |

## 8. 風險與待確認

1. **worktree API server 不自動重啟**：API server 在 worktree process（PID 74476）；若 Replit session 重啟，需手動重啟
2. **Replit workflow 仍指向 port 8080**：若 Replit 重跑 workflow，shop-app API proxy 會打到不存在的 8080，需手動指定 `API_SERVER_PORT=19080`
3. **smoke test 使用者帳號 `user_3ESB3C2JbFwb68MtvKgLe70Hpg4`**：此為測試帳號，cleanup 後 store_id=1 已無設定資料

## 9. 下一步建議

下一步：**Step 7E-2-FINAL-REVIEW**

1. 整體 Step 7E 程式碼 review
2. 確認 API / UI / DB schema 三層一致性
3. 確認 security 規格（secret hash 保護、auth 檢查）
4. 合併至主要開發分支前最終確認

---

**本次操作說明：**

- 本次未修改 UI code
- 本次未修改 backend API
- 本次未修改 OpenAPI / codegen
- 本次未修改 schema
- 本次未修改 migration
- 本次未執行 DB push
- 本次未執行 migrate
- 本次未執行 seed
- 本次未 push GitHub
- 本次有清理 smoke test row（DELETE WHERE store_id=1）
- cleanup 後 store_id=1 remaining_rows = 0
