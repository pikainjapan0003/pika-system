import assert from "node:assert/strict";
import test from "node:test";

import {
  TRACKING_WORKER_MAX_EVENT_CHANGES_PER_RUN,
  TrackingWorkerPhase2NotEnabledError,
  runTrackingWorkerPhase2,
} from "./trackingWorkerPhase2.ts";

const job = (overrides = {}) => ({
  storeId: 7,
  trackingId: 11,
  provider: "postoffice",
  trackingCode: "FAKE-CODE-DO-NOT-LOG",
  ...overrides,
});

const preview = (overrides = {}) => ({
  previewHash: "opaque-preview-token",
  expectedEventCount: 2,
  latestStatusText: "in transit",
  latestEventAt: "2026-07-17T00:00:00.000Z",
  normalizedStatus: "in_transit",
  ...overrides,
});

function baseDeps(overrides = {}) {
  return {
    preview: async () => preview(),
    verifyPreviewHash: async () => true,
    commit: async () => ({ insertedEventCount: 2 }),
    recordAudit: async () => {},
    runId: () => "opaque-run-id",
    ...overrides,
  };
}

test("write gate is closed unless the value is exactly true", async () => {
  let touched = false;
  const deps = baseDeps({
    preview: async () => {
      touched = true;
      return preview();
    },
  });
  await assert.rejects(
    runTrackingWorkerPhase2([job()], deps, undefined),
    TrackingWorkerPhase2NotEnabledError,
  );
  await assert.rejects(
    runTrackingWorkerPhase2([job()], deps, "TRUE"),
    TrackingWorkerPhase2NotEnabledError,
  );
  assert.equal(touched, false);
});

test("preview drift aborts the full batch before any commit", async () => {
  const previews = [preview(), preview({ expectedEventCount: 3 })];
  let commits = 0;
  const audits = [];
  const result = await runTrackingWorkerPhase2(
    [job()],
    baseDeps({
      preview: async () => previews.shift(),
      commit: async () => {
        commits += 1;
        return { insertedEventCount: 0 };
      },
      recordAudit: async (row) => audits.push(row),
    }),
    "true",
  );
  assert.deepEqual(result, {
    status: "aborted",
    runId: "opaque-run-id",
    reason: "PREVIEW_DRIFT",
  });
  assert.equal(commits, 0);
  assert.equal(audits[0].action, "tracking_write_aborted");
  assert.equal(JSON.stringify(audits).includes("FAKE-CODE-DO-NOT-LOG"), false);
  assert.equal(JSON.stringify(audits).includes("opaque-preview-token"), false);
});

test("anomalous event volume aborts before hash verification and commit", async () => {
  let verified = false;
  let committed = false;
  const result = await runTrackingWorkerPhase2(
    [job(), job({ trackingId: 12 })],
    baseDeps({
      preview: async (candidate) =>
        preview({
          expectedEventCount:
            candidate.trackingId === 11
              ? TRACKING_WORKER_MAX_EVENT_CHANGES_PER_RUN
              : 1,
        }),
      verifyPreviewHash: async () => {
        verified = true;
        return true;
      },
      commit: async () => {
        committed = true;
        return { insertedEventCount: 0 };
      },
    }),
    "true",
  );
  assert.equal(result.reason, "ANOMALY_GATE");
  assert.equal(verified, false);
  assert.equal(committed, false);
});

test("all hashes and re-previews are validated before single-job commits", async () => {
  const jobs = [job(), job({ storeId: 8, trackingId: 12, provider: "tcat" })];
  const previewCount = new Map();
  const committed = [];
  const audits = [];
  const result = await runTrackingWorkerPhase2(
    jobs,
    baseDeps({
      preview: async (candidate) => {
        previewCount.set(
          candidate.trackingId,
          (previewCount.get(candidate.trackingId) ?? 0) + 1,
        );
        return preview();
      },
      commit: async (candidate) => {
        committed.push(candidate.trackingId);
        return { insertedEventCount: 2 };
      },
      recordAudit: async (row) => audits.push(row),
    }),
    "true",
  );
  assert.deepEqual([...previewCount.values()], [2, 2]);
  assert.deepEqual(committed, [11, 12]);
  assert.deepEqual(result, {
    status: "completed",
    runId: "opaque-run-id",
    totalJobs: 2,
    insertedEventCount: 4,
  });
  assert.deepEqual(
    audits.map((row) => row.storeId),
    [7, 8],
  );
});
