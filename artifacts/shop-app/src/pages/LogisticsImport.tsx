import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useGetMyStore } from "@workspace/api-client-react";
import { BottomNav } from "./Dashboard";
import { LogisticsSyncStatusNotice } from "../components/LogisticsSyncStatusNotice";

type Provider = "711" | "familymart";

interface DryRunRow {
  rowNumber: number;
  trackingCode: string | null;
  recipientNameMasked: string | null;
  recipientPhoneMasked: string | null;
  storeName: string | null;
  matchStatus: string;
  matchedOrderId?: number;
  confidence?: number;
  reasons: string[];
  errorCode: string | null;
}

interface DryRunResponse {
  ok: boolean;
  provider: Provider;
  fileName: string;
  batchId: number;
  dryRun: {
    totalRows: number;
    matchedRows: number;
    needsReviewRows: number;
    ambiguousRows: number;
    notFoundRows: number;
    conflictRows: number;
    invalidRows: number;
    rows: DryRunRow[];
  };
}

interface ConfirmResponse {
  ok: boolean;
  batchId: number;
  batchStatus: string;
  importedCount: number;
  skippedCount: number;
  rows: Array<{ rowId: number; rowNumber: number; status: "imported" | "skipped"; errorCode: string | null }>;
}

const STATUS_LABEL: Record<string, string> = {
  matched: "可匯入",
  needs_review: "需人工確認",
  ambiguous: "多筆候選",
  not_found: "找不到訂單",
  conflict: "衝突",
  invalid: "資料不完整",
  imported: "已匯入",
  skipped: "已略過",
};

const STATUS_CLASS: Record<string, string> = {
  matched: "bg-green-100 text-green-700",
  needs_review: "bg-yellow-100 text-yellow-700",
  ambiguous: "bg-yellow-100 text-yellow-700",
  not_found: "bg-gray-100 text-gray-500",
  conflict: "bg-red-100 text-red-700",
  invalid: "bg-red-100 text-red-700",
  imported: "bg-green-100 text-green-700",
  skipped: "bg-gray-100 text-gray-500",
};

const ERROR_MESSAGE: Record<string, string> = {
  INVALID_PROVIDER: "物流商選擇錯誤",
  MISSING_FILE: "請先選擇檔案",
  UNSUPPORTED_FILE_TYPE: "只接受 .xlsx 檔案",
  FILE_TOO_LARGE: "檔案超過 10MB 上限",
  PARSE_FAILED: "無法解析此檔案",
  REQUIRED_COLUMNS_MISSING: "檔案欄位與所選物流商格式不符，請確認檔案來源",
  ORDERS_READ_FAILED: "無法讀取訂單資料，請稍後再試",
  INVALID_CONFIRM_REQUEST: "確認請求格式錯誤",
  BATCH_ALREADY_CONFIRMED: "此批次已確認過，無法重複匯入",
  BATCH_NOT_FOUND: "找不到此匯入批次",
  NO_ROWS_SELECTED: "沒有可匯入的資料列",
  UNKNOWN_ERROR: "發生未知錯誤，請稍後再試",
};

