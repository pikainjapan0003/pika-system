import assert from "node:assert/strict";
import test from "node:test";

import {
  Q37_BEGINNER_DEFAULT_DAILY_PAGES,
  resolveDailySkillSurfaceVisibility,
} from "./dailySkillVisibility.ts";

test("Q37 keeps the eight beginner surfaces explicit and default-open", () => {
  assert.deepEqual(
    Q37_BEGINNER_DEFAULT_DAILY_PAGES.map((surface) => surface.label),
    [
      "商品上架",
      "商品分享",
      "客人下單",
      "訂單列表",
      "基本總額",
      "7-11 選店",
      "包貨清單",
      "手動物流",
    ],
  );
  assert.equal(resolveDailySkillSurfaceVisibility("products", []), true);
  assert.equal(resolveDailySkillSurfaceVisibility("orders", []), true);
  assert.equal(resolveDailySkillSurfaceVisibility("guide", []), true);
});

test("advanced surfaces fail closed without an enabled state", () => {
  assert.equal(resolveDailySkillSurfaceVisibility("customers", []), false);
  assert.equal(resolveDailySkillSurfaceVisibility("trips", []), false);
  assert.equal(resolveDailySkillSurfaceVisibility("logistics", []), false);
  assert.equal(resolveDailySkillSurfaceVisibility("agent-settings", []), false);
  assert.equal(resolveDailySkillSurfaceVisibility("audit-logs", []), false);
});

test("an explicit state overrides the rollout default while the map stays visible", () => {
  assert.equal(
    resolveDailySkillSurfaceVisibility("products", [
      { skillKey: "S-01", enabled: false, configured: true },
    ]),
    false,
  );
  assert.equal(
    resolveDailySkillSurfaceVisibility("customers", [
      { skillKey: "S-19", enabled: true, configured: true },
    ]),
    true,
  );
  assert.equal(resolveDailySkillSurfaceVisibility("skill-map", []), true);
});
