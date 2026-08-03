export const TRACKING_WRITE_COMPLETED_AUDIT_ACTION = "tracking_write_completed";
export const TRACKING_WRITE_ABORTED_AUDIT_ACTION = "tracking_write_aborted";
export const TRACKING_WRITE_PARTIAL_AUDIT_ACTION = "tracking_write_partial";
export const TRACKING_WRITE_STARTED_AUDIT_ACTION = "tracking_write_started";
export const TRACKING_WRITE_FINISHED_AUDIT_ACTION = "tracking_write_finished";

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
  orderId: number;
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
  payloadDigest: string;
  payload: TrackingWorkerPhase2WritePayload;
}

export interface TrackingWorkerPhase2WriteEvent {
  eventStatus: string;
  eventDescription: string;
  eventLocation: string | null;
  occurredAt: string;
  rawData: Record<string, unknown>;
  idempotencyKey: string;
}

export interface TrackingWorkerPhase2WritePayload {
  normalizedStatus: string;
  latestStatusText: string;
  latestEventAt: string | null;
  events: readonly TrackingWorkerPhase2WriteEvent[];
}

export interface TrackingWorkerPhase2CommitContext {
  runId: string;
  jobIndex: number;
  totalJobs: number;
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
    context: TrackingWorkerPhase2CommitContext,
  ) => Promise<{ insertedEventCount: number }>;
  recordAudit: (input: {
    storeId: number;
    actor: "tracking-worker";
    action:
      | typeof TRACKING_WRITE_COMPLETED_AUDIT_ACTION
      | typeof TRACKING_WRITE_ABORTED_AUDIT_ACTION
      | typeof TRACKING_WRITE_PARTIAL_AUDIT_ACTION
      | typeof TRACKING_WRITE_STARTED_AUDIT_ACTION
      | typeof TRACKING_WRITE_FINISHED_AUDIT_ACTION;
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
    first.normalizedStatus === second.normalizedStatus &&
    first.payloadDigest === second.payloadDigest
  );
}

async function recordRunAudits(
  jobs: TrackingWorkerPhase2Job[],
  deps: TrackingWorkerPhase2Deps,
  runId: string,
  action:
    | typeof TRACKING_WRITE_STARTED_AUDIT_ACTION
    | typeof TRACKING_WRITE_FINISHED_AUDIT_ACTION,
  suffix: string,
): Promise<void> {
  const storeIds = [...new Set(jobs.map((job) => job.storeId))].sort(
    (a, b) => a - b,
  );
  for (const storeId of storeIds) {
    await deps.recordAudit({
      storeId,
      actor: "tracking-worker",
      action,
      target: `tracking-run:${runId}:${suffix}:jobs-${jobs.length}`,
    });
  }
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

async function recordPartialAudits(
  jobs: TrackingWorkerPhase2Job[],
  deps: TrackingWorkerPhase2Deps,
  runId: string,
  completedJobCount: number,
  insertedEventCount: number,
): Promise<void> {
  const storeIds = [...new Set(jobs.map((job) => job.storeId))].sort(
    (a, b) => a - b,
  );
  for (const storeId of storeIds) {
    await deps.recordAudit({
      storeId,
      actor: "tracking-worker",
      action: TRACKING_WRITE_PARTIAL_AUDIT_ACTION,
      // Run-level aggregate only: no tracking code, preview hash, or PII.
      target: `tracking-run:${runId}:status-partial:completed-${completedJobCount}:jobs-${jobs.length}:inserted-${insertedEventCount}`,
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
  await recordRunAudits(
    jobs,
    deps,
    runId,
    TRACKING_WRITE_STARTED_AUDIT_ACTION,
    "status-started",
  );
  const initialPreviews: TrackingWorkerPhase2Preview[] = [];
  try {
    for (const job of jobs) initialPreviews.push(await deps.preview(job));
  } catch (error) {
    await recordPartialAudits(jobs, deps, runId, 0, 0);
    throw error;
  }

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
    let hashMatches: boolean;
    let repeated: TrackingWorkerPhase2Preview;
    try {
      hashMatches = await deps.verifyPreviewHash(job, initial);
      repeated = await deps.preview(job);
    } catch (error) {
      await recordPartialAudits(jobs, deps, runId, 0, 0);
      throw error;
    }
    if (!hashMatches || !samePreview(initial, repeated)) {
      await recordAbortedAudits(jobs, deps, runId, "PREVIEW_DRIFT");
      return { status: "aborted", runId, reason: "PREVIEW_DRIFT" };
    }
    verifiedPreviews.push(initial);
  }

  let insertedEventCount = 0;
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index]!;
    let committed: { insertedEventCount: number };
    try {
      committed = await deps.commit(job, verifiedPreviews[index]!, {
        runId,
        jobIndex: index,
        totalJobs: jobs.length,
      });
    } catch (error) {
      await recordPartialAudits(jobs, deps, runId, index, insertedEventCount);
      throw error;
    }
    insertedEventCount += committed.insertedEventCount;
  }
  await recordRunAudits(
    jobs,
    deps,
    runId,
    TRACKING_WRITE_FINISHED_AUDIT_ACTION,
    `status-completed:inserted-${insertedEventCount}`,
  );
  return {
    status: "completed",
    runId,
    totalJobs: jobs.length,
    insertedEventCount,
  };
}
