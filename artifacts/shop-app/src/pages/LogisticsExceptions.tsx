import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore } from "@workspace/api-client-react";
import { BottomNav } from "./Dashboard";
import { LogisticsSyncStatusHint } from "../components/LogisticsSyncStatusNotice";
import { getProviderShortName } from "@/lib/logisticsProviders";

interface TrackingException {
  id: number;
  provider: string;
  sourceType: string;
  trackingCode: string | null;
  orderId: number | null;
  shipmentTrackingId: number | null;
  status: string;
  severity: string;
  errorCode: string;
  message: string | null;
  retryable: boolean;
  failureCount: number;
  lastOccurredAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

// provider label 收斂至 @/lib/logisticsProviders（Step 7H-B）

const SOURCE_LABELS: Record<string, string> = {
  file_import: "Excel 匯入",
  worker: "自動查詢",
  manual: "手動",
  agent: "系統",
};

const STATUS_LABELS: Record<string, string> = {
  open: "待處理",
  reviewing: "處理中",
  resolved: "已處理",
  ignored: "已忽略",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  reviewing: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  ignored: "bg-gray-100 text-gray-500",
};

const SEVERITY_LABELS: Record<string, string> = {
  info: "一般",
  warning: "警告",
  error: "錯誤",
  critical: "嚴重",
};

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-gray-100 text-gray-600",
  warning: "bg-yellow-100 text-yellow-800",
  error: "bg-red-100 text-red-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_FILTERS = [
  { value: "open", label: "待處理" },
  { value: "resolved", label: "已處理" },
  { value: "ignored", label: "已忽略" },
  { value: "all", label: "全部" },
];

const PROVIDER_FILTERS = [
  { value: "all", label: "全部物流商" },
  { value: "familymart", label: "全家" },
  { value: "711", label: "7-11" },
  { value: "tcat", label: "黑貓" },
  { value: "postoffice", label: "郵局" },
];

const SOURCE_FILTERS = [
  { value: "all", label: "全部來源" },
  { value: "import", label: "Excel 匯入" },
  { value: "worker", label: "自動查詢" },
  { value: "manual", label: "手動" },
];

// 英文 reasonCode → 老闆看得懂的繁體中文
const REASON_TEXTS: Record<string, { reason: string; description: string }> = {
  TRACKING_CODE_CONFLICT: {
    reason: "物流貨號重複",
    description: "這個物流貨號已經存在，因此 Excel 匯入時略過此列。",
  },
  NO_RESULT: {
    reason: "查無物流資料",
    description: "物流商目前查不到這個貨號，可能是尚未入倉或貨號有誤。",
  },
  NOT_FOUND: {
    reason: "找不到對應訂單",
    description: "系統找不到可配對的訂單，需要人工確認。",
  },
  AMBIGUOUS_MATCH: {
    reason: "可能對應多筆訂單",
    description: "系統找到多個可能訂單，需要人工選擇正確訂單。",
  },
  PARSER_FAILED: {
    reason: "物流資料解析失敗",
    description: "物流商回傳格式無法解析，可能需要更新解析規則。",
  },
  NETWORK_FAILED: {
    reason: "物流查詢連線失敗",
    description: "查詢物流商時連線失敗，之後可再重試。",
  },
  TIMEOUT: {
    reason: "物流查詢逾時",
    description: "物流商回應太慢，之後可再重試。",
  },
  UNKNOWN_ERROR: {
    reason: "未知物流異常",
    description: "系統遇到未分類的物流異常，需要人工確認。",
  },
};

function getExceptionReasonText(
  reasonCode: string,
  message: string | null,
): { reason: string; description: string; rowHint: string | null } {
  const mapped = REASON_TEXTS[reasonCode] ?? {
    reason: "其他物流異常",
    description: "系統記錄到一筆未分類的物流異常。",
  };
  // message 內若可解析出 "row N"，補充顯示 Excel 列號；解析不到就不顯示
  const rowMatch = message?.match(/\brow\s+(\d+)\b/i);
  const rowHint = rowMatch ? `Excel 第 ${rowMatch[1]} 列` : null;
  return { ...mapped, rowHint };
}

interface ExceptionGroup {
  key: string;
  provider: string;
  sourceType: string;
  trackingCode: string | null;
  orderId: number | null;
  status: string;
  severity: string;
  errorCode: string;
  message: string | null;
  items: TrackingException[];
  totalFailures: number;
  latestAt: string | null;
  earliestAt: string | null;
}

