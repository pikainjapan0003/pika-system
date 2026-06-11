/**
 * 物流同步狀態卡（Step 7F）：讀取 GET /stores/:storeId/logistics/sync/status，
 * 顯示自動/手動同步狀態、支援的物流商與最近同步紀錄，並提供整批手動同步按鈕。
 * 自動同步是否啟用由 API 的 autoSyncEnabled 決定；排程設定在平台端，無可靠來源，
 * 故不顯示下次同步時間。
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore } from "@workspace/api-client-react";

interface SyncRun {
  id: number;
  provider: string;
  runType: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  scannedCount: number;
  updatedCount: number;
  exceptionCount: number;
  skippedCount: number;
}

interface SyncStatusResponse {
  ok: boolean;
  autoSyncEnabled: boolean;
  manualSyncEnabled: boolean;
  supportedProviders: string[];
  unsupportedProviders: string[];
  lastRun: SyncRun | null;
  recentRuns: SyncRun[];
  message?: string;
  errorCode?: string;
}

const PROVIDER_LABEL: Record<string, string> = {
  familymart: "全家",
  "711": "7-11",
  tcat: "黑貓",
  postoffice: "郵局",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  success: "成功",
  partial: "部分成功",
  failed: "失敗",
  running: "執行中",
};

const RUN_TYPE_LABEL: Record<string, string> = {
  scheduled_worker: "排程",
  manual_worker: "手動",
  exception_retry: "異常重試",
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-TW", { hour12: false });
}

function providerLabels(codes: string[] | undefined): string {
  if (!codes || codes.length === 0) return "—";
  return codes.map((c) => PROVIDER_LABEL[c] ?? c).join(" / ");
}

export function LogisticsSyncStatusNotice() {
  const { data: store } = useGetMyStore();
  const { getToken } = useAuth();
  const storeId = store?.id;

  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/stores/${storeId}/logistics/sync/status`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError("無法讀取同步狀態，請稍後再試");
        return;
      }
      setStatus(body);
    } catch {
      setLoadError("網路錯誤，無法讀取同步狀態");
    } finally {
      setLoading(false);
    }
  }, [storeId, getToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleManualSync = async () => {
    if (!storeId || syncing) return;
    setSyncing(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/stores/${storeId}/logistics/sync`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setSyncError(
          res.status === 401
            ? "請先登入"
            : res.status === 403
              ? "沒有此店家的權限"
              : `同步失敗（${body.errorCode ?? res.status}），請稍後再試`,
        );
        return;
      }
      setSyncMessage(body.message ?? "同步完成。");
      await fetchStatus();
    } catch {
      setSyncError("網路錯誤，同步未完成");
    } finally {
      setSyncing(false);
    }
  };

  const manualSyncEnabled = status?.manualSyncEnabled === true;
  const autoSyncEnabled = status?.autoSyncEnabled === true;
  const recentRuns = status?.recentRuns ?? [];

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <h2 className="text-sm font-bold text-foreground">物流同步狀態</h2>

      {loading && !status && <p className="text-xs text-muted-foreground">載入同步狀態中…</p>}
      {loadError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
          <span>{loadError}</span>
          <button type="button" onClick={fetchStatus} className="shrink-0 underline">
            重試
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-secondary rounded-xl px-3 py-2">
          <div className="text-muted-foreground">自動同步</div>
          <div className="font-medium text-foreground">
            {status ? (autoSyncEnabled ? "已啟用" : "尚未啟用") : "—"}
          </div>
        </div>
        <div className="bg-secondary rounded-xl px-3 py-2">
          <div className="text-muted-foreground">手動同步</div>
          <div className="font-medium text-foreground">
            {status ? (manualSyncEnabled ? "可用" : "不可用") : "—"}
          </div>
        </div>
        <div className="bg-secondary rounded-xl px-3 py-2">
          <div className="text-muted-foreground">目前支援</div>
          <div className="font-medium text-foreground">
            {status ? providerLabels(status.supportedProviders) : "全家"}
          </div>
        </div>
        <div className="bg-secondary rounded-xl px-3 py-2">
          <div className="text-muted-foreground">尚未支援</div>
          <div className="font-medium text-foreground">
            {status ? providerLabels(status.unsupportedProviders) : "7-11 / 黑貓 / 郵局"}
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        上次同步：
        {status?.lastRun ? (
          <span className="text-foreground">
            {formatTime(status.lastRun.startedAt)}（{PROVIDER_LABEL[status.lastRun.provider] ?? status.lastRun.provider}・
            {RUN_STATUS_LABEL[status.lastRun.status] ?? status.lastRun.status}）
          </span>
        ) : (
          <span>尚無同步紀錄</span>
        )}
      </div>

      {manualSyncEnabled && (
        <button
          type="button"
          disabled={syncing || !storeId}
          onClick={handleManualSync}
          className="w-full h-10 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {syncing ? "同步中…" : "立即同步已支援物流"}
        </button>
      )}
      {syncError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{syncError}</div>
      )}
      {syncMessage && (
        <div className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          {syncMessage}
        </div>
      )}

      <div>
        <div className="text-xs font-medium text-foreground mb-1">最近同步紀錄</div>
        {recentRuns.length === 0 ? (
          <p className="text-xs text-muted-foreground bg-secondary rounded-xl px-3 py-2">
            尚無同步紀錄。匯入物流單號後，可按「立即同步已支援物流」查詢最新貨態。
          </p>
        ) : (
          <ul className="space-y-1">
            {recentRuns.slice(0, 5).map((run) => (
              <li key={run.id} className="text-[11px] text-muted-foreground bg-secondary rounded-xl px-3 py-2">
                <span className="text-foreground font-medium">
                  {formatTime(run.startedAt)}・{PROVIDER_LABEL[run.provider] ?? run.provider}・
                  {RUN_TYPE_LABEL[run.runType] ?? run.runType}・{RUN_STATUS_LABEL[run.status] ?? run.status}
                </span>
                <span className="block">
                  掃描 {run.scannedCount} 筆／成功 {run.updatedCount} 筆／失敗 {run.exceptionCount} 筆／略過{" "}
                  {run.skippedCount} 筆
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/80">
        {autoSyncEnabled
          ? "自動同步已啟用，系統會定期查詢已支援物流商（目前僅支援全家）的貨態；也可隨時手動同步。"
          : "自動同步尚未啟用，目前僅支援全家。匯入 Excel 後系統不會自動查詢貨態，請手動同步，或等待後續排程功能啟用。"}
      </p>
    </div>
  );
}

/** 簡短版提醒：給物流異常頁等次要位置使用。 */
export function LogisticsSyncStatusHint() {
  return (
    <p className="text-[11px] text-muted-foreground bg-secondary rounded-xl px-3 py-2 leading-relaxed">
      目前自動同步尚未啟用，貨態不會自動更新；本頁僅顯示匯入與物流查詢失敗的資料。
    </p>
  );
}
