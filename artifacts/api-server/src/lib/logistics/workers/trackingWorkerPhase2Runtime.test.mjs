import assert from "node:assert/strict";
import test from "node:test";

import { createTrackingWorkerPhase2RuntimeDeps } from "./trackingWorkerPhase2Runtime.ts";
import { runTrackingWorkerPhase2 } from "./trackingWorkerPhase2.ts";
import { isTrackingWorkerPhase2OwnedRow } from "./trackingWorkerPhase2Commit.ts";

const job = {
  storeId: 7,
  orderId: 21,
  trackingId: 11,
  provider: "postoffice",
  trackingCode: "FAKE-CODE-DO-NOT-LOG",
};

const adapterResult = {
  ok: true,
  provider: "postoffice",
  trackingCode: job.trackingCode,
  normalizedStatus: "in_transit",
  latestStatusText: "運送中",
  latestEventAt: "2026/07/17 08:00:00",
  events: [
    {
      eventStatus: "in_transit",
      eventDescription: "運送中",
      eventLocation: "測試站",
      occurredAt: "2026/07/17 08:00:00",
      rawData: { fake: true },
    },
  ],
  rawSummary: {},
};

test("runtime commits the verified payload without a third provider fetch", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "phase2-runtime-test-secret";
  let adapterCalls = 0;
  let committedPreview;
  try {
    const deps = createTrackingWorkerPhase2RuntimeDeps({
      adapters: {
        postoffice: async () => {
          adapterCalls += 1;
          return adapterResult;
        },
      },
      commit: async (_job, preview) => {
        committedPreview = preview;
        return { insertedEventCount: 1 };
      },
      recordAudit: async () => {},
      runId: () => "runtime-test-run",
    });
    const result = await runTrackingWorkerPhase2([job], deps, "true");
    assert.equal(result.status, "completed");
    assert.equal(adapterCalls, 2);
    assert.equal(committedPreview.payload.events.length, 1);
    assert.match(committedPreview.payloadDigest, /^[a-f0-9]{64}$/);
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("payload-only drift aborts before commit", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "phase2-runtime-test-secret";
  let adapterCalls = 0;
  let commits = 0;
  try {
    const deps = createTrackingWorkerPhase2RuntimeDeps({
      adapters: {
        postoffice: async () => {
          adapterCalls += 1;
          return {
            ...adapterResult,
            events: [
              {
                ...adapterResult.events[0],
                rawData: { attempt: adapterCalls },
              },
            ],
          };
        },
      },
      commit: async () => {
        commits += 1;
        return { insertedEventCount: 1 };
      },
      recordAudit: async () => {},
      runId: () => "runtime-drift-run",
    });
    const result = await runTrackingWorkerPhase2([job], deps, "true");
    assert.equal(result.status, "aborted");
    assert.equal(result.reason, "PREVIEW_DRIFT");
    assert.equal(adapterCalls, 2);
    assert.equal(commits, 0);
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("ownership guard rejects cross-store, cross-order, inactive, and provider drift", () => {
  const row = {
    trackingId: 11,
    orderId: 21,
    storeId: 7,
    provider: "postoffice",
    trackingCode: job.trackingCode,
    isActive: true,
  };
  assert.equal(isTrackingWorkerPhase2OwnedRow(job, row), true);
  assert.equal(
    isTrackingWorkerPhase2OwnedRow(job, { ...row, storeId: 8 }),
    false,
  );
  assert.equal(
    isTrackingWorkerPhase2OwnedRow(job, { ...row, orderId: 22 }),
    false,
  );
  assert.equal(
    isTrackingWorkerPhase2OwnedRow(job, { ...row, isActive: false }),
    false,
  );
  assert.equal(
    isTrackingWorkerPhase2OwnedRow(job, { ...row, provider: "tcat" }),
    false,
  );
});
