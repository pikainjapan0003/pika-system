import { randomUUID } from "node:crypto";

import { db, auditLogsTable } from "@workspace/db";

import {
  isPreviewTokenAvailable,
  signPreviewToken,
  verifyPreviewToken,
} from "../previewToken.ts";
import { runControlledDbWrite } from "./multiProviderControlledWriteWorker.ts";
import { runControlledWorkerBatch } from "./multiProviderDryRunWorker.ts";
import {
  runTrackingWorkerPhase2,
  type TrackingWorkerPhase2Deps,
  type TrackingWorkerPhase2Job,
  type TrackingWorkerPhase2Preview,
  type TrackingWorkerPhase2Result,
} from "./trackingWorkerPhase2.ts";

async function previewJob(
  job: TrackingWorkerPhase2Job,
): Promise<TrackingWorkerPhase2Preview> {
  const result = await runControlledWorkerBatch([job], { maxBatchSize: 1 });
  const preview = result.jobs[0];
  if (!preview?.ok) {
    throw new Error(
      preview?.skippedReason ?? preview?.errorCode ?? "PREVIEW_FAILED",
    );
  }
  if (!isPreviewTokenAvailable()) {
    throw new Error("PREVIEW_HASH_UNAVAILABLE");
  }
  const expectedEventCount = preview.wouldWriteEvents;
  const latestStatusText = preview.latestStatusText;
  const latestEventAt = preview.latestEventAt;
  const normalizedStatus = preview.latestStatus;
  const signed = signPreviewToken({
    storeId: job.storeId,
    trackingId: job.trackingId,
    provider: job.provider,
    trackingCode: job.trackingCode,
    latestStatusText,
    latestEventAt,
    expectedEventCount,
    normalizedStatus,
  });
  return {
    previewHash: signed.token,
    expectedEventCount,
    latestStatusText,
    latestEventAt,
    normalizedStatus,
  };
}

const runtimeDeps: TrackingWorkerPhase2Deps = {
  preview: previewJob,
  verifyPreviewHash: async (job, preview) => {
    const verified = verifyPreviewToken(preview.previewHash);
    if (!verified.ok) return false;
    const payload = verified.payload;
    return (
      payload.storeId === job.storeId &&
      payload.trackingId === job.trackingId &&
      payload.provider === job.provider &&
      payload.trackingCode === job.trackingCode &&
      payload.expectedEventCount === preview.expectedEventCount &&
      payload.latestStatusText === preview.latestStatusText &&
      payload.latestEventAt === preview.latestEventAt &&
      payload.normalizedStatus === preview.normalizedStatus
    );
  },
  commit: async (job) => {
    const result = await runControlledDbWrite(
      [{ ...job, writeMode: "write" }],
      {
        storeId: job.storeId,
        createdBy: "tracking-worker-phase2",
      },
    );
    const committed = result.jobs[0];
    if (committed?.status !== "success") {
      throw new Error(
        committed?.skippedReason ?? committed?.errorCode ?? "COMMIT_FAILED",
      );
    }
    return { insertedEventCount: committed.insertedEventCount ?? 0 };
  },
  recordAudit: async (input) => {
    await db.insert(auditLogsTable).values(input);
  },
  runId: randomUUID,
};

/**
 * Not scheduled and never changes env configuration. Calling this function is
 * still fail-closed unless TRACKING_WORKER_WRITE_ENABLED is exactly "true".
 */
export function runTrackingWorkerPhase2WithExistingChain(
  jobs: TrackingWorkerPhase2Job[],
  writeEnabledValue: string | undefined = process.env
    .TRACKING_WORKER_WRITE_ENABLED,
): Promise<TrackingWorkerPhase2Result> {
  return runTrackingWorkerPhase2(jobs, runtimeDeps, writeEnabledValue);
}