const IMPORT_ROW_REASON_TEXTS: Record<string, { reason: string; description: string }> = {
  TRACKING_CODE_CONFLICT: {
    reason: "物流貨號重複",
    description: "這個物流貨號已經存在，因此系統沒有重複匯入。",
  },
  ORDER_ALREADY_HAS_TRACKING: {
    reason: "訂單已有物流資料",
    description: "這筆訂單已經有物流資料，因此系統沒有重複建立。",
  },
  ROW_NOT_IMPORTABLE: {
    reason: "此列不可匯入",
    description: "這列資料目前不符合匯入條件，因此確認匯入時被略過。",
  },
  NO_MATCH: {
    reason: "找不到對應訂單",
    description: "系統找不到能對應這列資料的訂單，請確認 Excel 內容或訂單資料。",
  },
  NOT_FOUND: {
    reason: "找不到對應訂單",
    description: "系統找不到能對應這列資料的訂單，請確認 Excel 內容或訂單資料。",
  },
  ORDER_NOT_FOUND: {
    reason: "找不到對應訂單",
    description: "系統找不到能對應這列資料的訂單，請確認 Excel 內容或訂單資料。",
  },
  AMBIGUOUS_MATCH: {
    reason: "可能對應多筆訂單",
    description: "這列資料可能符合多筆訂單，系統無法自動判斷要匯入哪一筆。",
  },
  INVALID_TRACKING_CODE: {
    reason: "貨號格式不正確",
    description: "這列物流貨號格式不符合系統要求，請檢查 Excel 內容。",
  },
  PARSER_FAILED: {
    reason: "Excel 資料解析失敗",
    description: "這列 Excel 內容無法正確解析，請檢查欄位格式。",
  },
  UNKNOWN_ERROR: {
    reason: "未知匯入異常",
    description: "系統處理這列資料時發生未預期狀況，請稍後再試或人工確認。",
  },
};

function getImportRowTexts(errorCode: string | null, status: string): { reason: string; description: string } {
  if (errorCode) {
    return (
      IMPORT_ROW_REASON_TEXTS[errorCode] ?? {
        reason: "其他匯入異常",
        description: "這列資料未完成匯入，請人工確認。",
      }
    );
  }
  if (status === "skipped") {
    return { reason: "已略過", description: "這列資料不需要再次匯入。" };
  }
  if (status === "imported") {
    return { reason: "已成功匯入", description: "這列資料已成功建立物流追蹤資料。" };
  }
  return { reason: "匯入失敗", description: "這列資料未完成匯入，請人工確認。" };
}

function errorText(errorCode: string | undefined, httpStatus: number): string {
  if (httpStatus === 401) return "請先登入";
  if (httpStatus === 403) return "沒有此店家的權限";
  const text = errorCode ? ERROR_MESSAGE[errorCode] : undefined;
  return text ? `${text}（${errorCode}）` : `發生錯誤（${errorCode ?? httpStatus}）`;
}

