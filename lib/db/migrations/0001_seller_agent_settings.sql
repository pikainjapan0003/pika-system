-- Step 7E-1a-CODE-RESTORE: seller_agent_settings 手寫 DDL 紀錄
--
-- 本專案原本偏向使用 `drizzle-kit push`（push-only 工作流，不使用
-- drizzle-kit generate 產生的編號 migration journal）。
-- 本檔案是手寫 DDL 紀錄，用於說明 sellerAgentSettingsTable 對應的
-- 實際資料庫結構，並非透過 `drizzle-kit generate` 自動產生。
--
-- 本次（Step 7E-1a-CODE-RESTORE）僅恢復程式碼本體：
--   * 未執行 DB push
--   * 未執行 migrate
--   * 未對任何既有資料表（orders / seller_agent_tokens / agent_run_logs /
--     shipment_trackings / shipment_tracking_events 等）做任何 DROP / ALTER / TRUNCATE
--
-- 風險提醒：未來若改用 `drizzle-kit generate` 產生正式 migration journal，
-- 本檔案的編號（0001）可能與自動產生的編號衝突，需要使用者決定本檔案的定位
-- （baseline 保留 / 正式 migration / 刪除回 push-only）。

CREATE TABLE IF NOT EXISTS "seller_agent_settings" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL,
  "merchant_id" text NOT NULL,
  "agent_status" text NOT NULL DEFAULT 'disabled',
  "agent_mode" text NOT NULL DEFAULT 'rule_worker',
  "enabled_logistics" jsonb NOT NULL DEFAULT '[]',
  "query_methods" jsonb NOT NULL DEFAULT '["manual"]',
  "query_frequency" text NOT NULL DEFAULT 'manual',
  "notify_on_unknown" boolean NOT NULL DEFAULT true,
  "require_confirm_on_exception" boolean NOT NULL DEFAULT true,
  "require_confirm_on_returned" boolean NOT NULL DEFAULT false,
  "require_confirm_on_delivered" boolean NOT NULL DEFAULT false,
  "hide_error_details_from_buyer" boolean NOT NULL DEFAULT true,
  "webhook_enabled" boolean NOT NULL DEFAULT false,
  "webhook_url" text,
  "webhook_secret_hash" text,
  "last_test_run_at" timestamptz,
  "last_run_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "seller_agent_settings_store_id_unique" UNIQUE ("store_id"),
  CONSTRAINT "seller_agent_settings_store_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE CASCADE,
  CONSTRAINT "seller_agent_settings_agent_status_valid"
    CHECK ("agent_status" IN ('disabled', 'enabled')),
  CONSTRAINT "seller_agent_settings_agent_mode_valid"
    CHECK ("agent_mode" IN ('self_hosted_webhook', 'external_agent', 'rule_worker', 'platform_managed_reserved')),
  CONSTRAINT "seller_agent_settings_query_frequency_valid"
    CHECK ("query_frequency" IN ('manual', 'daily', 'every_6_hours', 'every_2_hours_high_tier'))
);

CREATE INDEX IF NOT EXISTS "seller_agent_settings_merchant_id_store_id_idx"
  ON "seller_agent_settings" ("merchant_id", "store_id");

CREATE INDEX IF NOT EXISTS "seller_agent_settings_agent_status_idx"
  ON "seller_agent_settings" ("agent_status");

CREATE INDEX IF NOT EXISTS "seller_agent_settings_query_frequency_idx"
  ON "seller_agent_settings" ("query_frequency");
