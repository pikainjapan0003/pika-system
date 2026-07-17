import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSkillPrerequisites,
  previewSkillPackage,
  previewSkillToggle,
} from "./skillState.ts";

const facts = {
  hasStore: true,
  hasProduct: true,
  hasOrder: true,
  hasStoreExchangeRate: true,
  hasProductCost: true,
  hasLinkedTripRoute: false,
  hasTierPrice: false,
  hasShipmentOrder: false,
  hasAutomationFoundation: false,
};

test("missing prerequisites keep a skill locked with an actionable reason", () => {
  assert.deepEqual(evaluateSkillPrerequisites("S-09", facts), {
    ready: false,
    missing: ["請先把商品連結到行程路線"],
  });
  assert.deepEqual(evaluateSkillPrerequisites("S-21", facts), {
    ready: false,
    missing: ["LINE 對客發訊尚未另行核准"],
  });
});

test("high-risk enable preview requires confirmation but disabling does not", () => {
  assert.equal(
    previewSkillToggle({
      skillKey: "S-08",
      currentEnabled: false,
      requestedEnabled: true,
      facts,
    }).highRiskConfirmationRequired,
    true,
  );
  assert.equal(
    previewSkillToggle({
      skillKey: "S-08",
      currentEnabled: true,
      requestedEnabled: false,
      facts,
    }).highRiskConfirmationRequired,
    false,
  );
});

test("package preview only adds ready low-risk skills and never bypasses risk gates", () => {
  assert.deepEqual(
    previewSkillPackage({
      packageKey: "cost",
      enabledSkills: new Set(),
      facts,
    }),
    {
      packageKey: "cost",
      enableNow: [],
      alreadyEnabled: [],
      missingPrerequisite: [
        { skillKey: "S-09", missing: ["請先把商品連結到行程路線"] },
      ],
      requiresConfirmation: ["S-07", "S-08"],
    },
  );
  assert.deepEqual(
    previewSkillPackage({
      packageKey: "group-buy",
      enabledSkills: new Set(["S-04"]),
      facts,
    }),
    {
      packageKey: "group-buy",
      enableNow: ["S-49"],
      alreadyEnabled: ["S-04"],
      missingPrerequisite: [],
      requiresConfirmation: [],
    },
  );
});
