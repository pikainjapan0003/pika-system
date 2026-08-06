import { useAuth } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useGetMyStore } from "@workspace/api-client-react";
import {
  formatApiTwd,
  formatConvertedAmount,
  OPERATING_COST_PENDING_LABEL,
  type OperatingCostCurrency,
} from "../lib/operatingCostDisplay";
import { BottomNav } from "./Dashboard";

const inputClass =
  "h-11 w-full rounded-xl border border-input bg-white px-3 text-sm text-foreground";

type CostCategoryKind = "FIXED" | "VARIABLE" | "PURCHASE";
type Category = {
  id: number;
  code: string;
  name: string;
  kind: CostCategoryKind;
};
type Entry = {
  id: number;
  categoryId: number | null;
  categoryName?: string | null;
  customLabel?: string | null;
  originalAmount: string;
  currency: OperatingCostCurrency;
  categoryKind: CostCategoryKind;
};
type Section = {
  status: "ready" | "pending_confirmation";
  reason?: string;
  entries: Entry[];
  categories: Category[];
  jpyOriginTwd: string | null;
  twdDirectTwd: string | null;
  totalTwd: string | null;
  paymentFeeTwd: string | null;
};
type ReadyTripProfit = {
  status: "ready";
  outcome: "LOSS" | "PROFIT_BELOW_SALARY_TARGET" | "SALARY_TARGET_MET";
  grossProfitSource: "UNIT" | "REVENUE";
  grossProfitTwd: string;
  operatingExpenseTwd: string;
  finalOperatingProfitTwd: string;
  fixedPaymentFeeTwd: string;
  variablePaymentFeeTwd: string;
  purchasePaymentFeeTwd: string;
};
type PendingTripProfit = {
  status: "pending_confirmation";
  reason: string;
};
type Summary = {
  mode: "ESTIMATE";
  status: "ready" | "pending_confirmation";
  exchangeRate: string | null;
  totalItemQuantity: number | null;
  unitGrossProfitTwd: string | null;
  entries: Entry[];
  categories: Category[];
  sections: {
    fixed: Section;
    variable: Section;
    purchase: Section;
  };
  tripProfit: ReadyTripProfit | PendingTripProfit;
  estimateLocked: boolean;
  estimateModifiedAfterLock: boolean;
};

const SECTION_CONFIG: Array<{
  key: keyof Summary["sections"];
  kind: CostCategoryKind;
  title: string;
  feeLabel: string;
}> = [
  {
    key: "fixed",
    kind: "FIXED",
    title: "固定費用（11 項）",
    feeLabel: "固定金流費用",
  },
  {
    key: "variable",
    kind: "VARIABLE",
    title: "變動費用（7 項）",
    feeLabel: "變動金流費用",
  },
  {
    key: "purchase",
    kind: "PURCHASE",
    title: "採購成本（1 項）",
    feeLabel: "採購金流費用",
  },
];

const OUTCOME_LABELS: Record<ReadyTripProfit["outcome"], string> = {
  SALARY_TARGET_MET: "達成日薪目標",
  PROFIT_BELOW_SALARY_TARGET: "有利潤但未達日薪目標",
  LOSS: "虧損",
};

