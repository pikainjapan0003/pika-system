import assert from "node:assert/strict";
import test from "node:test";

import { auditLogsTable } from "@workspace/db/schema";

import { deriveAutomationFoundationFact } from "./automationFoundation.ts";
import { runTrackingWorkerPhase1 } from "./logistics/workers/trackingWorkerPhase1.ts";

test("automation foundation is derived from the audit table and worker module", () => {
  assert.equal(
    deriveAutomationFoundationFact({
      auditLogTable: auditLogsTable,
      trackingWorkerRunner: runTrackingWorkerPhase1,
    }),
    true,
  );
});

test("automation foundation fails closed when either capability is missing", () => {
  assert.equal(
    deriveAutomationFoundationFact({
      auditLogTable: null,
      trackingWorkerRunner: runTrackingWorkerPhase1,
    }),
    false,
  );
  assert.equal(
    deriveAutomationFoundationFact({
      auditLogTable: auditLogsTable,
      trackingWorkerRunner: undefined,
    }),
    false,
  );
  assert.equal(
    deriveAutomationFoundationFact({
      auditLogTable: { action: {}, target: {} },
      trackingWorkerRunner: runTrackingWorkerPhase1,
    }),
    false,
  );
});
