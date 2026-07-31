import { useState } from "react";

interface MaihuobianRow {
  recipientName: string;
  recipientPhone: string;
  cvsStoreId: string;
  temperature: string;
  productSummary: string;
  totalPrice: string;
  shippingFee: string;
  orderDate: string;
  notes: string;
  socialAccount: string;
}

interface PreviewEligibleOrder {
  orderId: number;
  productSummary: string;
}

interface ExportEligibleOrder {
  orderId: number;
  row: MaihuobianRow;
}

interface IneligibleOrder {
  orderId: number;
  reasons: Array<{ code: string; message: string; field?: string }>;
}

interface MaihuobianPreview {
  eligibleCount: number;
  ineligibleCount: number;
  eligible: PreviewEligibleOrder[];
  ineligible: IneligibleOrder[];
}

interface MaihuobianExportResult {
  eligibleCount: number;
  ineligibleCount: number;
  eligible: ExportEligibleOrder[];
  ineligible: IneligibleOrder[];
}

export interface MaihuobianExportPanelProps {
  storeId: number;
  getToken: () => Promise<string | null>;
  onClose: () => void;
}

const CSV_HEADERS = [
  "＊取件人姓名",
  "＊取件人手機",
  "＊取件門市",
  "＊溫層",
  "＊商品",
  "＊訂單金額",
  "＊運費金額",
  "買家下訂日期",
  "商品備註",
  "其他資訊 FB/LINE/IG帳號",
] as const;

function csvCell(value: string): string {
  const protectedValue = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function formatMaihuobianCsv(rows: readonly MaihuobianRow[]): string {
  const records = rows.map((row) => [
    row.recipientName,
    row.recipientPhone,
    row.cvsStoreId,
    row.temperature,
    row.productSummary,
    row.totalPrice,
    row.shippingFee,
    row.orderDate,
    row.notes,
    row.socialAccount,
  ]);
  return [CSV_HEADERS, ...records]
    .map((record) => record.map((value) => csvCell(value)).join(","))
    .join("\r\n");
}

async function responseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: unknown;
  };
  return typeof body.error === "string" && body.error
    ? body.error
    : "請稍後再試";
}

export function MaihuobianExportPanel({
  storeId,
  getToken,
  onClose,
}: MaihuobianExportPanelProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<MaihuobianPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [checking, setChecking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [cleartextConfirmed, setCleartextConfirmed] = useState(false);
  const [downloadedCount, setDownloadedCount] = useState<number | null>(null);

  const checkOrders = async () => {
    if (!from || !to) {
      setError("請先選擇開始日期與結束日期");
      return;
    }
    setChecking(true);
    setError(null);
    setShowConfirmation(false);
    setDownloadedCount(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `/api/stores/${storeId}/orders/maihuobian-export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as MaihuobianPreview;
      setPreview(result);
      setSelectedIds(
        new Set(result.eligible.map((candidate) => candidate.orderId)),
      );
    } catch (caught) {
      setPreview(null);
      setSelectedIds(new Set());
      setError((caught as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const prepareExport = () => {
    if (selectedIds.size === 0) {
      setError("請至少勾選一筆可匯出訂單");
      return;
    }
    setError(null);
    setCleartextConfirmed(false);
    setShowConfirmation(true);
  };

  const downloadExport = async () => {
    if (!cleartextConfirmed || selectedIds.size === 0) return;
    setExporting(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `/api/stores/${storeId}/orders/maihuobian-export`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Confirm-Cleartext-Export": "true",
            "X-Confirm-Maihuobian-Export": "true",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            from,
            to,
            orderIds: [...selectedIds],
          }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as MaihuobianExportResult;
      const csv = `\uFEFF${formatMaihuobianCsv(
        result.eligible.map((candidate) => candidate.row),
      )}`;
      const objectUrl = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `maihuobian-orders-${from}-${to}.csv`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setDownloadedCount(result.eligibleCount);
      setShowConfirmation(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const toggleSelected = (orderId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
    setShowConfirmation(false);
  };

  return (
    <section
      aria-label="賣貨便匯出"
      className="mb-4 rounded-2xl border border-border bg-white p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-foreground">賣貨便匯出</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            先檢查資格，再下載官方欄序的 CSV 資料列。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 text-sm text-muted-foreground"
        >
          關閉
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">
          開始日期
          <input
            aria-label="開始日期"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-input px-3 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          結束日期
          <input
            aria-label="結束日期"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-input px-3 text-sm"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={checkOrders}
        disabled={checking}
        className="mt-3 min-h-11 w-full rounded-xl bg-secondary px-3 text-sm font-semibold text-foreground disabled:opacity-50"
      >
        {checking ? "檢查中…" : "檢查可匯出訂單"}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {downloadedCount !== null && (
        <p className="mt-3 text-sm text-green-700">
          已下載 {downloadedCount} 筆 CSV 資料。
        </p>
      )}

      {preview && (
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-green-700">
              可匯出（{preview.eligibleCount}）
            </h3>
            {preview.eligibleCount === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                這段日期沒有合格訂單。
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {preview.eligible.map((candidate) => (
                  <li key={candidate.orderId}>
                    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-green-200 px-3 text-sm">
                      <input
                        type="checkbox"
                        aria-label={`選取訂單 ${candidate.orderId}`}
                        checked={selectedIds.has(candidate.orderId)}
                        onChange={() => toggleSelected(candidate.orderId)}
                        className="h-4 w-4"
                      />
                      <span>
                        #{candidate.orderId} · {candidate.productSummary}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-amber-700">
              不可匯出（{preview.ineligibleCount}）
            </h3>
            {preview.ineligibleCount === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">無</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {preview.ineligible.map((candidate) => (
                  <li
                    key={candidate.orderId}
                    className="rounded-xl border border-amber-200 bg-amber-50 p-3"
                  >
                    <p className="text-sm font-semibold">
                      訂單 #{candidate.orderId}
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
                      {candidate.reasons.map((reason) => (
                        <li key={`${reason.field ?? ""}-${reason.code}`}>
                          {reason.message}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={prepareExport}
            disabled={selectedIds.size === 0}
            className="min-h-11 w-full rounded-xl bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            準備匯出 {selectedIds.size} 筆
          </button>
        </div>
      )}

      {showConfirmation && (
        <div
          role="dialog"
          aria-label="賣貨便匯出確認"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3"
        >
          <p className="text-sm font-bold text-red-800">
            將匯出 {selectedIds.size} 筆明文個資
          </p>
          <p className="mt-1 text-xs text-red-700">
            檔案包含姓名、手機與取件門市，只能用於本次賣貨便出貨，請妥善保管並於使用後刪除。
          </p>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cleartextConfirmed}
              onChange={(event) => setCleartextConfirmed(event.target.checked)}
              className="h-4 w-4"
            />
            我確認本檔僅用於賣貨便出貨
          </label>
          <button
            type="button"
            onClick={downloadExport}
            disabled={!cleartextConfirmed || exporting}
            className="mt-2 min-h-11 w-full rounded-xl bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {exporting ? "產生中…" : "確認並下載 CSV"}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            目前輸出 CSV 資料列；官方 XLSM 巨集範本套用尚未實作。
          </p>
        </div>
      )}
    </section>
  );
}
