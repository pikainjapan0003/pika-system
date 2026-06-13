/**
 * ManualTrackingSyncPanel（Step 7N-J5F-7B）
 *
 * postoffice / tcat 手動貨態同步 panel。
 * J5F-6：加入確認寫入 modal skeleton（AlertDialog）。
 *         確認按鈕本輪 disabled，不串寫入 API，純 UI skeleton。
 * J5F-7A：新增 CommitRequestBody / CommitSuccessResponse / CommitDriftedResponse /
 *          CommitErrorResponse 型別；擴充 SyncPhase commit states；
 *          新增 buildCommitBody / getCommitErrorMessage helpers（pure，不呼叫 API）。
 * J5F-7B：新增 COMMIT_ENABLED guard（hardcoded false）；新增 handleCommit guarded handler。
 * J5F-7C：移除 AlertDialogAction disabled；點擊後 COMMIT_ENABLED=false guard early return，不送 /commit。
 * J5F-7D：補齊 commit result UI states：commitLoading / commitSuccess / commitIdempotentNoop /
 *          commitError（polish）/ drifted（polish）；不改 COMMIT_ENABLED，不送 /commit。
 * J5F-7E：確認 post-commit refresh wiring；新增 refreshOrderAfterCommit helper；
 *          error / drifted / COMMIT_DISABLED 不 refresh；不改 COMMIT_ENABLED，不送 /commit。
 * J5F-8：Safe-preview-only 收尾；更新 footer 文案；COMMIT_ENABLED 維持 false。
 * J5F-7H-B：one-shot production commit gate（單次授權）。COMMIT_ENABLED=true，但僅
 *           ONE_SHOT_COMMIT_TARGET（provider=tcat / orderId=36 / trackingCode 末四碼 4096 /
 *           expectedEventCount=5）可真正送出 /commit；其他訂單一律視為
 *           ONE_SHOT_TARGET_MISMATCH（行為等同 COMMIT_DISABLED）。
 */
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { getProviderDisplayName } from "@/lib/logisticsProviders";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const MANUAL_SYNC_PROVIDERS = ["postoffice", "tcat"] as const;
type ManualSyncProvider = (typeof MANUAL_SYNC_PROVIDERS)[number];

function isManualSyncProvider(p: string | null | undefined): p is ManualSyncProvider {
  return MANUAL_SYNC_PROVIDERS.includes(p as ManualSyncProvider);
}

interface ShipmentTrackingInput {
  id?: number;
  trackingProvider?: string | null;
  trackingCode?: string | null;
  trackingStatus?: string | null;
  latestStatusText?: string | null;
  latestEventAt?: string | null;
  isActive?: boolean | null;
}

export interface ManualTrackingSyncPanelProps {
  storeId: number;
  orderId: number;
  shipmentTracking?: ShipmentTrackingInput | null;
  disabled?: boolean;
  onOrderRefresh?: () => void;
}

interface PreviewJob {
  trackingId: number;
  trackingCode: string;
  provider: string;
  status: string;
  wouldWriteEvents: number;
  duplicateEvents: number;
  latestStatusText: string | null;
  latestEventAt: string | null;
  previewHash: string | null;
  previewExpiresAt: string | null;
  errorCode?: string | null;
  skippedReason?: string | null;
}

// J5F-7A：commit request / response types

interface CommitRequestBody {
  provider: ManualSyncProvider;
  trackingId: number;
  trackingCode: string;
  previewHash: string;
  confirmText: "WRITE_TRACKING_EVENTS";
  expectedEventCount: number;
  expectedLatestStatusText: string | null;
  expectedLatestEventAt: string | null;
}

interface CommitSuccessResponse {
  ok: true;
  committed: boolean;
  insertedEventCount: number;
  idempotentNoop: boolean;
  provider: string;
  trackingId: number;
  trackingCode?: string;
  latestStatusText?: string | null;
  latestEventAt?: string | null;
}