function groupExceptions(items: TrackingException[]): ExceptionGroup[] {
  const map = new Map<string, ExceptionGroup>();
  const order: string[] = [];
  const time = (iso: string | null) => {
    const t = iso ? new Date(iso).getTime() : NaN;
    return isNaN(t) ? null : t;
  };
  for (const item of items) {
    const key = [
      item.provider,
      item.sourceType,
      item.trackingCode ?? "",
      item.orderId ?? "",
      item.errorCode,
      item.status,
    ].join("|");
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        provider: item.provider,
        sourceType: item.sourceType,
        trackingCode: item.trackingCode,
        orderId: item.orderId,
        status: item.status,
        severity: item.severity,
        errorCode: item.errorCode,
        message: item.message,
        items: [],
        totalFailures: 0,
        latestAt: item.createdAt,
        earliestAt: item.createdAt,
      };
      map.set(key, group);
      order.push(key);
    }
    group.items.push(item);
    group.totalFailures += item.failureCount;
    const t = time(item.createdAt);
    if (t != null) {
      const latest = time(group.latestAt);
      const earliest = time(group.earliestAt);
      if (latest == null || t > latest) group.latestAt = item.createdAt;
      if (earliest == null || t < earliest) group.earliestAt = item.createdAt;
    }
    // 嚴重程度取最高的那筆
    const rank: Record<string, number> = {
      info: 0,
      warning: 1,
      error: 2,
      critical: 3,
    };
    if ((rank[item.severity] ?? 0) > (rank[group.severity] ?? 0))
      group.severity = item.severity;
  }
  return order.map((k) => map.get(k)!);
}

// 只有查詢類失敗可重新查詢；conflict / 配對類異常重查無法解決。目前僅支援全家。
const RETRYABLE_ERROR_CODES = new Set([
  "NO_RESULT",
  "NETWORK_FAILED",
  "TIMEOUT",
  "PARSER_FAILED",
  "UNKNOWN_ERROR",
]);

