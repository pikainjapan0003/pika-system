import { useAuth } from "@clerk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useGetMyStore } from "@workspace/api-client-react";
import {
  formatApiTwd,
  formatConvertedAmount,
  OPERATING_COST_PENDING_LABEL,
  type OperatingCostCurrency,
} from "../lib/operatingCostDisplay";
import { BottomNav } from "./Dashboard";
import { DualCurrencyCalibrationField } from "../components/DualCurrencyCalibrationField";
import { LedgerLockStamp } from "../components/LedgerLockStamp";
import { SemanticStatePanel } from "../components/SemanticStatePanel";
import {
  K_DURATION,
  loadMotion,
  motionEnabled,
  PIKA_EASE,
  prefersReducedMotion,
} from "../lib/motion";

const inputClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground tabular-nums lining-nums";

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
type ReadyTripProfitProjection = {
  status: "ready";
  outcome: "LOSS" | "PROFIT_BELOW_SALARY_TARGET" | "SALARY_TARGET_MET";
  grossProfitSource: "UNIT" | "DAILY" | "REVENUE";
  grossProfitTwd: string;
  finalOperatingProfitTwd: string;
};
type PendingTripProfitProjection = {
  status: "pending_confirmation";
  grossProfitSource: "UNIT" | "DAILY" | "REVENUE";
  reason: string;
};
type ReadyTripProfit = {
  status: "ready";
  projections: {
    unit: ReadyTripProfitProjection | PendingTripProfitProjection;
    daily: ReadyTripProfitProjection | PendingTripProfitProjection;
  };
  operatingExpenseTwd: string;
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
    title: "固定費用（12 項）",
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

const OUTCOME_LABELS: Record<ReadyTripProfitProjection["outcome"], string> = {
  SALARY_TARGET_MET: "達成日薪目標",
  PROFIT_BELOW_SALARY_TARGET: "有利潤但未達日薪目標",
  LOSS: "虧損",
};

const OUTCOME_SURFACE: Record<ReadyTripProfitProjection["outcome"], string> = {
  SALARY_TARGET_MET: "bg-chart-3/10 text-chart-3",
  PROFIT_BELOW_SALARY_TARGET: "bg-accent/10 text-accent",
  LOSS: "bg-destructive/10 text-destructive",
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
  const [calibrationJpy, setCalibrationJpy] = useState("");
  const [totalItemQuantity, setTotalItemQuantity] = useState("");
  const [unitGrossProfitTwd, setUnitGrossProfitTwd] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // K3 展開收合（220–300ms）：摘要列固定、明細從其下展開；預設展開。
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [settleNonce, setSettleNonce] = useState(0);
  const settleRootRef = useRef<HTMLDivElement>(null);

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

  // K1｜數字結算（450–600ms）＋ SplitText（④）：只在一次重要重算完成時使用。
  // 首屏初值仍直接可讀（settleNonce 只在儲存成功後遞增，首次載入不播放；
  // deps 刻意不含 summary／tripId：切換行程的 load() 不會誤播結算）；
  // 「待確認」狀態完全不播放（紅線 4）；只對數字字元過渡（幣別符號、小數點、
  // 千分位不參與拆分動畫，tabular-nums 對齊由父層 class 保持）。
  useEffect(() => {
    if (settleNonce === 0 || !settleRootRef.current) return;
    if (!motionEnabled()) return;
    const root = settleRootRef.current;
    const amountEls = Array.from(
      root.querySelectorAll<HTMLElement>("[data-settle-amount]"),
    ).filter((el) => {
      const text = el.textContent ?? "";
      return text.length > 0 && !text.includes(OPERATING_COST_PENDING_LABEL);
    });
    if (amountEls.length === 0) return;
    let cleanup: (() => void) | undefined;
    void loadMotion().then(({ gsap, SplitText }) => {
      if (!gsap || !SplitText) return;
      const tl = gsap.timeline({
        defaults: { ease: PIKA_EASE.uiOut },
        onComplete: () => {
          // SplitText 拆分是暫時性 DOM；結束後還原，避免污染後續渲染
          splits.forEach((s) => s.revert());
        },
      });
      // SplitText 的型別不含建構子簽名；以回傳值結構收斂（revert 是實例方法）
      const splits: Array<{ revert: () => void }> = [];
      amountEls.forEach((el, index) => {
        const split = new SplitText(el, {
          type: "chars",
          charsClass: "settle-char",
        });
        splits.push(split);
        const digitChars = split.chars.filter((ch) =>
          /^[0-9]$/.test(ch.textContent ?? ""),
        );
        if (digitChars.length === 0) return;
        tl.fromTo(
          digitChars,
          { opacity: 0.55, y: 3 },
          {
            opacity: 1,
            y: 0,
            duration: 0.22,
            stagger: 0.02,
          },
          index * 0.06,
        );
      });
      tl.play();
      cleanup = () => {
        tl.kill();
        splits.forEach((s) => s.revert());
      };
    });
    return () => {
      cleanup?.();
    };
  }, [settleNonce]);

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
      // K1｜一次重要重算完成後，費用摘要與損益數字結算編排（450–600ms）
      setSettleNonce((n) => n + 1);
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

  /** K3｜展開收合（220–300ms）；摘要列固定、明細從其下展開，不得造成水平位移。 */
  const bodyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const k3Timers = useRef<Record<string, number>>({});
  // DESIGN.md K 類表：K3 展開收合 220–300ms（取 K_DURATION.expand = 250ms）。
  const k3CollapseMs = Math.round(K_DURATION.expand * 1000);

  // 清理未完成的 K3 計時器，避免組件卸載後仍操作節點。
  useEffect(() => {
    return () => {
      for (const key of Object.keys(k3Timers.current)) {
        window.clearTimeout(k3Timers.current[key]);
      }
    };
  }, []);

  function toggleSection(key: string) {
    const body = bodyRefs.current[key];
    const willCollapse = !collapsed[key];
    if (!body) {
      setCollapsed((current) => ({ ...current, [key]: willCollapse }));
      return;
    }
    // prefers-reduced-motion：不做高度動畫，直接切換；展開時內容仍完整可讀。
    if (prefersReducedMotion()) {
      body.hidden = willCollapse;
      body.setAttribute("aria-hidden", String(willCollapse));
      setCollapsed((current) => ({ ...current, [key]: willCollapse }));
      return;
    }
    window.clearTimeout(k3Timers.current[key]);
    body.style.transition =
      "height " + k3CollapseMs + "ms cubic-bezier(0.23, 1, 0.32, 1)";
    body.style.overflow = "hidden";
    if (willCollapse) {
      // 收合：先量目前高度再縮到 0；立即對螢幕閱讀器隱藏，
      // 動畫結束後補上 hidden 徹底移除。
      body.hidden = false;
      body.setAttribute("aria-hidden", "true");
      body.style.height = body.getBoundingClientRect().height + "px";
      void body.offsetHeight; // 強制 reflow，讓初始高度生效再過渡。
      body.style.height = "0px";
      k3Timers.current[key] = window.setTimeout(() => {
        body.style.transition = "";
        body.style.overflow = "";
        body.style.height = "";
        body.hidden = true;
      }, k3CollapseMs);
    } else {
      // 展開：從 0 長到完整高度，結束後恢復 auto（內容保持可讀）。
      body.hidden = false;
      body.setAttribute("aria-hidden", "false");
      body.style.height = "0px";
      void body.offsetHeight;
      body.style.height = body.scrollHeight + "px";
      k3Timers.current[key] = window.setTimeout(() => {
        body.style.transition = "";
        body.style.overflow = "";
        body.style.height = "";
      }, k3CollapseMs);
    }
    setCollapsed((current) => ({ ...current, [key]: willCollapse }));
  }

  function renderSection(config: (typeof SECTION_CONFIG)[number]) {
    if (!summary) return null;
    const section = summary.sections[config.key];
    const customEntries = section.entries.filter(
      (entry) => entry.categoryId == null,
    );

    if (section.categories.length === 0 && customEntries.length === 0) {
      return (
        <section
          key={config.key}
          data-cost-section={config.kind}
          className="space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          <h2 className="font-bold">{config.title}</h2>
          <SemanticStatePanel
            state={{
              kind: "empty",
              title: "尚無成本項目",
              reason: "此分類目前沒有可編輯的成本項目。",
            }}
          />
        </section>
      );
    }

    const isCollapsed = collapsed[config.key] ?? false;

    return (
      <section
        key={config.key}
        data-cost-section={config.kind}
        className="space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        {/* 摘要列固定；明細從其下展開（K3） */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">{config.title}</h2>
          <button
            type="button"
            aria-expanded={!isCollapsed}
            aria-label={
              isCollapsed ? `展開${config.title}` : `收合${config.title}`
            }
            onClick={() => toggleSection(config.key)}
            className="k8-press min-h-8 px-2 text-xs font-medium text-muted-foreground"
          >
            {isCollapsed ? "展開 ▾" : "收合 ▴"}
          </button>
        </div>
        <div
          ref={(node) => {
            bodyRefs.current[config.key] = node;
          }}
          className="space-y-3"
        >
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
                    className="h-11 w-full rounded-xl border border-input bg-background px-2 text-sm text-foreground"
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
                  <span className="mt-1 block break-words text-right text-xs tabular-nums lining-nums text-muted-foreground">
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
              <span>
                {entry.customLabel ?? entry.categoryName ?? "自訂項目"}
              </span>
              <span className="text-right tabular-nums lining-nums text-muted-foreground">
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
            <span className="tabular-nums lining-nums">
              {formatApiTwd(section.totalTwd)}
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-5 pb-4 pt-10">
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
          <SemanticStatePanel
            state={{
              kind: "loading",
              label: "載入中…",
              fallbackMessage: "正在讀取預估成本，請稍候。",
            }}
          />
        )}
        {error && (
          <SemanticStatePanel
            state={{
              kind: "inlineError",
              title: "操作未完成",
              message: error,
            }}
          />
        )}
        {message && (
          <p className="rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">
            {message}
          </p>
        )}
        {summary && (
          <>
            <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
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
              <DualCurrencyCalibrationField
                jpyValue={calibrationJpy}
                conversion={
                  exchangeRate.trim()
                    ? {
                        status: "ready",
                        twdDisplay: formatConvertedAmount(
                          calibrationJpy,
                          "JPY",
                          exchangeRate,
                        ),
                        exchangeRateDisplay: exchangeRate,
                        exchangeRateLocked: summary.estimateLocked,
                      }
                    : {
                        status: "pending",
                        reason: "尚未提供換算匯率",
                        exchangeRateLocked: summary.estimateLocked,
                      }
                }
                interaction={
                  summary.estimateLocked
                    ? {
                        mode: "disabled",
                        reason: "預估已鎖定，未解鎖前無法校準匯率。",
                      }
                    : {
                        mode: "editable",
                        onJpyValueChange: setCalibrationJpy,
                        onClear: () => setCalibrationJpy(""),
                      }
                }
                description="輸入一筆已知日圓金額，即時校準台幣換算與匯率。"
              />
              {summary.estimateModifiedAfterLock && (
                <p className="text-xs text-accent">
                  此預估曾在鎖定後解鎖修改，紀錄會永久保留。
                </p>
              )}
            </section>

            {SECTION_CONFIG.map(renderSection)}

            <section
              ref={settleRootRef}
              className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm"
            >
              <h2 className="font-bold">費用摘要</h2>
              {SECTION_CONFIG.map((config) => (
                <div
                  key={config.key}
                  className="flex items-center justify-between"
                >
                  <span>{config.feeLabel}</span>
                  <span className="tabular-nums lining-nums" data-settle-amount>
                    {formatApiTwd(summary.sections[config.key].paymentFeeTwd)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                <span>營業費用合計</span>
                <span className="tabular-nums lining-nums" data-settle-amount>
                  {summary.tripProfit.status === "ready"
                    ? formatApiTwd(summary.tripProfit.operatingExpenseTwd)
                    : OPERATING_COST_PENDING_LABEL}
                </span>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
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
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {(
                    [
                      ["unit", "UNIT｜單件毛利法"],
                      ["daily", "DAILY｜每日毛利法"],
                    ] as const
                  ).map(([key, title]) => {
                    const tripProfit = summary.tripProfit;
                    if (tripProfit.status !== "ready") return null;
                    const projection = tripProfit.projections[key];
                    return (
                      <div
                        key={key}
                        className="space-y-2 rounded-xl border p-3"
                      >
                        <h3 className="font-semibold">{title}</h3>
                        {projection.status === "ready" ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span>預估營業毛利</span>
                              <span
                                className="tabular-nums lining-nums"
                                data-settle-amount
                              >
                                {formatApiTwd(projection.grossProfitTwd)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>預估營業淨利</span>
                              <span
                                className="tabular-nums lining-nums"
                                data-settle-amount
                              >
                                {formatApiTwd(
                                  projection.finalOperatingProfitTwd,
                                )}
                              </span>
                            </div>
                            <p
                              className={`rounded-xl p-3 font-semibold ${OUTCOME_SURFACE[projection.outcome]}`}
                            >
                              結論：{OUTCOME_LABELS[projection.outcome]}
                            </p>
                          </>
                        ) : (
                          <SemanticStatePanel
                            state={{
                              kind: "pending",
                              title: OPERATING_COST_PENDING_LABEL,
                              reason: projection.reason,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <SemanticStatePanel
                  state={{
                    kind: "pending",
                    title: OPERATING_COST_PENDING_LABEL,
                    reason: summary.tripProfit.reason,
                  }}
                />
              )}
            </section>

            {summary.estimateLocked ? (
              <LedgerLockStamp
                estimateLocked
                reason="預估已鎖定，未解鎖前無法修改預估成本。"
                action={{
                  label: "解鎖估算",
                  onAction: () => void unlockEstimate(),
                }}
              />
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                className="k8-press min-h-11 flex-1 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
                disabled={saving || summary.estimateLocked}
                onClick={() => void save()}
              >
                儲存估算
              </button>
              {summary.estimateLocked ? null : (
                <button
                  type="button"
                  className="min-h-11 flex-1 rounded-xl border border-border bg-card"
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
