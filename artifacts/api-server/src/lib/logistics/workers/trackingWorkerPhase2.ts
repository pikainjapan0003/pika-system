export const TRACKING_WRITE_COMPLETED_AUDIT_ACTION = "tracking_write_completed";
export const TRACKING_WRITE_ABORTED_AUDIT_ACTION = "tracking_write_aborted";

// S-16 anomaly gate: adjustable constant. The reviewed controlled writer still
// imposes its stricter five-job batch limit independently.
export const TRACKING_WORKER_MAX_EVENT_CHANGES_PER_RUN = 50;

export class TrackingWorkerPhase2NotEnabledError extends Error {
  constructor() {
    super("TRACKING_WORKER_WRITE_NOT_ENABLED");
    this.name = "TrackingWorkerPhase2NotEnabledError";
  }
}

export interface TrackingWorkerPhase2Job {
  storeId: number;
  trackingId: number;
  provider: "postoffice" | "tcat";
  trackingCode: string;
}

export interface TrackingWorkerPhase2Preview {
  previewHash: string;
  expectedEventCount: number;
  latestStatusText: string | null;
  latestEventAt: string | null;
  normalizedStatus: string | null;
}

export interface TrackingWorkerPhase2Deps {
  preview: (
    job: TrackingWorkerPhase2Job,
  ) => Promise<TrackingWorkerPhase2Preview>;
  verifyPreviewHash: (
    job: TrackingWorkerPhase2Job,
    preview: TrackingWorkerPhase2Preview,
  ) => Promise<boolean>;
  commit: (
    job: TrackingWorkerPhase2Job,
    preview: TrackingWorkerPhase2Preview,
  ) => Promise<{ insertedEventCount: number }>;
  recordAudit: (input: {
    storeId: number;
    actor: "tracking-worker";
    action:
      | typeof TRACKING_WRITE_COMPLETED_AUDIT_ACTION
      | typeof TRACKING_WRITE_ABORTED_AUDIT_ACTION;
    target: string;
  }) => Promise<void>;
  runId: () => string;
}

export type TrackingWorkerPhase2Result =
  | {
      status: "completed";
      runId: string;
      totalJobs: number;
      insertedEventCount: number;
    }
  | {
      status: "aborted";
      runId: string;
      reason: "ANOMALY_GATE" | "PREVIEW_DRIFT";
    };

function samePreview(
  first: TrackingWorkerPhase2Preview,
  second: TrackingWorkerPhase2Preview,
): boolean {
  return (
    first.expectedEventCount === second.expectedEventCount &&
    first.latestStatusText === second.latestStatusText &&
    first.latestEventAt === second.latestEventAt &&
    first.normalizedStatus === second.normalizedStatus
  );
}

async function recordAbortedAudits(
  jobs: TrackingWorkerPhase2Job[],
  deps: TrackingWorkerPhase2Deps,
  runId: string,
  reason: "ANOMALY_GATE" | "PREVIEW_DRIFT",
): Promise<void> {
  const storeIds = [...new Set(jobs.map((job) => job.storeId))].sort(
    (a, b) => a - b,
  );
  for (const storeId of storeIds) {
    await deps.recordAudit({
      storeId,
      actor: "tracking-worker",
      action: TRACKING_WRITE_ABORTED_AUDIT_ACTION,
      // Deliberately excludes tracking codes, preview hashes, and PII.
      target: `tracking-run:${runId}:reason-${reason}:jobs-${jobs.length}`,
    });
  }
}

/**
 * Phase 2 safety orchestrator. It previews every job, validates the aggregate
 * anomaly gate, verifies every signed preview, and re-previews the full batch
 * before the first commit. Commit implementations must use the existing
 * controlled writer, whose table/field whitelist expressly excludes orders,
 * money, customers, provider/code, and source fields.
 */
export async function runTrackingWorkerPhase2(
  jobs: TrackingWorkerPhase2Job[],
  deps: TrackingWorkerPhase2Deps,
  writeEnabledValue: string | undefined = process.env
    .TRACKING_WORKER_WRITE_ENABLED,
): Promise<TrackingWorkerPhase2Result> {
  if (writeEnabledValue !== "true") {
    throw new TrackingWorkerPhase2NotEnabledError();
  }

  const runId = deps.runId();
  const initialPreviews: TrackingWorkerPhase2Preview[] = [];
  for (const job of jobs) initialPreviews.push(await deps.preview(job));

  const expectedChanges = initialPreviews.reduce(
    (sum, preview) => sum + preview.expectedEventCount,
    0,
  );
  if (expectedChanges > TRACKING_WORKER_MAX_EVENT_CHANGES_PER_RUN) {
    await recordAbortedAudits(jobs, deps, runId, "ANOMALY_GATE");
    return { status: "aborted", runId, reason: "ANOMALY_GATE" };
  }

  const verifiedPreviews: TrackingWorkerPhase2Preview[] = [];
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index]!;
    const initial = initialPreviews[index]!;
    const hashMatches = await deps.verifyPreviewHash(job, initial);
    const repeated = await deps.preview(job);
    if (!hashMatches || !samePreview(initial, repeated)) {
      await recordAbortedAudits(jobs, deps, runId, "PREVIEW_DRIFT");
      return { status: "aborted", runId, reason: "PREVIEW_DRIFT" };
    }
    verifiedPreviews.push(initial);
  }

  let insertedEventCount = 0;
  for (let index = 0; index < jobs.length; index += 1) {
    const committed = await deps.commit(jobs[index]!, verifiedPreviews[index]!);
    insertedEventCount += committed.insertedEventCount;
  }

  const storeIds = [...new Set(jobs.map((job) => job.storeId))].sort(
    (a, b) => a - b,
  );
  for (const storeId of storeIds) {
    await deps.recordAudit({
      storeId,
      actor: "tracking-worker",
      action: TRACKING_WRITE_COMPLETED_AUDIT_ACTION,
      target: `tracking-run:${runId}:jobs-${jobs.length}:inserted-${insertedEventCount}`,
    });
  }
  return {
    status: "completed",
    runId,
    totalJobs: jobs.length,
    insertedEventCount,
  };
}