interface CommitDriftedResponse {
  ok: false;
  code: "PREVIEW_DRIFTED";
  message?: string;
  freshPreview?: {
    expectedEventCount: number;
    latestStatusText: string | null;
    latestEventAt: string | null;
  };
}

interface CommitErrorResponse {
  ok?: false;
  errorCode?: string;
  code?: string;
  message?: string;
  error?: string;
}

type SyncPhase =
  | { phase: "idle" }
  | { phase: "previewLoading" }
  | { phase: "previewReadyCanCommit"; job: PreviewJob }
  | { phase: "previewReadyNoNewEvents"; job: PreviewJob }
  | { phase: "previewReadyDuplicateOnly"; job: PreviewJob }
  | { phase: "previewExpired"; job: PreviewJob }
  | { phase: "previewError"; errorCode: string; message: string }
  // J5F-7A：commit states（handlers wired in J5F-7B）
  | { phase: "commitLoading"; job: PreviewJob }
  | { phase: "commitSuccess"; insertedEventCount: number; latestStatusText?: string | null; latestEventAt?: string | null }
  | { phase: "commitIdempotentNoop"; latestStatusText?: string | null; latestEventAt?: string | null }
  | { phase: "commitError"; errorCode: string; message: string }
  | { phase: "drifted"; message: string };

// J5F-7B：commit feature gate.
// J5F-7H-B：ONE-SHOT PRODUCTION GATE — COMMIT_ENABLED=true is gated further by
// isOneShotCommitOrder() + the expectedEventCount check in handleCommit, so only the single
// explicitly-authorized order (ONE_SHOT_COMMIT_TARGET below) can actually send /commit.
// Every other order falls through to ONE_SHOT_TARGET_MISMATCH, which behaves like
// COMMIT_DISABLED — no /commit request is sent.
const COMMIT_ENABLED: boolean = true;

// J5F-7H-B：single authorized production commit target.
// Authorization: storeId=2, provider=tcat, orderId=36, trackingCode last4=4096, wouldWriteEvents=5.
const ONE_SHOT_COMMIT_TARGET = {
  provider: "tcat",
  orderId: 36,
  trackingCodeLast4: "4096",
  expectedEventCount: 5,
} as const;

// J5F-7H-B：true only for the single authorized order/provider/trackingCode combination.
// Event count is re-checked separately in handleCommit against the live preview job.
function isOneShotCommitOrder(orderId: number, provider: string, trackingCode: string): boolean {
  return (
    orderId === ONE_SHOT_COMMIT_TARGET.orderId &&
    provider === ONE_SHOT_COMMIT_TARGET.provider &&
    trackingCode.slice(-4) === ONE_SHOT_COMMIT_TARGET.trackingCodeLast4
  );
}

const TRACKING_STATUS_LABELS: Record<string, string> = {
  pending: "待查詢",
  checking: "查詢中",
  active: "運送中",
  delivered: "已完成",
  failed: "查詢失敗",
  inactive: "已停用",
};

function maskTrackingCode(code: string): string {
  if (code.length <= 4) return code;
  return `****${code.slice(-4)}`;
}

