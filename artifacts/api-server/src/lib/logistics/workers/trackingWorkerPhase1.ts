import type { SevenElevenTrackingResult } from "../adapters/sevenElevenAdapter.ts";

export const TRACKING_DRY_RUN_AUDIT_ACTION = "tracking_dryrun_report";

const RETRY_BASE_MS = 30 * 60 * 1000;
const RETRY_CAP_MS = 6 * 60 * 60 * 1000;

export class TrackingWorkerWriteNotEnabledError extends Error {
  constructor() {
    super("TRACKING_WORKER_PHASE1_WRITE_NOT_ENABLED");
    this.name = "TrackingWorkerWriteNotEnabledError";
  }
}

export function isTrackingWorkerWriteRequested(
  value: string | undefined,
): boolean {
  return value === "true";
}

export function assertPhase1WriteDisabled(value: string | undefined): void {
  if (isTrackingWorkerWriteRequested(value)) {
    throw new TrackingWorkerWriteNotEnabledError();
  }
}

export function trackingRetryDelayMs(failureCount: number): number {
  if (!Number.isSafeInteger(failureCount) || failureCount < 1) {
    throw new RangeError("failureCount must be a positive integer");
  }
  return Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (failureCount - 1));
}

export interface TrackingWorkerPhase1Job {
  shipmentTrackingId: number;
  storeId: number;
  trackingCode: string;
  currentStatusText: string | null;
  failureCount: number;
}

export interface TrackingWorkerPhase1Report {
  dryRun: true;
  provider: "711";
  runId: string;
  totalJobs: number;
  changedCount: number;
  unchangedCount: number;
  failedCount: number;
  retryAfterMs: number | null;
}

export interface TrackingWorkerLease {
  acquired: boolean;
  release: () => Promise<void>;
}

export interface TrackingWorkerPhase1Deps {
  acquireLease: () => Promise<TrackingWorkerLease>;
  querySevenEleven: (
    trackingCode: string,
  ) => Promise<SevenElevenTrackingResult>;
  recordReport: (input: {
    storeId: number;
    actor: "tracking-worker";
    action: typeof TRACKING_DRY_RUN_AUDIT_ACTION;
    target: string;
  }) => Promise<void>;
  runId: () => string;
}

export type TrackingWorkerPhase1Result =
  | { status: "already_running" }
  | { status: "completed"; reports: TrackingWorkerPhase1Report[] };

function reportTarget(report: TrackingWorkerPhase1Report): string {
  return [
    `tracking-run:${report.runId}`,
    `jobs-${report.totalJobs}`,
    `changed-${report.changedCount}`,
    `failed-${report.failedCount}`,
  ].join(":");
}

/**
 * Phase 1 is report-only. It queries only the reviewed 7-11 adapter and writes
 * anonymous aggregate audit rows; shipment/order state has no write path here.
 */
export async function runTrackingWorkerPhase1(
  jobs: TrackingWorkerPhase1Job[],
  deps: TrackingWorkerPhase1Deps,
  writeEnabledValue: string | undefined = process.env
    .TRACKING_WORKER_WRITE_ENABLED,
): Promise<TrackingWorkerPhase1Result> {
  assertPhase1WriteDisabled(writeEnabledValue);
  const lease = await deps.acquireLease();
  if (!lease.acquired) return { status: "already_running" };

  try {
    const runId = deps.runId();
    const byStore = new Map<number, TrackingWorkerPhase1Report>();

    for (const job of jobs) {
      if (!Number.isSafeInteger(job.storeId) || job.storeId <= 0) continue;
      const report = byStore.get(job.storeId) ?? {
        dryRun: true,
        provider: "711",
        runId,
        totalJobs: 0,
        changedCount: 0,
        unchangedCount: 0,
        failedCount: 0,
        retryAfterMs: null,
      };
      byStore.set(job.storeId, report);
      report.totalJobs += 1;

      const trackingCode = job.trackingCode.trim();
      if (!trackingCode) {
        report.failedCount += 1;
        report.retryAfterMs = trackingRetryDelayMs(job.failureCount + 1);
        continue;
      }

      const result = await deps.querySevenEleven(trackingCode);
      if (!result.ok) {
        report.failedCount += 1;
        report.retryAfterMs = Math.max(
          report.retryAfterMs ?? 0,
          trackingRetryDelayMs(job.failureCount + 1),
        );
        continue;
      }

      if (result.latestStatus.trim() === (job.currentStatusText ?? "").trim()) {
        report.unchangedCount += 1;
      } else {
        report.changedCount += 1;
      }
    }

    const reports = [...byStore.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, report]) => report);
    for (const report of reports) {
      await deps.recordReport({
        storeId: jobs.find(
          (job) => job.storeId > 0 && byStore.get(job.storeId) === report,
        )!.storeId,
        actor: "tracking-worker",
        action: TRACKING_DRY_RUN_AUDIT_ACTION,
        target: reportTarget(report),
      });
    }
    return { status: "completed", reports };
  } finally {
    await lease.release();
  }
}
