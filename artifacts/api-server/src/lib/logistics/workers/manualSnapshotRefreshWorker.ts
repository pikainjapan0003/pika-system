/**
 * Manual Provider Snapshot Refresh Worker（Step 7S）
 *
 * 掃描 postoffice / tcat trackings（已填物流號碼、超過查詢間隔），
 * 呼叫各 adapter 查詢最新貨態，只更新快照欄位。
 *
 * 安全邊界：
 * - 不寫 shipment_tracking_events
 * - 不改 trackingStatus / supportsAutoSync
 * - 不開排程
 * - provider 白名單僅 postoffice / tcat
 */

import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, shipmentTrackingsTable } from "@workspace/db";
import { queryPostOfficeTracking } from "../adapters/postOfficeAdapter.ts";
import { queryTcatTracking } from "../adapters/tcatAdapter.ts";

type RefreshProvider = "postoffice" | "tcat";
const ALLOWED_PROVIDERS: RefreshProvider[] = ["postoffice", "tcat"];
const DEFAULT_LIMIT = 30;
const RECHECK_INTERVAL_MS = 55 * 60 * 1000;

export interface ManualSnapshotRefreshResult {
  scannedCount: number;
  refreshedCount: number;
  skippedCount: number;
  failedCount: number;
  results: Array<{
    trackingId: number;
    trackingCode: string;
    provider: string;
    status: "refreshed" | "skipped" | "failed" | "empty";
    latestStatusText?: string | null;
    errorCode?: string;
  }>;
}

function parseTrackingTs(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw
    .trim()
    .match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const d = new Date(
    `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+08:00`,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

async function saveSnapshot(
  trackingId: number,
  latestStatusText: string,
  latestEventAtStr: string | null,
  normalizedStatus: string | null,
): Promise<void> {
  const parsedAt = parseTrackingTs(latestEventAtStr);
  await db
    .update(shipmentTrackingsTable)
    .set({
      latestEventDescription: latestStatusText,
      ...(parsedAt !== null ? { latestEventAt: parsedAt } : {}),
      ...(normalizedStatus ? { latestEventStatus: normalizedStatus } : {}),
      lastCheckedAt: new Date(),
    })
    .where(eq(shipmentTrackingsTable.id, trackingId));
}

export async function runManualSnapshotRefresh(
  input: {
    providers?: RefreshProvider[];
    limit?: number;
  } = {},
): Promise<ManualSnapshotRefreshResult> {
  const providers = input.providers ?? ALLOWED_PROVIDERS;
  const limit = input.limit ?? DEFAULT_LIMIT;
  const cutoff = new Date(Date.now() - RECHECK_INTERVAL_MS);

  const rows = await db
    .select({
      id: shipmentTrackingsTable.id,
      trackingCode: shipmentTrackingsTable.trackingCode,
      trackingProvider: shipmentTrackingsTable.trackingProvider,
    })
    .from(shipmentTrackingsTable)
    .where(
      and(
        inArray(shipmentTrackingsTable.trackingProvider, providers),
        sql`${shipmentTrackingsTable.trackingCode} != ''`,
        eq(shipmentTrackingsTable.isActive, true),
        or(
          isNull(shipmentTrackingsTable.lastCheckedAt),
          lt(shipmentTrackingsTable.lastCheckedAt, cutoff),
        )!,
      ),
    )
    .limit(limit);

  const results: ManualSnapshotRefreshResult["results"] = [];

  for (const row of rows) {
    const provider = row.trackingProvider as RefreshProvider;
    const trackingCode = row.trackingCode.trim();

    if (!trackingCode || !ALLOWED_PROVIDERS.includes(provider)) {
      results.push({
        trackingId: row.id,
        trackingCode,
        provider,
        status: "skipped",
      });
      continue;
    }

    try {
      const adapterResult =
        provider === "postoffice"
          ? await queryPostOfficeTracking({ trackingCode })
          : await queryTcatTracking({ trackingCode });

      if (!adapterResult.ok) {
        await db
          .update(shipmentTrackingsTable)
          .set({ lastCheckedAt: new Date() })
          .where(eq(shipmentTrackingsTable.id, row.id));
        results.push({
          trackingId: row.id,
          trackingCode,
          provider,
          status: "empty",
          errorCode: adapterResult.errorCode,
        });
        continue;
      }

      await saveSnapshot(
        row.id,
        adapterResult.latestStatusText,
        adapterResult.latestEventAt ?? null,
        adapterResult.normalizedStatus ?? null,
      );
      results.push({
        trackingId: row.id,
        trackingCode,
        provider,
        status: "refreshed",
        latestStatusText: adapterResult.latestStatusText,
      });
    } catch (err) {
      console.error(
        `[manual-snapshot-refresh] trackingId=${row.id} error:`,
        err,
      );
      results.push({
        trackingId: row.id,
        trackingCode,
        provider,
        status: "failed",
        errorCode: "ADAPTER_ERROR",
      });
    }
  }

  return {
    scannedCount: rows.length,
    refreshedCount: results.filter((r) => r.status === "refreshed").length,
    skippedCount: results.filter(
      (r) => r.status === "skipped" || r.status === "empty",
    ).length,
    failedCount: results.filter((r) => r.status === "failed").length,
    results,
  };
}
