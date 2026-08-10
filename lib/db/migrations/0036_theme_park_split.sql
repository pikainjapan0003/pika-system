-- lib/db/migrations/0036_theme_park_split.sql
--
-- 樂園門票費用 → 迪士尼門票費用 ＋ 環球影城門票費用（FIXED 11 → 12）
--
-- 設計說明：
--   * 本檔只負責「它自己改變的東西」：移除舊分類、新增兩項、校正 sort_order。
--     VARIABLE／PURCHASE 分類的真相來源是 seedFixedCostDefaults.ts，
--     本檔刻意不重複定義，避免製造第二個真相來源。
--   * migrations/0031 只建立 11 個 FIXED 分類，VARIABLE 與 PURCHASE 從未進入
--     migration 鏈。因此純 migration 環境跑完本檔是 12 筆，不是 20 筆。
--     自我驗證刻意「不」檢查總數，只檢查本檔負責的範圍。
--   * sort_order 採絕對指定而非相對位移：相對位移在舊分類已不存在時
--     會靜默把既有排序整體推移且不報錯。絕對指定與起始狀態無關。
--   * 本檔可重複執行，重跑會維持原狀且成功。

BEGIN;

-- 1) 移除舊分類。
--    cost_entries.category_id 為 ON DELETE RESTRICT：
--    若仍被任何明細參照，這行會直接失敗並回滾整個交易。這是刻意的安全網。
--    若該列不存在（已拆分過），影響 0 列且不報錯。
DELETE FROM "cost_categories" WHERE "code" = 'THEME_PARK';

-- 2) 新增兩個分類。此處 sort_order 只是初值，步驟 3 會統一校正。
--    name 必須與 seedFixedCostDefaults 的種子陣列逐字一致。
INSERT INTO "cost_categories" ("code", "name", "kind", "sort_order") VALUES
  ('THEME_PARK_DISNEY', '迪士尼門票費用',   'FIXED',  9),
  ('THEME_PARK_USJ',    '環球影城門票費用', 'FIXED', 10)
ON CONFLICT ("code") DO NOTHING;

-- 3) 以 canonical 清單絕對指定 sort_order。
--    join 只命中實際存在的 code；VARIABLE／PURCHASE 若尚未由 seed 建立，
--    對應列不存在，該筆自然 no-op，不會報錯。
--    sort_order 無 unique 約束，過程中的暫時重複值不會出錯。
UPDATE "cost_categories" AS c
SET "sort_order" = v."sort_order"
FROM (VALUES
  ('PERSONNEL',          1),
  ('MARKETING',          2),
  ('MEALS',              3),
  ('FLIGHT',             4),
  ('LODGING',            5),
  ('LOCKER',             6),
  ('CAR_RENTAL',         7),
  ('SIM',                8),
  ('THEME_PARK_DISNEY',  9),
  ('THEME_PARK_USJ',    10),
  ('AIRPORT_TRANSFER',  11),
  ('OTHER',             12),
  ('FUEL',              13),
  ('PARKING',           14),
  ('TRAIN',             15),
  ('ETC',               16),
  ('DOMESTIC_SHIPPING', 17),
  ('CONSOLIDATION',     18),
  ('PACKAGING',         19),
  ('PURCHASE',          20)
) AS v("code", "sort_order")
WHERE c."code" = v."code";

-- 4) 自我驗證：只檢查本檔負責的範圍，不檢查全域總數。
--    刻意不驗 total = 20 —— 純 migration 環境無 VARIABLE／PURCHASE，
--    總數為 12；驗總數會誤殺該路徑。
DO $$
DECLARE
  fixed_count int;
  disney      record;
  usj         record;
BEGIN
  IF EXISTS (SELECT 1 FROM "cost_categories" WHERE "code" = 'THEME_PARK') THEN
    RAISE EXCEPTION '0036 失敗：舊分類 THEME_PARK 仍存在';
  END IF;

  SELECT count(*) INTO fixed_count
    FROM "cost_categories" WHERE "kind" = 'FIXED';
  IF fixed_count <> 12 THEN
    RAISE EXCEPTION '0036 失敗：FIXED 分類應為 12，實際 %', fixed_count;
  END IF;

  SELECT "name", "kind", "sort_order" INTO disney
    FROM "cost_categories" WHERE "code" = 'THEME_PARK_DISNEY';
  IF NOT FOUND
     OR disney."name" <> '迪士尼門票費用'
     OR disney."kind" <> 'FIXED'
     OR disney."sort_order" <> 9 THEN
    RAISE EXCEPTION '0036 失敗：THEME_PARK_DISNEY 不符（name=%, kind=%, sort_order=%）',
      disney."name", disney."kind", disney."sort_order";
  END IF;

  SELECT "name", "kind", "sort_order" INTO usj
    FROM "cost_categories" WHERE "code" = 'THEME_PARK_USJ';
  IF NOT FOUND
     OR usj."name" <> '環球影城門票費用'
     OR usj."kind" <> 'FIXED'
     OR usj."sort_order" <> 10 THEN
    RAISE EXCEPTION '0036 失敗：THEME_PARK_USJ 不符（name=%, kind=%, sort_order=%）',
      usj."name", usj."kind", usj."sort_order";
  END IF;
END $$;

COMMIT;