function canRetryException(group: ExceptionGroup): boolean {
  return (
    group.provider === "familymart" &&
    RETRYABLE_ERROR_CODES.has(group.errorCode)
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SELECT =
  "h-9 rounded-xl border border-input bg-white text-xs text-foreground px-2 min-w-0";

export default function LogisticsExceptionsPage() {
  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  const { getToken } = useAuth();

  const [status, setStatus] = useState("open");
  const [provider, setProvider] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [items, setItems] = useState<TrackingException[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingGroup, setActingGroup] = useState<string | null>(null);
  const [retryingGroup, setRetryingGroup] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchExceptions = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        status,
        provider,
        sourceType,
        limit: "100",
      });
      const res = await fetch(
        `/api/stores/${storeId}/logistics/exceptions?${params}`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        // debug 僅輸出狀態碼與 errorCode，不含 token / rawData / 個資
        console.error(
          "logistics exceptions load failed",
          res.status,
          body.errorCode ?? null,
          body.message ?? null,
        );
        setError("物流異常資料載入失敗");
        return;
      }
      setItems(body.items ?? []);
    } catch {
      setError("物流異常資料載入失敗");
    } finally {
      setLoading(false);
    }
  }, [storeId, status, provider, sourceType, getToken]);

  useEffect(() => {
    void fetchExceptions();
  }, [fetchExceptions]);

  // 批次操作：用現有單筆 PATCH 逐筆處理 group 內所有 ids
  const updateGroupStatus = async (
    group: ExceptionGroup,
    next: "resolved" | "ignored" | "open",
  ) => {
    if (!storeId) return;
    setActingGroup(group.key);
    setActionError(null);
    try {
      const token = await getToken();
      for (const item of group.items) {
        const res = await fetch(
          `/api/stores/${storeId}/logistics/exceptions/${item.id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: {
              "content-type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ status: next }),
          },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) {
          setActionError("批次處理失敗，請稍後再試。");
          await fetchExceptions();
          return;
        }
      }
      await fetchExceptions();
    } catch {
      setActionError("批次處理失敗，請稍後再試。");
    } finally {
      setActingGroup(null);
    }
  };

  // 重新查詢：對 group 內第一筆（最新）exception 呼叫 retry endpoint
  const retryGroup = async (group: ExceptionGroup) => {
    if (!storeId) return;
    const target = group.items[0];
    if (!target) return;
    setRetryingGroup(group.key);
    setActionError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/stores/${storeId}/logistics/exceptions/${target.id}/retry`,
        {
          method: "POST",
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setActionError("重新查詢失敗，請稍後再試。");
        return;
      }
      await fetchExceptions();
    } catch {
      setActionError("重新查詢失敗，請稍後再試。");
    } finally {
      setRetryingGroup(null);
    }
  };

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groups = groupExceptions(items);

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-foreground">物流異常處理</h1>
        <p className="text-xs text-muted-foreground mt-1">
          集中處理匯入與物流查詢失敗的資料。
        </p>
        <div className="flex items-center gap-2 mt-3">
          <select
            className={SELECT}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {PROVIDER_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
          >
            {SOURCE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void fetchExceptions()}
            className="h-9 shrink-0 rounded-xl border border-primary/30 bg-primary/5 text-xs font-medium text-primary px-3"
          >
            重新整理
          </button>
        </div>
      </header>

      <div className="px-5 py-4 space-y-3">
        <LogisticsSyncStatusHint />
        {actionError && !loading && !error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {actionError}
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">
              物流異常資料載入中...
            </p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4 text-center space-y-2">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => void fetchExceptions()}
              className="h-8 px-4 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-700"
            >
              重新整理
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 border border-border text-center">
            <p className="text-muted-foreground text-sm">
              {status === "open"
                ? "目前沒有待處理物流異常"
                : "沒有符合條件的物流異常"}
            </p>
          </div>
        ) : (
          groups.map((group) => {
            const { reason, description, rowHint } = getExceptionReasonText(
              group.errorCode,
              group.message,
            );
            const acting = actingGroup === group.key;
            const retrying = retryingGroup === group.key;
            const isExpanded = expanded.has(group.key);
            return (
              <div
                key={group.key}
                className="bg-white rounded-2xl border border-border px-4 py-3.5 space-y-2"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-foreground">
                    {group.orderId != null ? `#${group.orderId}` : "未配對訂單"}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    {getProviderShortName(group.provider) ?? "物流"}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    {SOURCE_LABELS[group.sourceType] ?? "系統"}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[group.status] ?? "bg-gray-100 text-gray-500"}`}
                  >
                    {STATUS_LABELS[group.status] ?? "其他狀態"}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[group.severity] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {SEVERITY_LABELS[group.severity] ?? "一般"}
                  </span>
                </div>
                <div className="text-xs text-foreground space-y-0.5">
                  <p className="break-all">貨號：{group.trackingCode || "—"}</p>
                  <p>原因：{reason}</p>
                  <p className="text-muted-foreground">
                    說明：{description}
                    {rowHint ? `（${rowHint}）` : ""}
                  </p>
                  <p>同類異常：{group.items.length} 筆</p>
                  <p className="text-muted-foreground">
                    最新發生：{formatTime(group.latestAt)}
                  </p>
                  <p className="text-muted-foreground">
                    最早發生：{formatTime(group.earliestAt)}
                  </p>
                  <p className="text-muted-foreground">
                    失敗總次數：{group.totalFailures} 次
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {group.status === "open" || group.status === "reviewing" ? (
                    <>
                      <button
                        type="button"
                        disabled={acting}
                        onClick={() =>
                          void updateGroupStatus(group, "resolved")
                        }
                        className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-50"
                      >
                        {acting ? "處理中..." : "全部標記已處理"}
                      </button>
                      <button
                        type="button"
                        disabled={acting}
                        onClick={() => void updateGroupStatus(group, "ignored")}
                        className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground disabled:opacity-50"
                      >
                        {acting ? "處理中..." : "全部忽略"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={acting}
                      onClick={() => void updateGroupStatus(group, "open")}
                      className="h-8 px-3 rounded-lg border border-primary/30 bg-primary/5 text-xs font-medium text-primary disabled:opacity-50"
                    >
                      {acting ? "處理中..." : "全部重新打開"}
                    </button>
                  )}
                  {canRetryException(group) &&
                    (group.status === "open" ||
                      group.status === "reviewing") && (
                      <button
                        type="button"
                        disabled={retrying || acting}
                        onClick={() => void retryGroup(group)}
                        className="h-8 px-3 rounded-lg border border-primary/30 bg-primary/5 text-xs font-medium text-primary disabled:opacity-50"
                      >
                        {retrying ? "查詢中..." : "重新查詢"}
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(group.key)}
                    className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground"
                  >
                    {isExpanded ? "收合明細" : "展開明細"}
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-border pt-2 space-y-1">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="text-[11px] text-muted-foreground"
                      >
                        #{item.id}　建立 {formatTime(item.createdAt)}　失敗{" "}
                        {item.failureCount} 次
                        {item.resolvedAt
                          ? `　處理時間 ${formatTime(item.resolvedAt)}`
                          : ""}
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground/70 break-all">
                      技術代碼：{group.errorCode}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <BottomNav active="orders" />
    </div>
  );
}
