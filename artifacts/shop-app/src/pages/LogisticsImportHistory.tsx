import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useGetMyStore } from "@workspace/api-client-react";
import { BottomNav } from "./Dashboard";

interface ImportBatch {
  id: number;
  provider: string;
  sourceType: string;
  fileName: string;
  status: string;
  totalRows: number;
  successRows: number;
  skippedRows: number;
  failedRows: number;
  pendingRows: number;
  confirmedAt: string | null;
  createdAt: string | null;
}

interface ImportRow {
  id: number;
  rowNumber: number;
  trackingCode: string | null;
  orderId: number | null;
  status: string;
  errorCode: string | null;
  createdAt: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  familymart: "全家",
  "711": "7-11",
  tcat: "黑貓",
  postoffice: "郵局",
};

const SOURCE_LABELS: Record<string, string> = {
  excel: "Excel",
  file_import: "Excel 匯入",
  manual: "手動",
  system: "系統",
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  dry_run: "尚未確認",
  confirmed: "已完成",
  completed: "已完成",
  success: "已完成",
  partial: "部分成功",
  cancelled: "已取消",
  failed: "失敗",
  processing: "處理中",
  pending: "待處理",
};

const BATCH_STATUS_BADGE: Record<string, string> = {
  dry_run: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  completed: "bg-green-100 text-green-700",
  success: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-gray-100 text-gray-500",
  failed: "bg-red-100 text-red-700",
  processing: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700",
};

// row matchStatus → 四類結果（語氣：成功正向 / 略過中性 / 失敗警示 / 待確認提醒）
type RowResult = "success" | "skipped" | "failed" | "pending";

function getRowResult(row: ImportRow): RowResult {
  const s = row.status;
  if (s === "imported" || s === "success") return "success";
  if (s === "invalid" || s === "failed" || s === "error") return "failed";
  if (s === "matched" || s === "pending") return "pending";
  // skipped / conflict / not_found / ambiguous / needs_review 與其他 → 略過
  return "skipped";
}

const RESULT_LABELS: Record<RowResult, string> = {
  success: "成功",
  skipped: "略過",
  failed: "失敗",
  pending: "待確認",
};

const RESULT_BADGE: Record<RowResult, string> = {
  success: "bg-green-100 text-green-700",
  skipped: "bg-gray-100 text-gray-600",
  failed: "bg-red-100 text-red-700",
  pending: "bg-blue-100 text-blue-700",
};

// 英文 errorCode → 繁體中文原因＋說明（errorCode 優先於 matchStatus）
const ROW_REASON_TEXTS: Record<string, { reason: string; description: string }> = {
  TRACKING_CODE_CONFLICT: {
    reason: "物流貨號重複",
    description: "這個物流貨號已經存在，因此 Excel 匯入時略過此列。",
  },
  ORDER_ALREADY_HAS_TRACKING: {
    reason: "訂單已有物流資料",
    description: "這筆訂單已經有物流資料，因此系統沒有重複建立。",
  },
  NO_MATCH: { reason: "找不到對應訂單", description: "系統找不到能對應這列資料的訂單，請確認 Excel 內容或訂單資料。" },
  NOT_FOUND: { reason: "找不到對應訂單", description: "系統找不到能對應這列資料的訂單，請確認 Excel 內容或訂單資料。" },
  ORDER_NOT_FOUND: { reason: "找不到對應訂單", description: "系統找不到能對應這列資料的訂單，請確認 Excel 內容或訂單資料。" },
  AMBIGUOUS_MATCH: { reason: "可能對應多筆訂單", description: "這列資料可能符合多筆訂單，系統無法自動判斷要匯入哪一筆。" },
  INVALID_TRACKING_CODE: { reason: "貨號格式不正確", description: "這列物流貨號格式不符合系統要求，請檢查 Excel 內容。" },
  PARSER_FAILED: { reason: "Excel 資料解析失敗", description: "這列 Excel 內容無法正確解析，請檢查欄位格式。" },
  ROW_NOT_IMPORTABLE: { reason: "此列不可匯入", description: "這列資料目前不符合匯入條件。" },
  UNKNOWN_ERROR: { reason: "未知匯入異常", description: "系統處理這列資料時發生未預期狀況，請稍後再試或人工確認。" },
};

