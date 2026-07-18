import assert from "node:assert/strict";
import test from "node:test";

import {
  DAILY_SKILL_SURFACE_RULES,
  Q37_BEGINNER_DEFAULT_DAILY_PAGES,
  countEnabledStoreSkills,
  resolveDailySkillSurfaceVisibility,
} from "./dailySkillVisibility.ts";
import { SKILL_KEYS } from "@workspace/db/skill-map";

test("zero-skill onboarding count only includes explicitly enabled skills", () => {
  assert.equal(countEnabledStoreSkills([]), 0);
  assert.equal(
    countEnabledStoreSkills([
      { skillKey: "S-01", enabled: false, configured: true },
      { skillKey: "S-07", enabled: true, configured: true },
      { skillKey: "S-08", enabled: true, configured: false },
    ]),
    1,
  );
});

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

test("every gated daily surface maps to a catalog skill and opens when enabled", () => {
  const catalog = new Set(SKILL_KEYS);
  for (const [surface, rule] of Object.entries(DAILY_SKILL_SURFACE_RULES)) {
    if (rule.skillKey === null) continue;
    assert.equal(
      catalog.has(rule.skillKey),
      true,
      `${surface} maps to unknown skill ${rule.skillKey}`,
    );
    assert.equal(
      resolveDailySkillSurfaceVisibility(surface, [
        { skillKey: rule.skillKey, enabled: true, configured: true },
      ]),
      true,
      `${surface} remains hidden after ${rule.skillKey} is enabled`,
    );
  }
});

test("Q37 beginner routes remain default-visible without configured skill rows", () => {
  const defaultOpenSurfaces = [
    "dashboard",
    "products",
    "orders",
    "settings",
    "guide",
    "categories",
    "skill-map",
  ];
  for (const surface of defaultOpenSurfaces) {
    assert.equal(
      resolveDailySkillSurfaceVisibility(surface, []),
      true,
      `${surface} unexpectedly closed for a new store`,
    );
  }
  assert.equal(Q37_BEGINNER_DEFAULT_DAILY_PAGES.length, 8);
});
