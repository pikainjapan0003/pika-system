import assert from "node:assert/strict";
import test from "node:test";

import {
  ONBOARDING_PACKAGE_PRIORITY,
  ONBOARDING_QUESTIONS,
  recommendOnboardingPackages,
} from "./onboardingQuestionnaire.ts";

test("the questionnaire has four owner-facing questions", () => {
  assert.equal(ONBOARDING_QUESTIONS.length, 4);
  assert.deepEqual(ONBOARDING_PACKAGE_PRIORITY, [
    "beginner",
    "cost",
    "shipping",
    "group-buy",
    "wholesale",
    "automation",
  ]);
});

test("skipping every question recommends only the beginner package", () => {
  const result = recommendOnboardingPackages({});
  assert.equal(result.mainPackage, "beginner");
  assert.deepEqual(result.packagesToApply, ["beginner"]);
});

test("a cost-focused owner receives beginner then cost", () => {
  const result = recommendOnboardingPackages({
    primaryWork: "cost-control",
    costNeed: "precise",
    orderVolume: "low",
    logisticsNeed: "simple",
  });
  assert.equal(result.mainPackage, "cost");
  assert.deepEqual(result.packagesToApply, ["beginner", "cost"]);
});

test("frequent logistics work recommends shipping", () => {
  const result = recommendOnboardingPackages({
    primaryWork: "shipping",
    logisticsNeed: "frequent",
  });
  assert.equal(result.mainPackage, "shipping");
});

test("medium order volume reinforces the group-buy package", () => {
  const result = recommendOnboardingPackages({
    primaryWork: "group-orders",
    orderVolume: "medium",
  });
  assert.equal(result.mainPackage, "group-buy");
});

test("high order volume and customer tiers recommend wholesale", () => {
  const result = recommendOnboardingPackages({
    primaryWork: "customer-tiers",
    orderVolume: "high",
  });
  assert.equal(result.mainPackage, "wholesale");
});

test("automation demand recommends automation", () => {
  const result = recommendOnboardingPackages({
    primaryWork: "automation",
    logisticsNeed: "automate",
  });
  assert.equal(result.mainPackage, "automation");
});

test("a score tie uses the documented stable package order", () => {
  const result = recommendOnboardingPackages({
    primaryWork: "cost-control",
    logisticsNeed: "frequent",
  });
  assert.equal(result.scores.cost, 2);
  assert.equal(result.scores.shipping, 2);
  assert.equal(result.mainPackage, "cost");
});