export default function TripEstimatePage({ tripId }: { tripId: number }) {
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { data: store } = useGetMyStore();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [currencies, setCurrencies] = useState<
    Record<number, OperatingCostCurrency>
  >({});
  const [exchangeRate, setExchangeRate] = useState("");
  const [totalItemQuantity, setTotalItemQuantity] = useState("");
  const [unitGrossProfitTwd, setUnitGrossProfitTwd] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(path: string, init?: RequestInit) {
    const token = await getToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "無法完成操作");
    return payload;
  }

  async function load() {
    if (!store?.id) return;
    setLoading(true);
    setError("");
    try {
      const payload = (await request(
        `/api/stores/${store.id}/trips/${tripId}/operating-summary?mode=ESTIMATE`,
      )) as Summary;
      setSummary(payload);
      setExchangeRate(payload.exchangeRate ?? "");
      setTotalItemQuantity(
        payload.totalItemQuantity == null
          ? ""
          : String(payload.totalItemQuantity),
      );
      setUnitGrossProfitTwd(payload.unitGrossProfitTwd ?? "");
      setValues(
        Object.fromEntries(
          payload.entries
            .filter((entry) => entry.categoryId != null)
            .map((entry) => [entry.categoryId as number, entry.originalAmount]),
        ),
      );
      const loadedCurrencies = Object.fromEntries(
        payload.categories.map((category) => [category.id, "TWD"]),
      ) as Record<number, OperatingCostCurrency>;
      for (const entry of payload.entries) {
        if (entry.categoryId != null) {
          loadedCurrencies[entry.categoryId] = entry.currency;
        }
      }
      setCurrencies(loadedCurrencies);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法載入預估成本");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [store?.id, tripId]);

  const categories = useMemo(
    () =>
      SECTION_CONFIG.flatMap(
        ({ key }) => summary?.sections[key].categories ?? [],
      ),
    [summary],
  );

  async function save() {
    if (!store?.id || !summary) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request(
        `/api/stores/${store.id}/trips/${tripId}/operating-inputs`,
        {
          method: "PATCH",
          body: JSON.stringify({
            exchangeRate: exchangeRate.trim() || null,
            totalItemQuantity: totalItemQuantity.trim() || null,
            unitGrossProfitTwd: unitGrossProfitTwd.trim() || null,
          }),
        },
      );
      const existingByCategory = new Map(
        summary.entries
          .filter((entry) => entry.categoryId != null)
          .map((entry) => [entry.categoryId as number, entry]),
      );
      for (const category of categories) {
        const originalAmount = (values[category.id] ?? "0").trim() || "0";
        const entryCurrency = currencies[category.id] ?? "TWD";
        const existing = existingByCategory.get(category.id);
        if (existing) {
          await request(
            `/api/stores/${store.id}/trips/${tripId}/cost-entries/${existing.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({ originalAmount, currency: entryCurrency }),
            },
          );
        } else {
          await request(
            `/api/stores/${store.id}/trips/${tripId}/cost-entries`,
            {
              method: "POST",
              body: JSON.stringify({
                mode: "ESTIMATE",
                categoryId: category.id,
                originalAmount,
                currency: entryCurrency,
              }),
            },
          );
        }
      }
      await load();
      setMessage("預估成本已儲存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function lockEstimate() {
    if (!store?.id) return;
    try {
      await request(`/api/stores/${store.id}/trips/${tripId}/close`, {
        method: "POST",
      });
      await load();
      setMessage("行程已結束，預估成本已鎖定");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "鎖定失敗");
    }
  }

  async function unlockEstimate() {
    if (!store?.id) return;
    try {
      await request(`/api/stores/${store.id}/trips/${tripId}/unlock-estimate`, {
        method: "POST",
      });
      await load();
      setMessage("已解鎖預估；之後的修改會永久留下標記");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "解鎖失敗");
    }
  }

  function renderSection(config: (typeof SECTION_CONFIG)[number]) {
    if (!summary) return null;
    const section = summary.sections[config.key];
    const customEntries = section.entries.filter(
      (entry) => entry.categoryId == null,
    );

    return (
      <section
        key={config.key}
        data-cost-section={config.kind}
        className="space-y-3 rounded-2xl border border-border bg-white p-4"
      >
        <h2 className="font-bold">{config.title}</h2>
        {section.categories.map((category) => {
          const entryCurrency = currencies[category.id] ?? "TWD";
          return (
            <div
              key={category.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_5.5rem] items-start gap-2 text-sm"
            >
              <span className="pt-3 text-muted-foreground">
                {category.name}
              </span>
              <input
                aria-label={category.name}
                className={inputClass}
                value={values[category.id] ?? "0"}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [category.id]: event.target.value,
                  }))
                }
                inputMode="decimal"
              />
              <div className="min-w-0">
                <select
                  aria-label={`${category.name}幣別`}
                  className="h-11 w-full rounded-xl border border-input bg-white px-2 text-sm text-foreground"
                  value={entryCurrency}
                  onChange={(event) =>
                    setCurrencies((current) => ({
                      ...current,
                      [category.id]: event.target
                        .value as OperatingCostCurrency,
                    }))
                  }
                >
                  <option value="TWD">TWD</option>
                  <option value="JPY">JPY</option>
                </select>
                <span className="mt-1 block break-words text-right text-xs text-muted-foreground">
                  {formatConvertedAmount(
                    values[category.id] ?? "0",
                    entryCurrency,
                    exchangeRate,
                  )}
                </span>
              </div>
            </div>
          );
        })}
        {customEntries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm"
          >
            <span>{entry.customLabel ?? entry.categoryName ?? "自訂項目"}</span>
            <span className="text-right text-muted-foreground">
              {entry.currency} {entry.originalAmount}
              <br />
              {formatConvertedAmount(
                entry.originalAmount,
                entry.currency,
                exchangeRate,
              )}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
          <span>{config.title.replace(/（.*$/, "合計")}</span>
          <span>{formatApiTwd(section.totalTwd)}</span>
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-5 pb-4 pt-10">
        <div className="mx-auto flex max-w-[480px] items-center gap-3">
          <button
            type="button"
            className="min-h-11 text-sm text-primary"
            onClick={() => setLocation("/trips")}
          >
            返回
          </button>
          <h1 className="flex-1 text-center text-lg font-bold">
            行程成本｜預估
          </h1>
          <div className="w-12" />
        </div>
      </header>
      <main className="mx-auto max-w-[480px] space-y-4 px-5 py-5">
        {loading && (
          <p className="text-center text-sm text-muted-foreground">載入中…</p>
        )}
        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">
            {message}
          </p>
        )}
        {summary && (
          <>
            <section className="rounded-2xl border border-border bg-white p-4">
              <label className="block text-sm font-semibold">
                估算匯率（JPY → TWD）
                <input
                  aria-label="估算匯率"
                  className={`${inputClass} mt-2`}
                  value={exchangeRate}
                  onChange={(event) => setExchangeRate(event.target.value)}
                  inputMode="decimal"
                />
              </label>
              {summary.estimateModifiedAfterLock && (
                <p className="mt-2 text-xs text-amber-700">
                  此預估曾在鎖定後解鎖修改，紀錄會永久保留。
                </p>
              )}
            </section>

            {SECTION_CONFIG.map(renderSection)}

            <section className="space-y-2 rounded-2xl border border-border bg-white p-4 text-sm">
              <h2 className="font-bold">費用摘要</h2>
              {SECTION_CONFIG.map((config) => (
                <div
                  key={config.key}
                  className="flex items-center justify-between"
                >
                  <span>{config.feeLabel}</span>
                  <span>
                    {formatApiTwd(summary.sections[config.key].paymentFeeTwd)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                <span>營業費用合計</span>
                <span>
                  {summary.tripProfit.status === "ready"
                    ? formatApiTwd(summary.tripProfit.operatingExpenseTwd)
                    : OPERATING_COST_PENDING_LABEL}
                </span>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-border bg-white p-4">
              <h2 className="font-bold">整趟損益預估</h2>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  預估件數
                  <input
                    aria-label="預估件數"
                    className={`${inputClass} mt-1`}
                    value={totalItemQuantity}
                    onChange={(event) =>
                      setTotalItemQuantity(event.target.value)
                    }
                    inputMode="numeric"
                  />
                </label>
                <label className="block text-sm">
                  單件毛利
                  <input
                    aria-label="單件毛利"
                    className={`${inputClass} mt-1`}
                    value={unitGrossProfitTwd}
                    onChange={(event) =>
                      setUnitGrossProfitTwd(event.target.value)
                    }
                    inputMode="decimal"
                  />
                </label>
              </div>
              {summary.tripProfit.status === "ready" ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>預估營業毛利</span>
                    <span>
                      {formatApiTwd(summary.tripProfit.grossProfitTwd)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>預估營業淨利</span>
                    <span>
                      {formatApiTwd(summary.tripProfit.finalOperatingProfitTwd)}
                    </span>
                  </div>
                  <p className="rounded-xl bg-muted p-3 font-semibold">
                    結論：{OUTCOME_LABELS[summary.tripProfit.outcome]}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-semibold">
                    {OPERATING_COST_PENDING_LABEL}
                  </p>
                  <p>{summary.tripProfit.reason}</p>
                </div>
              )}
            </section>

            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-xl bg-primary font-semibold text-white disabled:opacity-50"
                disabled={saving || summary.estimateLocked}
                onClick={() => void save()}
              >
                儲存估算
              </button>
              {summary.estimateLocked ? (
                <button
                  type="button"
                  className="min-h-11 flex-1 rounded-xl border border-primary text-primary"
                  onClick={() => void unlockEstimate()}
                >
                  解鎖估算
                </button>
              ) : (
                <button
                  type="button"
                  className="min-h-11 flex-1 rounded-xl border border-border bg-white"
                  onClick={() => void lockEstimate()}
                >
                  結束並鎖定
                </button>
              )}
            </div>
          </>
        )}
      </main>
      <BottomNav active="settings" />
    </div>
  );
}