// 沒有 errorCode 時用 matchStatus 給原因
const STATUS_REASON_TEXTS: Record<string, { reason: string; description: string }> = {
  imported: { reason: "已成功匯入", description: "這列資料已成功配對並建立物流追蹤資料。" },
  success: { reason: "已成功匯入", description: "這列資料已成功配對並建立物流追蹤資料。" },
  matched: { reason: "待確認匯入", description: "這列資料已完成比對，尚未正式寫入。" },
  pending: { reason: "待確認匯入", description: "這列資料已完成比對，尚未正式寫入。" },
  needs_review: { reason: "需人工確認", description: "比對結果不夠確定，需要人工確認後再匯入。" },
  ambiguous: { reason: "可能對應多筆訂單", description: "這列資料可能符合多筆訂單，系統無法自動判斷要匯入哪一筆。" },
  not_found: { reason: "找不到對應訂單", description: "系統找不到能對應這列資料的訂單，請確認 Excel 內容或訂單資料。" },
  conflict: { reason: "物流貨號重複", description: "這個物流貨號已經存在，因此 Excel 匯入時略過此列。" },
  invalid: { reason: "資料不完整", description: "這列缺少必要資料（例如貨號），無法匯入。" },
  skipped: { reason: "已略過", description: "這列資料不需要再次匯入。" },
};

function getRowReasonText(row: ImportRow): { reason: string; description: string } {
  if (row.errorCode && ROW_REASON_TEXTS[row.errorCode]) return ROW_REASON_TEXTS[row.errorCode];
  if (STATUS_REASON_TEXTS[row.status]) return STATUS_REASON_TEXTS[row.status];
  if (row.errorCode) return { reason: "其他匯入異常", description: "這列資料未完成匯入，請查看技術代碼或人工確認。" };
  return { reason: "—", description: "" };
}

function matchesRowSearch(row: ImportRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (String(row.rowNumber).includes(q)) return true;
  if (row.orderId != null && String(row.orderId).includes(q)) return true;
  if (row.trackingCode && row.trackingCode.toLowerCase().includes(q)) return true;
  if (getRowReasonText(row).reason.toLowerCase().includes(q)) return true;
  if (row.errorCode && row.errorCode.toLowerCase().includes(q)) return true;
  return false;
}

function filterRows(rows: ImportRow[], filter: "all" | RowResult, query: string): ImportRow[] {
  return rows.filter(
    (row) => (filter === "all" || getRowResult(row) === filter) && matchesRowSearch(row, query),
  );
}

