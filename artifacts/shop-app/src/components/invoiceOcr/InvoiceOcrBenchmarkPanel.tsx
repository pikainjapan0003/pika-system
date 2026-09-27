import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  InvoiceOcrSummary,
  InvoiceOcrTestCase,
} from "@/lib/invoiceOcrUi";

function modelLabel(model: string): string {
  if (model === "gpt-5.6-terra") return "Terra";
  if (model === "gpt-5.6-sol") return "Sol";
  if (model === "gpt-5.6-luna") return "Luna";
  return model;
}

function displayNumber(value: number | null, suffix = ""): string {
  return value === null ? "尚無資料" : `${Math.round(value).toLocaleString()}${suffix}`;
}

export function InvoiceOcrBenchmarkPanel({
  summary,
  testCases,
  downloading,
  onDownload,
  onSelectCase,
}: {
  summary: InvoiceOcrSummary | null;
  testCases: InvoiceOcrTestCase[];
  downloading: boolean;
  onDownload: () => Promise<void>;
  onSelectCase: (testCase: InvoiceOcrTestCase) => void;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-foreground">10 張測試統計</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            每個模型與設定分開計分，不會把不同測試混在一起。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={downloading || testCases.length === 0}
          onClick={() => void onDownload()}
        >
          <Download className="size-4" />
          {downloading ? "下載中…" : "下載 CSV"}
        </Button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryCard
              label="已建立照片"
              value={`${summary.totalTestCases} / 10`}
            />
            <SummaryCard label="辨識紀錄" value={summary.totalRuns} />
            <SummaryCard
              label="已測模型"
              value={summary.models.length}
            />
            <SummaryCard
              label="嚴重錯誤"
              value={summary.models.reduce(
                (total, item) =>
                  total + item.unsafeConfidentErrorCount,
                0,
              )}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">模型／固定設定</th>
                  <th className="px-3 py-2">格式</th>
                  <th className="px-3 py-2">店名</th>
                  <th className="px-3 py-2">日期</th>
                  <th className="px-3 py-2">總額</th>
                  <th className="px-3 py-2">幣別</th>
                  <th className="px-3 py-2">Token</th>
                  <th className="px-3 py-2">時間</th>
                  <th className="px-3 py-2">結果</th>
                </tr>
              </thead>
              <tbody>
                {summary.models.map((item) => (
                  <tr
                    key={[
                      item.requestedModel,
                      item.promptVersion,
                      item.imageDetail,
                      item.reasoningEffort,
                    ].join(":")}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-3">
                      <div className="font-semibold">
                        {modelLabel(item.requestedModel)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.promptVersion} · {item.imageDetail} ·{" "}
                        {item.reasoningEffort}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {item.structuredFormatCount}/{item.caseCount}
                    </td>
                    <td className="px-3 py-3">
                      {item.merchantNameCorrect}/{item.caseCount}
                    </td>
                    <td className="px-3 py-3">
                      {item.invoiceDateCorrect}/{item.caseCount}
                    </td>
                    <td className="px-3 py-3">
                      {item.totalAmountCorrect}/{item.caseCount}
                    </td>
                    <td className="px-3 py-3">
                      {item.currencyCorrect}/{item.caseCount}
                    </td>
                    <td className="px-3 py-3">
                      <div>{item.totalTokens.toLocaleString()} 總計</div>
                      <div className="text-xs text-muted-foreground">
                        中位數 {displayNumber(item.medianTokens)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {displayNumber(
                        item.medianLatencyMs === null
                          ? null
                          : item.medianLatencyMs / 1000,
                        " 秒",
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          item.passed
                            ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
                            : "rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
                        }
                      >
                        {item.passed ? "達到門檻" : "尚未通過"}
                      </span>
                    </td>
                  </tr>
                ))}
                {summary.models.length === 0 && (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-muted-foreground"
                      colSpan={9}
                    >
                      尚未執行任何模型。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-1 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            <p>{summary.benchmarkRule}</p>
            <p>{summary.billingNotice}</p>
          </div>
        </>
      )}

      <div>
        <h3 className="text-sm font-bold text-foreground">最近測試案例</h3>
        <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {testCases.map((testCase, index) => {
            const latest = testCase.runs?.[0]?.run;
            return (
              <button
                key={testCase.id}
                type="button"
                onClick={() => onSelectCase(testCase)}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/40"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {testCases.length - index}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {testCase.groundTruth.merchantName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {testCase.originalFilename}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {latest
                    ? latest.status === "completed"
                      ? "已完成"
                      : latest.status === "processing"
                        ? "辨識中"
                        : "失敗"
                    : "尚未辨識"}
                </span>
              </button>
            );
          })}
          {testCases.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              尚未建立測試案例。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
