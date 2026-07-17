import assert from "node:assert/strict";
import test from "node:test";

import {
  TrackingWorkerWriteNotEnabledError,
  assertPhase1WriteDisabled,
  isTrackingWorkerWriteRequested,
  runTrackingWorkerPhase1,
  trackingRetryDelayMs,
} from "./trackingWorkerPhase1.ts";

test("write gate defaults closed and Phase 1 rejects an explicit write request", () => {
  assert.equal(isTrackingWorkerWriteRequested(undefined), false);
  assert.equal(isTrackingWorkerWriteRequested("TRUE"), false);
  assert.equal(isTrackingWorkerWriteRequested("true"), true);
  assert.doesNotThrow(() => assertPhase1WriteDisabled(undefined));
  assert.throws(
    () => assertPhase1WriteDisabled("true"),
    TrackingWorkerWriteNotEnabledError,
  );
});

test("exponential retry starts at 30 minutes and caps at 6 hours", () => {
  assert.equal(trackingRetryDelayMs(1), 30 * 60 * 1000);
  assert.equal(trackingRetryDelayMs(2), 60 * 60 * 1000);
  assert.equal(trackingRetryDelayMs(3), 2 * 60 * 60 * 1000);
  assert.equal(trackingRetryDelayMs(4), 4 * 60 * 60 * 1000);
  assert.equal(trackingRetryDelayMs(5), 6 * 60 * 60 * 1000);
  assert.equal(trackingRetryDelayMs(10), 6 * 60 * 60 * 1000);
});

test("an occupied lease prevents adapter and audit work", async () => {
  let queried = false;
  let recorded = false;
  const result = await runTrackingWorkerPhase1(
    [],
    {
      acquireLease: async () => ({ acquired: false, release: async () => {} }),
      querySevenEleven: async () => {
        queried = true;
        throw new Error("must not run");
      },
      recordReport: async () => {
        recorded = true;
      },
      runId: () => "test-run",
    },
    undefined,
  );
  assert.deepEqual(result, { status: "already_running" });
  assert.equal(queried, false);
  assert.equal(recorded, false);
});

test("dry-run records only aggregate differences and releases its lease", async () => {
  let released = false;
  const auditRows = [];
  const result = await runTrackingWorkerPhase1(
    [
      {
        shipmentTrackingId: 1,
        storeId: 7,
        trackingCode: "A12345678901",
        currentStatusText: "old",
        failureCount: 0,
      },
      {
        shipmentTrackingId: 2,
        storeId: 7,
        trackingCode: "B12345678901",
        currentStatusText: "same",
        failureCount: 1,
      },
      {
        shipmentTrackingId: 3,
        storeId: 7,
        trackingCode: "C12345678901",
        currentStatusText: null,
        failureCount: 2,
      },
    ],
    {
      acquireLease: async () => ({
        acquired: true,
        release: async () => {
          released = true;
        },
      }),
      querySevenEleven: async (trackingCode) => {
        if (trackingCode.startsWith("C")) {
          return {
            ok: false,
            provider: "711",
            trackingCode,
            errorCode: "NETWORK_FAILED",
            message: "network",
            attempts: 1,
          };
        }
        return {
          ok: true,
          provider: "711",
          trackingCode,
          latestStatus: trackingCode.startsWith("B") ? "same" : "new",
          events: [],
        };
      },
      recordReport: async (row) => auditRows.push(row),
      runId: () => "opaque-run",
    },
    undefined,
  );

  assert.equal(result.status, "completed");
  assert.deepEqual(result.reports, [
    {
      dryRun: true,
      provider: "711",
      runId: "opaque-run",
      totalJobs: 3,
      changedCount: 1,
      unchangedCount: 1,
      failedCount: 1,
      retryAfterMs: 2 * 60 * 60 * 1000,
    },
  ]);
  assert.deepEqual(auditRows, [
    {
      storeId: 7,
      actor: "tracking-worker",
      action: "tracking_dryrun_report",
      target: "tracking-run:opaque-run:jobs-3:changed-1:failed-1",
    },
  ]);
  assert.equal(JSON.stringify(auditRows).includes("A12345678901"), false);
  assert.equal(released, true);
});
