import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  InvoiceFields,
  InvoiceOcrReview,
  InvoiceOcrRun,
  InvoiceOcrTestCase,
} from "@/lib/invoiceOcrUi";

const FIELD_ROWS = [
  {
    key: "merchantName" as const,
    label: "店名",
    scoreKey: "merchantNameCorrect" as const,
  },
  {
    key: "invoiceDate" as const,
    label: "日期",
    scoreKey: "invoiceDateCorrect" as const,
  },
  {
    key: "totalAmount" as const,
    label: "總額",
    scoreKey: "totalAmountCorrect" as const,
  },
  {
    key: "currency" as const,
    label: "幣別",
    scoreKey: "currencyCorrect" as const,
  },
] as const;

function displayValue(value: string | null | undefined): string {
  return value === null || value === undefined || value === ""
    ? "無法確定"
    : value;
}

export function InvoiceOcrResultPanel({
  testCase,
  run,
  review,
  onSaveReview,
}: {
  testCase: InvoiceOcrTestCase;
  run: InvoiceOcrRun;
  review: InvoiceOcrReview | null;
  onSaveReview: (corrected: InvoiceFields | null) => Promise<void>;
}) {
  const [corrected, setCorrected] = useState({
    merchantName: "",
    invoiceDate: "",
    totalAmount: "",
    currency: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const source = review?.corrected ?? run.predicted;
    setCorrected({
      merchantName: source?.merchantName ?? "",
      invoiceDate: source?.invoiceDate ?? "",
      totalAmount: source?.totalAmount ?? "",
      currency: source?.currency ?? "",
    });
    setMessage("");
  }, [review, run]);

  if (run.status === "processing") {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <div>
            <h2 className="font-bold text-foreground">正在辨識</h2>
            <p className="text-sm text-muted-foreground">
              請保留此頁，完成或失敗後都會停止等待。
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (run.status === "failed" || !run.predicted) {
    return (
      <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 size-5 text-destructive" />
          <div>
            <h2 className="font-bold text-foreground">辨識失敗</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              錯誤代碼：{run.errorCode ?? "unknown"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {run.retryable
                ? "這類錯誤可由你明確確認後再試一次。"
                : "請先檢查原因，不要連續按重試。"}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const prediction = run.predicted;

  async function save(correctedValues: InvoiceFields | null) {
    setSaving(true);
    setMessage("");
    try {
      await onSaveReview(correctedValues);
      setMessage("人工複查已另外儲存，AI 原答案沒有被修改。");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "人工複查沒有儲存。",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-foreground">AI 原始預測</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            這些原答案已鎖定；人工修正會另外保存。
          </p>
        </div>
        <span
          className={
            prediction.reviewRequired
              ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900"
              : "rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-900"
          }
        >
          {prediction.reviewRequired ? "AI 要求特別複查" : "仍須人工確認"}
        </span>
      </div>

      <div
        className={
          prediction.reviewRequired
            ? "rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
            : "rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"
        }
      >
        {prediction.reviewRequired
          ? "AI 有標示疑慮，請逐欄查看原圖。"
          : "AI 未標示額外疑慮，但仍須人工確認。"}
        {prediction.reviewReasons.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {prediction.reviewReasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[72px_1fr_1fr_72px] gap-2 bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
          <span>欄位</span>
          <span>AI</span>
          <span>人工答案</span>
          <span>評分</span>
        </div>
        {FIELD_ROWS.map((field) => {
          const correct = review?.[field.scoreKey] ?? false;
          return (
            <div
              key={field.key}
              className="grid grid-cols-[72px_1fr_1fr_72px] gap-2 border-t border-border px-3 py-3 text-sm"
            >
              <span className="font-medium">{field.label}</span>
              <span className="break-words">
                {displayValue(prediction[field.key])}
              </span>
              <span className="break-words">
                {testCase.groundTruth[field.key]}
              </span>
              <span
                className={
                  correct
                    ? "inline-flex items-center gap-1 text-emerald-700"
                    : "inline-flex items-center gap-1 text-destructive"
                }
              >
                {correct ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <XCircle className="size-4" />
                )}
                {correct ? "正確" : "不同"}
              </span>
            </div>
          );
        })}
      </div>

      {review?.unsafeConfidentError && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            嚴重錯誤：AI 填了錯誤答案，卻沒有標示需要特別複查。
          </span>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-foreground">圖片內的簡短證據</h3>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {FIELD_ROWS.map((field) => (
            <div
              key={field.key}
              className="rounded-xl border border-border bg-background p-3"
            >
              <dt className="text-xs text-muted-foreground">{field.label}</dt>
              <dd className="mt-1 break-words text-sm">
                {displayValue(prediction.evidence[field.key])}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Metric label="模型" value={run.actualModel ?? run.requestedModel} />
        <Metric label="全部 Token" value={run.totalTokens ?? "未回報"} />
        <Metric
          label="處理時間"
          value={
            run.latencyMs === null
              ? "未回報"
              : `${(run.latencyMs / 1000).toFixed(1)} 秒`
          }
        />
        <Metric label="提示詞版本" value={run.promptVersion} />
        <Metric label="輸入 Token" value={run.inputTokens ?? "未回報"} />
        <Metric label="輸出 Token" value={run.outputTokens ?? "未回報"} />
        <Metric
          label="快取 Token"
          value={run.cachedInputTokens ?? "未回報"}
        />
        <Metric
          label="推理 Token"
          value={run.reasoningTokens ?? "未回報"}
        />
      </div>

      <div className="rounded-xl border border-border bg-background p-4">
        <h3 className="font-bold text-foreground">人工複查</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          留空代表仍無法確定。這裡不會改掉上方的 AI 原答案。
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {FIELD_ROWS.map((field) => (
            <label key={field.key} className="space-y-1 text-sm">
              <span className="font-medium">{field.label}</span>
              <Input
                value={corrected[field.key]}
                onChange={(event) =>
                  setCorrected((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                placeholder="無法確定可留空"
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => void save(null)}
          >
            已確認，不修改
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() =>
              void save({
                merchantName: corrected.merchantName.trim() || null,
                invoiceDate: corrected.invoiceDate.trim() || null,
                totalAmount: corrected.totalAmount.trim() || null,
                currency: corrected.currency.trim() || null,
              })
            }
          >
            {saving ? "儲存中…" : "另外儲存修正"}
          </Button>
        </div>
        {message && (
          <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-semibold text-foreground">{value}</p>
    </div>
  );
}