function getPreviewRemainingSeconds(previewExpiresAt: string | null | undefined): number | null {
  if (!previewExpiresAt) return null;
  const expiry = new Date(previewExpiresAt).getTime();
  if (isNaN(expiry)) return null;
  const remaining = Math.floor((expiry - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

function getPreviewErrorMessage(errorCode?: string | null, fallback?: string | null): string {
  switch (errorCode) {
    case "PREVIEW_EXPIRED":      return "預覽已過期，請重新查詢。";
    case "PREVIEW_HASH_INVALID": return "預覽驗證失敗，請重新查詢。";
    case "PREVIEW_DRIFTED":      return "外部貨態已變動，請重新查詢後再確認。";
    case "PROVIDER_NOT_ALLOWED": return "此物流目前不支援手動查詢。";
    case "INVALID_PROVIDER":     return "此物流目前不支援手動查詢。";
    case "TRACKING_NOT_FOUND":   return "找不到此物流資料。";
    case "WRITE_FAILED":         return "貨態查詢失敗，請稍後再試。";
    case "NETWORK_ERROR":        return "網路錯誤，查詢未完成。";
    default:                     return fallback || "查詢失敗，請稍後再試。";
  }
}

// J5F-7A：commit body builder（pure，不呼叫 API，handlers wired in J5F-7B）
function buildCommitBody(job: PreviewJob): CommitRequestBody {
  const provider = job.provider;
  if (!isManualSyncProvider(provider)) {
    throw new Error(`buildCommitBody: invalid provider "${provider}"`);
  }
  const hash = job.previewHash;
  if (!hash) {
    throw new Error("buildCommitBody: previewHash is missing");
  }
  if (job.wouldWriteEvents <= 0) {
    throw new Error("buildCommitBody: wouldWriteEvents must be > 0");
  }
  return {
    provider,
    trackingId: job.trackingId,
    trackingCode: job.trackingCode,
    previewHash: hash,
    confirmText: "WRITE_TRACKING_EVENTS",
    expectedEventCount: job.wouldWriteEvents,
    expectedLatestStatusText: job.latestStatusText ?? null,
    expectedLatestEventAt: job.latestEventAt ?? null,
  };
}

// J5F-7A：commit error message helper
function getCommitErrorMessage(errorCode?: string | null, httpStatus?: number): string {
  if (httpStatus === 401) return "登入狀態已失效，請重新登入。";
  if (httpStatus === 403) return "沒有權限寫入此訂單。";
  if (httpStatus === 404) return "找不到此物流資料。";
  switch (errorCode) {
    case "PREVIEW_EXPIRED":                   return "預覽已過期，請重新查詢。";
    case "PREVIEW_HASH_INVALID":              return "預覽驗證失敗，請重新查詢。";
    case "PREVIEW_DRIFTED":                   return "外部貨態已變動，請重新查詢後再確認。";
    case "INVALID_PROVIDER":                  return "此物流目前不支援手動寫入。";
    case "TRACKING_NOT_FOUND":                return "找不到此物流資料。";
    case "TRACKING_INACTIVE":                 return "此物流資料已停用，請重新確認。";
    case "TRACKING_CODE_MISMATCH":            return "追蹤單號不符，請重新查詢。";
    case "EXPECTED_EVENT_COUNT_MISMATCH":     return "事件數量與預覽不符，請重新查詢。";
    case "EXPECTED_LATEST_STATUS_MISMATCH":   return "貨態與預覽不符，請重新查詢。";
    case "EXPECTED_LATEST_EVENT_AT_MISMATCH": return "事件時間與預覽不符，請重新查詢。";
    case "WRITE_FAILED":                      return "寫入貨態失敗，請稍後再試。";
    case "CONFIRM_TEXT_REQUIRED":             return "系統確認參數缺失，請重新查詢。";
    case "CONFIRM_TEXT_INVALID":              return "系統確認參數錯誤，請重新查詢。";
    case "COMMIT_DISABLED":                   return "寫入功能尚未啟用。";
    case "ONE_SHOT_TARGET_MISMATCH":          return "此操作僅限本次授權的單筆訂單，目前不可寫入。";
    case "NETWORK_ERROR":                     return "網路錯誤，寫入未完成。";
    default:                                  return "寫入失敗，請稍後再試。";
  }
}

export function ManualTrackingSyncPanel({
  storeId,
  orderId,
  shipmentTracking,
  disabled = false,
  onOrderRefresh,
}: ManualTrackingSyncPanelProps) {
  const { getToken } = useAuth();
  const [syncState, setSyncState] = useState<SyncPhase>({ phase: "idle" });
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // countdown + TTL auto-transition to previewExpired
  useEffect(() => {
    if (
      syncState.phase !== "previewReadyCanCommit" &&
      syncState.phase !== "previewReadyNoNewEvents" &&
      syncState.phase !== "previewReadyDuplicateOnly"
    ) {
      setRemainingSeconds(null);
      return;
    }

    const job = syncState.job;

    const tick = () => {
      const secs = getPreviewRemainingSeconds(job.previewExpiresAt);
      setRemainingSeconds(secs);
      if (secs === 0) {
        setModalOpen(false);
        setSyncState({ phase: "previewExpired", job });
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [syncState]);

  const provider = shipmentTracking?.trackingProvider ?? null;
  const trackingCode = (shipmentTracking?.trackingCode ?? "").trim();
  const isActive = shipmentTracking?.isActive !== false;
  const trackingId = shipmentTracking?.id;

  if (!isManualSyncProvider(provider) || !trackingCode || !isActive || !trackingId) {
    return null;
  }

  const providerLabel = getProviderDisplayName(provider) ?? provider;
  const statusLabel =
    TRACKING_STATUS_LABELS[shipmentTracking?.trackingStatus ?? ""] ?? "待查詢";

  // J5F-7H-B：true only for the single explicitly-authorized order (see ONE_SHOT_COMMIT_TARGET).
  const isOneShotOrder = isOneShotCommitOrder(orderId, provider, trackingCode);

  const handlePreview = async () => {
    if (syncState.phase === "previewLoading" || disabled) return;
    setSyncState({ phase: "previewLoading" });
    setModalOpen(false);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/stores/${storeId}/logistics/sync/manual-provider/preview`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ provider, trackingIds: [trackingId] }),
        },
      );
      const body: {
        ok?: boolean;
        errorCode?: string;
        message?: string;
        jobs?: PreviewJob[];
      } = await res.json().catch(() => ({}));

      if (!res.ok || !body.ok) {
        setSyncState({
          phase: "previewError",
          errorCode: body.errorCode ?? String(res.status),
          message: getPreviewErrorMessage(body.errorCode, body.message),
        });
        return;
      }

      const job = body.jobs?.[0];
      if (!job || job.status === "failed" || job.errorCode) {
        setSyncState({
          phase: "previewError",
          errorCode: job?.errorCode ?? "PREVIEW_JOB_FAILED",
          message: getPreviewErrorMessage(job?.errorCode, job?.skippedReason),
        });
        return;
      }

      const netNewEvents = (job.wouldWriteEvents ?? 0) - (job.duplicateEvents ?? 0);
      if (netNewEvents > 0) {
        setSyncState({ phase: "previewReadyCanCommit", job });
      } else if ((job.wouldWriteEvents ?? 0) === 0) {
        setSyncState({ phase: "previewReadyNoNewEvents", job });
      } else {
        setSyncState({ phase: "previewReadyDuplicateOnly", job });
      }
    } catch {
      setSyncState({
        phase: "previewError",
        errorCode: "NETWORK_ERROR",
        message: getPreviewErrorMessage("NETWORK_ERROR"),
      });
    }
  };

  // J5F-7E：post-commit refresh — only commitSuccess / commitIdempotentNoop refresh the order list.
  // error / drifted / COMMIT_DISABLED / ONE_SHOT_TARGET_MISMATCH intentionally do NOT refresh
  // (nothing was written).
  const refreshOrderAfterCommit = () => { onOrderRefresh?.(); };

  // J5F-7C/7E/7H-B：commit handler — COMMIT_ENABLED=true だが ONE_SHOT_COMMIT_TARGET 以外は
  // 第二層 gate（ONE_SHOT_TARGET_MISMATCH）で early return し /commit は送出されない。
  // refresh は commitSuccess / commitIdempotentNoop のみ（refreshOrderAfterCommit 経由）。
  const handleCommit = async () => {
    // Gate: COMMIT_ENABLED must be true before any /commit request is sent.
    // COMMIT_DISABLED does NOT refresh — nothing was written.
    if (!COMMIT_ENABLED) {
      setModalOpen(false);
      setSyncState({
        phase: "commitError",
        errorCode: "COMMIT_DISABLED",
        message: "寫入功能尚未啟用。",
      });
      return;
    }

    // Below runs only when COMMIT_ENABLED = true（J5F-7H-B：one-shot production gate）
    if (syncState.phase !== "previewReadyCanCommit") return;
    const commitJob = syncState.job;

    // J5F-7H-B：second-layer gate — only ONE_SHOT_COMMIT_TARGET may proceed past this point.
    // Any other order/provider/trackingCode/event-count combination behaves like COMMIT_DISABLED.
    if (
      !isOneShotCommitOrder(orderId, provider, trackingCode) ||
      commitJob.wouldWriteEvents !== ONE_SHOT_COMMIT_TARGET.expectedEventCount
    ) {
      setModalOpen(false);
      setSyncState({
        phase: "commitError",
        errorCode: "ONE_SHOT_TARGET_MISMATCH",
        message: getCommitErrorMessage("ONE_SHOT_TARGET_MISMATCH"),
      });
      return;
    }

    setSyncState({ phase: "commitLoading", job: commitJob });
    setModalOpen(false);

    try {
      const body = buildCommitBody(commitJob);
      const token = await getToken();
      const res = await fetch(
        `/api/stores/${storeId}/logistics/sync/manual-provider/commit`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        },
      );

      // Read body once — 409 PREVIEW_DRIFTED uses body.code (NOT body.errorCode)
      const raw = await res.json().catch(() => ({})) as {
        ok?: boolean;
        code?: string;
        errorCode?: string;
        message?: string;
        insertedEventCount?: number;
        idempotentNoop?: boolean;
        latestStatusText?: string | null;
        latestEventAt?: string | null;
      };

      // 409 PREVIEW_DRIFTED：必須讀 body.code，不可讀 body.errorCode。no refresh — nothing was written.
      if (res.status === 409 && raw.code === "PREVIEW_DRIFTED") {
        setSyncState({ phase: "drifted", message: getCommitErrorMessage("PREVIEW_DRIFTED") });
        return;
      }

      // no refresh — write failed or non-ok response, nothing was written.
      if (!res.ok || !raw.ok) {
        setSyncState({
          phase: "commitError",
          errorCode: raw.errorCode ?? raw.code ?? String(res.status),
          message: getCommitErrorMessage(raw.errorCode ?? raw.code, res.status),
        });
        return;
      }

      if (raw.idempotentNoop) {
        setSyncState({
          phase: "commitIdempotentNoop",
          latestStatusText: raw.latestStatusText,
          latestEventAt: raw.latestEventAt,
        });
        refreshOrderAfterCommit(); // events already existed — refresh to reflect latest state
        return;
      }

      setSyncState({
        phase: "commitSuccess",
        insertedEventCount: raw.insertedEventCount ?? 0,
        latestStatusText: raw.latestStatusText,
        latestEventAt: raw.latestEventAt,
      });
      refreshOrderAfterCommit(); // new events written — refresh order list
    } catch {
      // no refresh — network error, write may not have completed
      setSyncState({
        phase: "commitError",
        errorCode: "NETWORK_ERROR",
        message: getCommitErrorMessage("NETWORK_ERROR"),
      });
    }
  };

  const isLoading = syncState.phase === "previewLoading" || syncState.phase === "commitLoading";
  const canShowModal = syncState.phase === "previewReadyCanCommit";
  const modalJob = canShowModal ? syncState.job : null;

  return (
    <>
      <div className="space-y-2 pt-1 border-t border-border">
        {/* 物流商 + 單號摘要 */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{providerLabel}</span>
          <span>{maskTrackingCode(trackingCode)}</span>
          <span className="text-foreground/60">{statusLabel}</span>
        </div>

        {/* idle：顯示現有 DB 貨態 */}
        {syncState.phase === "idle" && shipmentTracking?.latestStatusText && (
          <p className="text-xs text-foreground">
            最新貨態：{shipmentTracking.latestStatusText}
            {shipmentTracking.latestEventAt && (
              <span className="text-muted-foreground ml-1">
                （{shipmentTracking.latestEventAt}）
              </span>
            )}
          </p>
        )}

        {/* previewReady (含 expired)：結果卡片 */}
        {((): React.ReactNode => {
          if (
            syncState.phase !== "previewReadyCanCommit" &&
            syncState.phase !== "previewReadyNoNewEvents" &&
            syncState.phase !== "previewReadyDuplicateOnly" &&
            syncState.phase !== "previewExpired"
          ) {
            return null;
          }
          const job = syncState.job;
          const netNew = (job.wouldWriteEvents ?? 0) - (job.duplicateEvents ?? 0);
          const isExpired = syncState.phase === "previewExpired";

          return (
            <div
              className={`text-xs rounded-xl px-3 py-2 space-y-1 ${
                isExpired
                  ? "bg-amber-50 border border-amber-200"
                  : "bg-secondary"
              }`}
            >
              <p className="font-medium text-foreground">
                預覽結果（未寫入）
                <span className="ml-2 text-muted-foreground">
                  {job.previewHash ? "• hash-present" : "• hash-null"}
                </span>
              </p>

              <div className="space-y-0.5 text-muted-foreground">
                <p>外部查到事件：{job.wouldWriteEvents} 筆</p>
                <p>已存在於 DB：{job.duplicateEvents} 筆</p>
                <p className={netNew > 0 ? "text-foreground font-medium" : ""}>
                  可新寫入：{netNew} 筆
                </p>
                {job.latestStatusText && (
                  <p>
                    最新貨態：{job.latestStatusText}
                    {job.latestEventAt ? `（${job.latestEventAt}）` : ""}
                  </p>
                )}
                {!isExpired && remainingSeconds !== null && (
                  <p className={remainingSeconds <= 30 ? "text-amber-600" : ""}>
                    {remainingSeconds > 0
                      ? `預覽有效剩餘：${remainingSeconds} 秒`
                      : "預覽已過期，請重新查詢。"}
                  </p>
                )}
                {job.skippedReason && (
                  <p className="text-amber-600">略過原因：{job.skippedReason}</p>
                )}
              </div>

              {syncState.phase === "previewReadyCanCommit" && (
                <div className="space-y-1.5 pt-0.5">
                  <p className="text-foreground font-medium text-[11px]">
                    目前有 {netNew} 筆新貨態事件可寫入。
                  </p>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="w-full h-8 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-medium"
                  >
                    {isOneShotOrder ? "寫入事件" : "寫入事件（尚未啟用）"}
                  </button>
                </div>
              )}
              {syncState.phase === "previewReadyNoNewEvents" && (
                <p className="text-foreground/60 text-[11px]">目前沒有新貨態事件。</p>
              )}
              {syncState.phase === "previewReadyDuplicateOnly" && (
                <p className="text-foreground/60 text-[11px]">
                  查到的事件皆已存在，不需要重複寫入。
                </p>
              )}
              {isExpired && (
                <p className="text-amber-700 font-medium text-[11px]">
                  預覽已過期，請重新查詢。
                </p>
              )}
            </div>
          );
        })()}

        {/* previewError */}
        {syncState.phase === "previewError" && (
          <p className="text-xs text-destructive bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {syncState.message}（{syncState.errorCode}）
          </p>
        )}

        {/* commitLoading */}
        {syncState.phase === "commitLoading" && (
          <div className="text-xs text-muted-foreground bg-secondary rounded-xl px-3 py-2">
            寫入中，請稍候…
          </div>
        )}

        {/* commitSuccess */}
        {syncState.phase === "commitSuccess" && (
          <div className="text-xs bg-green-50 border border-green-200 rounded-xl px-3 py-2 space-y-1">
            <p className="text-green-800 font-medium">
              已寫入 {syncState.insertedEventCount} 筆貨態事件。
            </p>
            {syncState.latestStatusText && (
              <p className="text-green-700">最新貨態：{syncState.latestStatusText}</p>
            )}
            {syncState.latestEventAt && (
              <p className="text-green-700">最新時間：{syncState.latestEventAt}</p>
            )}
          </div>
        )}

        {/* commitIdempotentNoop */}
        {syncState.phase === "commitIdempotentNoop" && (
          <div className="text-xs bg-secondary border border-border rounded-xl px-3 py-2 space-y-1">
            <p className="text-foreground font-medium">查到的事件已存在，不需要重複寫入。</p>
            {syncState.latestStatusText && (
              <p className="text-muted-foreground">最新貨態：{syncState.latestStatusText}</p>
            )}
            {syncState.latestEventAt && (
              <p className="text-muted-foreground">最新時間：{syncState.latestEventAt}</p>
            )}
          </div>
        )}

        {/* commitError */}
        {syncState.phase === "commitError" && (
          <div className="text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2 space-y-1">
            <p className="text-destructive font-medium">寫入未完成</p>
            <p className="text-destructive">{syncState.message}</p>
            <p className="text-destructive/70">錯誤代碼：{syncState.errorCode}</p>
          </div>
        )}

        {/* drifted */}
        {syncState.phase === "drifted" && (
          <div className="text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 space-y-1">
            <p className="text-amber-700 font-medium">{syncState.message}</p>
            <p className="text-amber-600">請重新按「查詢最新貨態」取得新的預覽結果。</p>
          </div>
        )}

        {/* 查詢 / 重新查詢 按鈕 */}
        <button
          type="button"
          disabled={isLoading || disabled}
          onClick={() => void handlePreview()}
          className="w-full h-9 rounded-xl border border-primary/40 text-primary text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncState.phase === "previewLoading"
            ? "查詢中…"
            : syncState.phase === "commitLoading"
            ? "寫入中…"
            : syncState.phase === "idle"
            ? "查詢最新貨態"
            : "重新查詢"}
        </button>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {isOneShotOrder
            ? "本訂單為單次授權寫入對象：「確認寫入」將會寫入正式貨態事件，且僅限本訂單。"
            : "目前為安全預覽模式：可查詢與預覽，不會寫入正式貨態事件。正式自動同步仍只有全家。"}
        </p>
      </div>

      {/* 確認寫入 modal — J5F-7H-B one-shot gate：僅 ONE_SHOT_COMMIT_TARGET 符合時才會真正送出 /commit */}
      <AlertDialog
        open={modalOpen && canShowModal}
        onOpenChange={(open) => { if (!open) setModalOpen(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認寫入貨態事件</AlertDialogTitle>
            <AlertDialogDescription>
              {isOneShotOrder
                ? "將寫入正式貨態事件，寫入後不可直接復原。請確認以上資訊正確後再按「確認寫入」。"
                : "將寫入正式貨態事件，寫入後不可直接復原。此步驟目前尚未接入正式寫入 API。"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {modalJob && (
            <div className="text-xs space-y-1.5 py-1">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">物流商：</span>
                <span>{providerLabel}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">追蹤單號：</span>
                <span>{maskTrackingCode(trackingCode)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">可新寫入：</span>
                <span className="font-medium">
                  {(modalJob.wouldWriteEvents ?? 0) - (modalJob.duplicateEvents ?? 0)} 筆
                </span>
              </div>
              {modalJob.latestStatusText && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">最新貨態：</span>
                  <span>{modalJob.latestStatusText}</span>
                </div>
              )}
              {modalJob.latestEventAt && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">最新時間：</span>
                  <span>{modalJob.latestEventAt}</span>
                </div>
              )}
              {remainingSeconds !== null && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">預覽剩餘：</span>
                  <span className={remainingSeconds <= 30 ? "text-amber-600" : ""}>
                    {remainingSeconds > 0 ? `${remainingSeconds} 秒` : "已過期"}
                  </span>
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleCommit()}>
              {isOneShotOrder ? "確認寫入" : "確認寫入（尚未啟用）"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
