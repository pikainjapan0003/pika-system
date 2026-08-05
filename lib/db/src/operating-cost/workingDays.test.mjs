import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkingDays } from "./workingDays.ts";

test("override wins over dates", () => {
  const result = resolveWorkingDays({
    override: "10",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
  });
  assert.deepEqual(result, {
    status: "ready",
    workingDays: 10n,
    source: "override",
  });
});

test("date range is inclusive", () => {
  const result = resolveWorkingDays({
    startDate: "2026-08-01",
    endDate: "2026-08-03",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.workingDays, 3n);
});

test("missing dates are pending", () => {
  const result = resolveWorkingDays({ startDate: "2026-08-01" });
  assert.equal(result.status, "pending_confirmation");
});

test("invalid or reversed dates are pending", () => {
  assert.equal(
    resolveWorkingDays({ startDate: "2026-02-30", endDate: "2026-03-01" })
      .status,
    "pending_confirmation",
  );
  assert.equal(
    resolveWorkingDays({ startDate: "2026-08-03", endDate: "2026-08-01" })
      .status,
    "pending_confirmation",
  );
});