// 長檔名截斷顯示（完整檔名放 title）
function shortFileName(name: string): string {
  if (name.length <= 24) return name;
  return `${name.slice(0, 10)}...${name.slice(-10)}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ROWS_PER_PAGE = 25;

const FILTER_CHIPS: Array<{ value: "all" | RowResult; label: string }> = [
  { value: "all", label: "全部" },
  { value: "success", label: "成功" },
  { value: "skipped", label: "略過" },
  { value: "failed", label: "失敗" },
  { value: "pending", label: "待確認" },
];

type RowsState =
  | { state: "loading" }
  | { state: "error" }
  | { state: "loaded"; rows: ImportRow[] };

export default function LogisticsImportHistoryPage() {
  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  const { getToken } = useAuth();

  const [items, setItems] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowsByBatch, setRowsByBatch] = useState<Record<number, RowsState>>({});
  const [openBatchId, setOpenBatchId] = useState<number | null>(null);
  const [rowFilterByBatch, setRowFilterByBatch] = useState<Record<number, "all" | RowResult>>({});
  const [rowSearchByBatch, setRowSearchByBatch] = useState<Record<number, string>>({});
  const [rowPageByBatch, setRowPageByBatch] = useState<Record<number, number>>({});

  const fetchBatches = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/stores/${storeId}/logistics/import-batches?limit=20&provider=all`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError("匯入紀錄載入失敗");
        return;
      }
      setItems(body.items ?? []);
    } catch {
      setError("匯入紀錄載入失敗");
    } finally {
      setLoading(false);
    }
  }, [storeId, getToken]);

  useEffect(() => {
    void fetchBatches();
  }, [fetchBatches]);

  // 「最新」標籤：createdAt 最新的批次
  const latestBatchId = items.reduce<{ id: number | null; t: number }>(
    (acc, b) => {
      const t = b.createdAt ? new Date(b.createdAt).getTime() : NaN;
      if (!isNaN(t) && t > acc.t) return { id: b.id, t };
      return acc;
    },
    { id: items[0]?.id ?? null, t: -Infinity },
  ).id;

  const toggleRows = async (batchId: number) => {
    if (openBatchId === batchId) {
      setOpenBatchId(null);
      return;
    }
    setOpenBatchId(batchId);
    if (rowsByBatch[batchId]?.state === "loaded") return;
    setRowsByBatch((prev) => ({ ...prev, [batchId]: { state: "loading" } }));
    if (!storeId) return;
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/stores/${storeId}/logistics/import-batches/${batchId}/rows?status=all&limit=200`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setRowsByBatch((prev) => ({ ...prev, [batchId]: { state: "error" } }));
        return;
      }
      setRowsByBatch((prev) => ({ ...prev, [batchId]: { state: "loaded", rows: body.rows ?? [] } }));
    } catch {
      setRowsByBatch((prev) => ({ ...prev, [batchId]: { state: "error" } }));
    }
  };

  const setFilter = (batchId: number, filter: "all" | RowResult) => {
    setRowFilterByBatch((prev) => ({ ...prev, [batchId]: filter }));
    setRowPageByBatch((prev) => ({ ...prev, [batchId]: 1 }));
  };

  const setSearch = (batchId: number, query: string) => {
    setRowSearchByBatch((prev) => ({ ...prev, [batchId]: query }));
    setRowPageByBatch((prev) => ({ ...prev, [batchId]: 1 }));
  };

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-foreground">物流匯入紀錄</h1>
        <p className="text-xs text-muted-foreground mt-1">查看每次 Excel 匯入結果與明細。</p>
        <button
          type="button"
          onClick={() => void fetchBatches()}
          className="mt-3 h-9 rounded-xl border border-primary/30 bg-primary/5 text-xs font-medium text-primary px-3"
        >
          重新整理
        </button>
      </header>

      <div className="px-5 py-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">匯入紀錄載入中...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4 text-center space-y-2">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => void fetchBatches()}
              className="h-8 px-4 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-700"
            >
              重新整理
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 border border-border text-center">
            <p className="text-muted-foreground text-sm">目前沒有物流匯入紀錄</p>
          </div>
        ) : (
          items.map((batch) => {
            const rowsState = rowsByBatch[batch.id];
            const isOpen = openBatchId === batch.id;
            const filter = rowFilterByBatch[batch.id] ?? "all";
            const search = rowSearchByBatch[batch.id] ?? "";
            const allSkipped = batch.skippedRows > 0 && batch.successRows === 0 && batch.failedRows === 0;

            let filtered: ImportRow[] = [];
            let totalRowsLoaded = 0;
            let page = 1;
            let totalPages = 1;
            let pageRows: ImportRow[] = [];
            if (rowsState?.state === "loaded") {
              totalRowsLoaded = rowsState.rows.length;
              filtered = filterRows(rowsState.rows, filter, search);
              totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
              page = Math.min(rowPageByBatch[batch.id] ?? 1, totalPages);
              pageRows = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
            }

            return (
              <div key={batch.id} className="bg-white rounded-2xl border border-border px-4 py-3.5 space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-foreground">
                    {PROVIDER_LABELS[batch.provider] ?? "其他物流"} {SOURCE_LABELS[batch.sourceType] ?? "Excel"}
                  </span>
                  {batch.id === latestBatchId && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">最新</span>
                  )}
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${BATCH_STATUS_BADGE[batch.status] ?? "bg-gray-100 text-gray-500"}`}>
                    {BATCH_STATUS_LABELS[batch.status] ?? "其他狀態"}
                  </span>
                </div>
                <div className="text-xs text-foreground space-y-0.5">
                  <p className="text-muted-foreground">{formatTime(batch.createdAt)}</p>
                  <p className="truncate" title={batch.fileName}>檔案：{shortFileName(batch.fileName)}</p>
                </div>
                {/* 統計：略過為中性灰、失敗才警示紅、成功正向綠、待確認中性藍 */}
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="rounded-lg bg-secondary py-1.5">
                    <p className="text-[10px] text-muted-foreground">總列數</p>
                    <p className="text-sm font-bold text-foreground">{batch.totalRows}</p>
                  </div>
                  <div className="rounded-lg bg-green-50 py-1.5">
                    <p className="text-[10px] text-green-700">成功</p>
                    <p className="text-sm font-bold text-green-700">{batch.successRows}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 py-1.5">
                    <p className="text-[10px] text-gray-500">略過</p>
                    <p className="text-sm font-bold text-gray-600">{batch.skippedRows}</p>
                  </div>
                  <div className={`rounded-lg py-1.5 ${batch.failedRows > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                    <p className={`text-[10px] ${batch.failedRows > 0 ? "text-red-700" : "text-gray-500"}`}>失敗</p>
                    <p className={`text-sm font-bold ${batch.failedRows > 0 ? "text-red-700" : "text-gray-600"}`}>{batch.failedRows}</p>
                  </div>
                </div>
                {batch.pendingRows > 0 && (
                  <p className="text-[11px] text-blue-700">待確認：{batch.pendingRows} 筆（尚未正式寫入）</p>
                )}
                {allSkipped && (
                  <p className="text-[11px] text-muted-foreground">
                    這批資料多數已存在或不需再次匯入，因此被系統略過。
                  </p>
                )}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => void toggleRows(batch.id)}
                    className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground"
                  >
                    {isOpen ? "收合明細" : "查看明細"}
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-border pt-2 space-y-2">
                    {!rowsState || rowsState.state === "loading" ? (
                      <p className="text-xs text-muted-foreground py-2">明細載入中...</p>
                    ) : rowsState.state === "error" ? (
                      <p className="text-xs text-red-700 py-2">明細載入失敗，請重新整理後再試</p>
                    ) : totalRowsLoaded === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">此批次沒有明細資料</p>
                    ) : (
                      <>
                        {/* 明細工具列：狀態 chips + 搜尋 */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {FILTER_CHIPS.map((chip) => (
                            <button
                              key={chip.value}
                              type="button"
                              onClick={() => setFilter(batch.id, chip.value)}
                              className={`h-7 px-2.5 rounded-full text-[11px] font-medium border ${
                                filter === chip.value
                                  ? "bg-primary text-white border-primary"
                                  : "bg-white text-muted-foreground border-border"
                              }`}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(batch.id, e.target.value)}
                          placeholder="搜尋貨號、訂單編號或 Excel 列號"
                          className="w-full h-9 rounded-xl border border-input bg-white text-xs text-foreground px-3"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          目前顯示 {filtered.length} / {totalRowsLoaded} 筆
                        </p>

                        {filtered.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">沒有符合條件的明細</p>
                        ) : (
                          <>
                            {pageRows.map((row) => {
                              const result = getRowResult(row);
                              const { reason, description } = getRowReasonText(row);
                              return (
                                <div key={row.id} className="text-xs text-foreground space-y-0.5 border-b border-border/50 pb-2 last:border-b-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium">Excel 第 {row.rowNumber} 列</span>
                                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${RESULT_BADGE[result]}`}>
                                      {RESULT_LABELS[result]}
                                    </span>
                                  </div>
                                  <p className="break-all">貨號：{row.trackingCode || "未提供"}</p>
                                  <p>訂單：{row.orderId != null ? `#${row.orderId}` : "未配對"}</p>
                                  <p>原因：{reason}</p>
                                  {description && <p className="text-muted-foreground">說明：{description}</p>}
                                  {row.errorCode && (
                                    <p className="text-[10px] text-muted-foreground/70 break-all">技術代碼：{row.errorCode}</p>
                                  )}
                                </div>
                              );
                            })}
                            {totalPages > 1 && (
                              <div className="flex items-center justify-between pt-1">
                                <button
                                  type="button"
                                  disabled={page <= 1}
                                  onClick={() => setRowPageByBatch((prev) => ({ ...prev, [batch.id]: page - 1 }))}
                                  className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground disabled:opacity-40"
                                >
                                  上一頁
                                </button>
                                <span className="text-[11px] text-muted-foreground">第 {page} / {totalPages} 頁</span>
                                <button
                                  type="button"
                                  disabled={page >= totalPages}
                                  onClick={() => setRowPageByBatch((prev) => ({ ...prev, [batch.id]: page + 1 }))}
                                  className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground disabled:opacity-40"
                                >
                                  下一頁
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
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
