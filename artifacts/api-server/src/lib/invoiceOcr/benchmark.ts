import { arithmeticMean, median } from "./normalization.ts";

export interface InvoiceBenchmarkRecord {
  testCaseId: number;
  runId: number;
  requestedModel: string;
  promptVersion: string;
  imageDetail: string;
  reasoningEffort: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  merchantNameCorrect: boolean | null;
  invoiceDateCorrect: boolean | null;
  totalAmountCorrect: boolean | null;
  currencyCorrect: boolean | null;
  unsafeConfidentError: boolean | null;
  createdAt: Date;
}

export interface InvoiceBenchmarkGroupSummary {
  requestedModel: string;
  promptVersion: string;
  imageDetail: string;
  reasoningEffort: string;
  caseCount: number;
  structuredFormatCount: number;
  merchantNameCorrect: number;
  invoiceDateCorrect: number;
  totalAmountCorrect: number;
  currencyCorrect: number;
  unsafeConfidentErrorCount: number;
  totalTokens: number;
  averageTokens: number | null;
  medianTokens: number | null;
  averageLatencyMs: number | null;
  medianLatencyMs: number | null;
  passed: boolean;
}

function configurationKey(record: InvoiceBenchmarkRecord): string {
  return [
    record.requestedModel,
    record.promptVersion,
    record.imageDetail,
    record.reasoningEffort,
  ].join("\u0000");
}

export function selectCanonicalBenchmarkRuns(
  records: readonly InvoiceBenchmarkRecord[],
): InvoiceBenchmarkRecord[] {
  const sorted = [...records].sort((left, right) => {
    const timeDifference =
      left.createdAt.getTime() - right.createdAt.getTime();
    return timeDifference === 0 ? left.runId - right.runId : timeDifference;
  });
  const selected = new Map<string, InvoiceBenchmarkRecord>();
  for (const record of sorted) {
    const key = `${configurationKey(record)}\u0000${record.testCaseId}`;
    if (!selected.has(key)) selected.set(key, record);
  }
  return [...selected.values()];
}

function countTrue(
  records: readonly InvoiceBenchmarkRecord[],
  selector: (record: InvoiceBenchmarkRecord) => boolean | null,
): number {
  return records.reduce(
    (total, record) => total + (selector(record) === true ? 1 : 0),
    0,
  );
}

export function summarizeInvoiceBenchmark(
  records: readonly InvoiceBenchmarkRecord[],
): InvoiceBenchmarkGroupSummary[] {
  const canonical = selectCanonicalBenchmarkRuns(records);
  const groups = new Map<string, InvoiceBenchmarkRecord[]>();
  for (const record of canonical) {
    const key = configurationKey(record);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const first = group[0];
      const structuredFormatCount = group.filter(
        (record) => record.status === "completed",
      ).length;
      const merchantNameCorrect = countTrue(
        group,
        (record) => record.merchantNameCorrect,
      );
      const invoiceDateCorrect = countTrue(
        group,
        (record) => record.invoiceDateCorrect,
      );
      const totalAmountCorrect = countTrue(
        group,
        (record) => record.totalAmountCorrect,
      );
      const currencyCorrect = countTrue(
        group,
        (record) => record.currencyCorrect,
      );
      const unsafeConfidentErrorCount = countTrue(
        group,
        (record) => record.unsafeConfidentError,
      );
      const tokenValues = group
        .map((record) => record.totalTokens)
        .filter((value): value is number => value !== null);
      const latencyValues = group
        .map((record) => record.latencyMs)
        .filter((value): value is number => value !== null);
      const caseCount = group.length;
      return {
        requestedModel: first.requestedModel,
        promptVersion: first.promptVersion,
        imageDetail: first.imageDetail,
        reasoningEffort: first.reasoningEffort,
        caseCount,
        structuredFormatCount,
        merchantNameCorrect,
        invoiceDateCorrect,
        totalAmountCorrect,
        currencyCorrect,
        unsafeConfidentErrorCount,
        totalTokens: tokenValues.reduce((sum, value) => sum + value, 0),
        averageTokens: arithmeticMean(tokenValues),
        medianTokens: median(tokenValues),
        averageLatencyMs: arithmeticMean(latencyValues),
        medianLatencyMs: median(latencyValues),
        passed:
          caseCount === 10 &&
          structuredFormatCount === 10 &&
          merchantNameCorrect >= 8 &&
          invoiceDateCorrect >= 9 &&
          totalAmountCorrect >= 9 &&
          currencyCorrect >= 9 &&
          unsafeConfidentErrorCount === 0,
      };
    })
    .sort((left, right) =>
      left.requestedModel.localeCompare(right.requestedModel),
    );
}
