import { createHash, randomUUID } from "node:crypto";

import { auditLogsTable, db, pool } from "@workspace/db";

import { queryPostOfficeTracking } from "../adapters/postOfficeAdapter.ts";
import { queryTcatTracking } from "../adapters/tcatAdapter.ts";
import type {
  TrackingAdapterResult,
  TrackingEvent,
} from "../adapters/types.ts";
import {
  isPreviewTokenAvailable,
  signPreviewToken,
  verifyPreviewToken,
} from "../previewToken.ts";
import { buildDryRunIdempotencyKey } from "./multiProviderDryRunWorker.ts";
import {
  parsePostOfficeEventDate,
  parseTcatEventDate,
} from "./multiProviderControlledWriteWorker.ts";
import { commitTrackingWorkerPhase2Preview } from "./trackingWorkerPhase2Commit.ts";
import {
  runTrackingWorkerPhase2,
  type TrackingWorkerPhase2Deps,
  type TrackingWorkerPhase2Job,
  type TrackingWorkerPhase2Preview,
  type TrackingWorkerPhase2Result,
  type TrackingWorkerPhase2WritePayload,
} from "./trackingWorkerPhase2.ts";

type Phase2Adapter = (input: {
  trackingCode: string;
  timeoutMs?: number;
}) => Promise<TrackingAdapterResult<string>>;

const DEFAULT_ADAPTERS: Record<
  TrackingWorkerPhase2Job["provider"],
  Phase2Adapter
> = {
  postoffice: queryPostOfficeTracking,
  tcat: queryTcatTracking,
};

const DATE_PARSERS = {
  postoffice: parsePostOfficeEventDate,
  tcat: parseTcatEventDate,
} as const;

function buildWritePayload(
  job: TrackingWorkerPhase2Job,
  result: Extract<TrackingAdapterResult<string>, { ok: true }>,
): TrackingWorkerPhase2WritePayload {
  const parseDate = DATE_PARSERS[job.provider];
  const events = result.events.flatMap((event: TrackingEvent) => {
    const occurredAt = parseDate(event.occurredAt);
    if (!occurredAt) return [];
    return [
      {
        eventStatus: event.eventStatus,
        eventDescription: event.eventDescription,
        eventLocation: event.eventLocation,
        occurredAt: occurredAt.toISOString(),
        rawData: event.rawData,
        idempotencyKey: buildDryRunIdempotencyKey(
          job.provider,
          job.trackingCode,
          event,
        ),
      },
    ];
  });
  const latestEventDate = parseDate(result.latestEventAt);
  return {
    normalizedStatus: result.normalizedStatus,
    latestStatusText: result.latestStatusText,
    latestEventAt: latestEventDate?.toISOString() ?? null,
    events,
  };
}

function payloadDigest(payload: TrackingWorkerPhase2WritePayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export interface TrackingWorkerPhase2RuntimeOptions {
  adapters?: Partial<
    Record<TrackingWorkerPhase2Job["provider"], Phase2Adapter>
  >;
  commit?: TrackingWorkerPhase2Deps["commit"];
  recordAudit?: TrackingWorkerPhase2Deps["recordAudit"];
  runId?: () => string;
}

export function createTrackingWorkerPhase2RuntimeDeps(
  options: TrackingWorkerPhase2RuntimeOptions = {},
): TrackingWorkerPhase2Deps {
  const adapters = { ...DEFAULT_ADAPTERS, ...options.adapters };
  const preview = async (
    job: TrackingWorkerPhase2Job,
  ): Promise<TrackingWorkerPhase2Preview> => {
    const result = await adapters[job.provider]({
      trackingCode: job.trackingCode,
    });
    if (!result.ok) throw new Error(result.errorCode || "PREVIEW_FAILED");
    if (!isPreviewTokenAvailable()) throw new Error("PREVIEW_HASH_UNAVAILABLE");

    const payload = buildWritePayload(job, result);
    const digest = payloadDigest(payload);
    const signed = signPreviewToken({
      storeId: job.storeId,
      orderId: job.orderId,
      trackingId: job.trackingId,
      provider: job.provider,
      trackingCode: job.trackingCode,
      latestStatusText: payload.latestStatusText,
      latestEventAt: payload.latestEventAt,
      expectedEventCount: payload.events.length,
      normalizedStatus: payload.normalizedStatus,
      payloadDigest: digest,
    });
    return {
      previewHash: signed.token,
      expectedEventCount: payload.events.length,
      latestStatusText: payload.latestStatusText,
      latestEventAt: payload.latestEventAt,
      normalizedStatus: payload.normalizedStatus,
      payloadDigest: digest,
      payload,
    };
  };

  return {
    preview,
    verifyPreviewHash: async (job, previewResult) => {
      const verified = verifyPreviewToken(previewResult.previewHash);
      if (!verified.ok) return false;
      const payload = verified.payload;
      return (
        payload.storeId === job.storeId &&
        payload.orderId === job.orderId &&
        payload.trackingId === job.trackingId &&
        payload.provider === job.provider &&
        payload.trackingCode === job.trackingCode &&
        payload.expectedEventCount === previewResult.expectedEventCount &&
        payload.latestStatusText === previewResult.latestStatusText &&
        payload.latestEventAt === previewResult.latestEventAt &&
        payload.normalizedStatus === previewResult.normalizedStatus &&
        payload.payloadDigest === previewResult.payloadDigest &&
        payloadDigest(previewResult.payload) === previewResult.payloadDigest
      );
    },
    commit: options.commit ?? commitTrackingWorkerPhase2Preview,
    recordAudit:
      options.recordAudit ??
      (async (input) => {
        await db.insert(auditLogsTable).values(input);
      }),
    runId: options.runId ?? randomUUID,
  };
}

export class TrackingWorkerPhase2LeaseUnavailableError extends Error {
  constructor() {
    super("TRACKING_WORKER_PHASE2_LEASE_UNAVAILABLE");
    this.name = "TrackingWorkerPhase2LeaseUnavailableError";
  }
}

const PHASE2_LEASE_KEY = 221102;

export async function withTrackingWorkerPhase2Lease<T>(
  work: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let acquired = false;
  try {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [PHASE2_LEASE_KEY],
    );
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) throw new TrackingWorkerPhase2LeaseUnavailableError();
    return await work();
  } finally {
    if (acquired) {
      await client.query("SELECT pg_advisory_unlock($1)", [PHASE2_LEASE_KEY]);
    }
    client.release();
  }
}

/**
 * Not scheduled and never changes env configuration. The exact-string write
 * gate is checked inside the lease and remains closed unless explicitly true.
 */
export function runTrackingWorkerPhase2WithExistingChain(
  jobs: TrackingWorkerPhase2Job[],
  writeEnabledValue: string | undefined = process.env
    .TRACKING_WORKER_WRITE_ENABLED,
): Promise<TrackingWorkerPhase2Result> {
  return withTrackingWorkerPhase2Lease(() =>
    runTrackingWorkerPhase2(
      jobs,
      createTrackingWorkerPhase2RuntimeDeps(),
      writeEnabledValue,
    ),
  );
}
