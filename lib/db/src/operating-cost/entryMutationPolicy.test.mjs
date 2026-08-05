import assert from "node:assert/strict";
import test from "node:test";
import {
  canDeleteEntry,
  canEditEntry,
  canVoidEntry,
  unlockEstimate,
} from "./entryMutationPolicy.ts";

const activeActual = { tripStatus: "ACTIVE", entryMode: "ACTUAL", estimateLocked: false };

test("planning and active entries can edit/delete/void", () => {
  assert.equal(canEditEntry(activeActual), true);
  assert.equal(canDeleteEntry(activeActual), true);
  assert.equal(canVoidEntry(activeActual), true);
  assert.equal(canEditEntry({ ...activeActual, tripStatus: "PLANNING" }), true);
});

test("closed entries can only be voided", () => {
  const context = { ...activeActual, tripStatus: "CLOSED" };
  assert.equal(canEditEntry(context), false);
  assert.equal(canDeleteEntry(context), false);
  assert.equal(canVoidEntry(context), true);
});

test("locked estimate entries reject every mutation", () => {
  const context = { ...activeActual, entryMode: "ESTIMATE", estimateLocked: true };
  assert.equal(canEditEntry(context), false);
  assert.equal(canDeleteEntry(context), false);
  assert.equal(canVoidEntry(context), false);
});

test("actual entries are not blocked by estimate lock", () => {
  const context = { ...activeActual, entryMode: "ACTUAL", estimateLocked: true };
  assert.equal(canEditEntry(context), true);
  assert.equal(canDeleteEntry(context), true);
  assert.equal(canVoidEntry({ ...context, tripStatus: "CLOSED" }), true);
});

test("unlocking an estimate permanently marks it modified", () => {
  assert.deepEqual(unlockEstimate({ estimateLocked: true, estimateModifiedAfterLock: false }), {
    estimateLocked: false,
    estimateModifiedAfterLock: true,
  });
  assert.deepEqual(unlockEstimate({ estimateLocked: false, estimateModifiedAfterLock: true }), {
    estimateLocked: false,
    estimateModifiedAfterLock: true,
  });
});

test("closed unlocked estimate may be voided but not edited", () => {
  const context = { tripStatus: "CLOSED", entryMode: "ESTIMATE", estimateLocked: false };
  assert.equal(canEditEntry(context), false);
  assert.equal(canDeleteEntry(context), false);
  assert.equal(canVoidEntry(context), true);
});