export default function LogisticsImportPage() {
  const [, setLocation] = useLocation();
  const { data: store } = useGetMyStore();
  const { getToken } = useAuth();
  const storeId = store?.id;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<Provider>("711");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);

  const reset = () => {
    setDryRun(null);
    setConfirmResult(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!storeId || !file) return;
    setUploading(true);
    setError(null);
    setDryRun(null);
    setConfirmResult(null);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("provider", provider);
      form.append("file", file);
      const res = await fetch(`/api/stores/${storeId}/logistics/imports/dry-run`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(errorText(body.errorCode, res.status));
        return;
      }
      setDryRun(body);
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!storeId || !dryRun) return;
    const okToGo = window.confirm("只會匯入「可匯入（matched）」的資料列，其他狀態不會自動匯入。確定要匯入嗎？");
    if (!okToGo) return;
    setConfirming(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/stores/${storeId}/logistics/imports/${dryRun.batchId}/confirm`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ confirmAllMatched: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(errorText(body.errorCode, res.status));
        return;
      }
      setConfirmResult(body);
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setConfirming(false);
    }
  };

  const summary = dryRun?.dryRun;

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-foreground">物流 Excel 匯入</h1>
        <p className="text-xs text-muted-foreground mt-1">
          支援 7-11 / 全家 Excel。上傳後先比對（不會寫入），確認後只匯入「可匯入」的資料列。
        </p>
        <button
          type="button"
          onClick={() => setLocation("/logistics/import/history")}
          className="mt-3 h-9 rounded-xl border border-primary/30 bg-primary/5 text-xs font-medium text-primary px-3"
        >
          查看匯入紀錄
        </button>
      </header>

      <div className="px-5 py-5 space-y-5">
        <LogisticsSyncStatusNotice />

        {/* provider + file */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">物流商</label>
            <div className="grid grid-cols-2 gap-2">
              {([["711", "7-11"], ["familymart", "全家"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setProvider(value); reset(); }}
                  className={`h-11 rounded-xl text-sm font-medium border ${
                    provider === value ? "bg-primary text-white border-primary" : "bg-secondary text-foreground border-input"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Excel 檔案（.xlsx）</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-11 rounded-xl border border-input bg-secondary text-sm text-foreground px-4 text-left truncate"
            >
              {file ? file.name : "選擇檔案…"}
            </button>
          </div>

          <button
            type="button"
            disabled={!storeId || !file || uploading}
            onClick={handleUpload}
            className="w-full h-11 bg-primary text-white font-semibold rounded-xl text-sm disabled:opacity-50"
          >
            {uploading ? "比對中…" : "開始比對（dry-run）"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        {/* dry-run summary */}
        {summary && (
          <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">比對結果</h2>
              <span className="text-xs text-muted-foreground">批次 #{dryRun!.batchId}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {([
                ["總列數", summary.totalRows, ""],
                ["可匯入", summary.matchedRows, "text-green-600"],
                ["需確認", summary.needsReviewRows, "text-yellow-600"],
                ["多候選", summary.ambiguousRows, "text-yellow-600"],
                ["找不到", summary.notFoundRows, "text-muted-foreground"],
                ["衝突", summary.conflictRows, "text-red-600"],
                ["不完整", summary.invalidRows, "text-red-600"],
              ] as const).map(([label, value, cls]) => (
                <div key={label} className="bg-secondary rounded-xl py-2">
                  <div className={`text-base font-bold ${cls}`}>{value}</div>
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            {/* confirm */}
            {confirmResult ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
                已確認匯入：成功 {confirmResult.importedCount} 筆、略過 {confirmResult.skippedCount} 筆。
                {confirmResult.rows.some((r) => r.status === "skipped") && (
                  <ul className="mt-2 space-y-1.5">
                    {confirmResult.rows
                      .filter((r) => r.status === "skipped")
                      .map((r) => {
                        const texts = getImportRowTexts(r.errorCode, r.status);
                        return (
                          <li key={r.rowId} className="text-xs text-green-700">
                            <div>Excel 第 {r.rowNumber} 列 — 原因：{texts.reason}</div>
                            <div className="text-green-700/80">說明：{texts.description}</div>
                            {r.errorCode && (
                              <div className="text-[10px] text-muted-foreground/70">技術代碼：{r.errorCode}</div>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={summary.matchedRows === 0 || confirming}
                onClick={handleConfirm}
                className="w-full h-11 bg-primary text-white font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                {confirming ? "匯入中…" : `確認匯入全部可匯入列（${summary.matchedRows} 筆）`}
              </button>
            )}
          </div>
        )}

        {/* rows table */}
        {summary && summary.rows.length > 0 && (
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-sm font-bold text-foreground">明細（個資已遮罩）</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="px-3 py-2 text-left">列</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                    <th className="px-3 py-2 text-left">物流單號</th>
                    <th className="px-3 py-2 text-left">收件人</th>
                    <th className="px-3 py-2 text-left">電話</th>
                    <th className="px-3 py-2 text-left">門市</th>
                    <th className="px-3 py-2 text-left">信心</th>
                    <th className="px-3 py-2 text-left">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr key={row.rowNumber} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[row.matchStatus] ?? "bg-gray-100 text-gray-500"}`}>
                          {STATUS_LABEL[row.matchStatus] ?? row.matchStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">{row.trackingCode ?? "—"}</td>
                      <td className="px-3 py-2">{row.recipientNameMasked ?? "—"}</td>
                      <td className="px-3 py-2">{row.recipientPhoneMasked ?? "—"}</td>
                      <td className="px-3 py-2">{row.storeName ?? "—"}</td>
                      <td className="px-3 py-2">{row.confidence ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.errorCode ?? row.reasons.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <BottomNav active="orders" />
    </div>
  );
}
