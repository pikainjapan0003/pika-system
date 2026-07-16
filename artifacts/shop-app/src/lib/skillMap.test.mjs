import assert from "node:assert/strict";
import test from "node:test";

import { resolveSkillUnlocks, SKILL_GROUPS } from "./skillMap.ts";

const emptyFacts = {
  hasStore: true,
  hasProduct: false,
  hasOrder: false,
  hasStoreExchangeRate: false,
  hasProductCost: false,
  hasLinkedTripRoute: false,
  hasTierPrice: false,
  hasShipmentOrder: false,
  hasAutomationFoundation: false,
};

test("every seller stream has cards with all four required fields", () => {
  assert.deepEqual(SKILL_GROUPS.map((group) => group.id), [
    "beginner",
    "cost",
    "group-buy",
    "wholesale",
    "shipping",
    "automation",
  ]);
  for (const group of SKILL_GROUPS) {
    assert.ok(group.skills.length > 0);
    for (const skill of group.skills) {
      assert.ok(skill.saves);
      assert.ok(skill.prerequisite);
      assert.ok(skill.risk);
      assert.ok(skill.effect);
    }
  }
});

test("cost skills unlock only from existing cost data", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(resolveSkillUnlocks(emptyFacts)).filter(([id]) => ["S-07", "S-08", "S-09"].includes(id))),
    { "S-07": false, "S-08": false, "S-09": false },
  );

  const unlocked = resolveSkillUnlocks({
    ...emptyFacts,
    hasStoreExchangeRate: true,
    hasProductCost: true,
    hasLinkedTripRoute: true,
  });
  assert.equal(unlocked["S-07"], true);
  assert.equal(unlocked["S-08"], true);
  assert.equal(unlocked["S-09"], true);
});

test("external automation stays locked without its reviewed foundation", () => {
  assert.equal(resolveSkillUnlocks(emptyFacts)["S-23"], false);
  assert.equal(resolveSkillUnlocks({ ...emptyFacts, hasAutomationFoundation: true })["S-23"], true);
  assert.equal(resolveSkillUnlocks({ ...emptyFacts, hasAutomationFoundation: true })["S-21"], false);
});
