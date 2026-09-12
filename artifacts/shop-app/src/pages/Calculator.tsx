import { useEffect, useReducer, useRef, useState } from "react";
import { useLocation } from "wouter";
import { BottomNav } from "@/pages/Dashboard";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { calculate, type Quote, type Result } from "@/lib/calculator/engine";
import {
  exact,
  money,
  percent,
  rate,
  type Amount,
} from "@/lib/calculator/decimal";
import {
  MODES,
  autoQ,
  emptyDrafts,
  parseInput,
  reduceDrafts,
  type Field,
  type Mode,
} from "@/lib/calculator/model";
import { readRate, removeRate, saveRate } from "@/lib/calculator/storage";
import {
  BOUTIQUE_TAX_FACTOR,
  BOUTIQUE_TIGERAIR_RATE_PER_KG,
  INPUT_LIMITS,
  IP_SCHEMES,
  IP_WEIGHT_GUIDE,
  PRICE_BOUNDARY_LABEL,
} from "@/lib/calculator/constants";
import "./calculator.css";

function revealFocusedControl(
  control: EventTarget | null,
  page: HTMLDivElement,
) {
  // React also bubbles focus from portalled dialogs. Their focus trap and the
  // fixed navigation manage their own layout; only reveal page content here.
  if (!(control instanceof HTMLElement) || !page.contains(control)) return;
  const navigation = page.querySelector("nav");
  if (navigation?.contains(control)) return;
  const viewport = window.visualViewport;
  const visibleTop = (viewport?.offsetTop ?? 0) + 12;
  const visibleBottom =
    Math.min(
      (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
      navigation?.getBoundingClientRect().top ?? window.innerHeight,
    ) - 12;
  const rect = control.getBoundingClientRect();
  if (
    visibleBottom > visibleTop &&
    (rect.bottom > visibleBottom || rect.top < visibleTop)
  ) {
    window.scrollBy({
      top: (rect.top + rect.bottom - visibleTop - visibleBottom) / 2,
      behavior: "instant",
    });
  }
}

function Metric({
  label,
  value,
  format = money,
}: {
  label: string;
  value: Amount;
  format?: (value: Amount) => string;
}) {
  return (
    <div className="calc-metric">
      <dt>{label}</dt>
      <dd title={exact(value)}>{format(value)}</dd>
    </div>
  );
}
function QuoteCard({
  quote,
  generalTraffic,
  showMargin,
}: {
  quote: Quote;
  generalTraffic?: boolean;
  showMargin?: boolean;
}) {
  return (
    <article className="calc-quote" data-testid={quote.id}>
      <h3>{quote.label}</h3>
      <p className="calc-sale">
        <span>NT$</span> {exact(quote.sale)}
      </p>
      <dl>
        <Metric
          label={generalTraffic ? "試算利潤（未扣本次交通費）" : "利潤"}
          value={quote.profit}
        />
        <Metric label="有效匯率" value={quote.effectiveRate} format={rate} />
        {showMargin && quote.margin && (
          <Metric label="利潤率" value={quote.margin} format={percent} />
        )}
      </dl>
      <WarningText quote={quote} />
    </article>
  );
}
function WarningText({ quote }: { quote: Quote }) {
  if (!quote.warning) return null;
  return (
    <p className="calc-warning" data-warning={quote.warning.type}>
      {quote.warning.type === "VIP_PRICE_BELOW_COST"
        ? "提醒：VIP 售價低於成本，請確認人工定價。"
        : `提醒：${quote.label}利潤低於 NT$${quote.warning.threshold}。可參考含重量比較，售價由您決定。`}
    </p>
  );
}
function CalculationAnnouncements({
  mode,
  context,
  result,
  invalidVip,
}: {
  mode: Mode;
  context: number;
  result?: Result;
  invalidVip: boolean;
}) {
  const [announcement, setAnnouncement] = useState({ context, message: "" });
  // Only warning identities/thresholds participate: changing an amount within
  // the same warning state must not cause repeated reading on every keystroke.
  const summary =
    result && !invalidVip
      ? result.quotes
          .filter((quote) => quote.warning)
          .map((quote) =>
            quote.warning!.type === "VIP_PRICE_BELOW_COST"
              ? "VIP 售價低於成本，請確認人工定價。"
              : `${mode === "ip" ? quote.id.split("-")[0] + " " : ""}${quote.label}利潤低於 NT$${quote.warning!.threshold}。`,
          )
          .join(" ")
      : null;
  useEffect(() => {
    // Incomplete input does not mean a warning has been resolved. Keep the
    // previous announcement until a valid, settled calculation is available.
    if (summary === null) return;
    const timer = window.setTimeout(() => {
      setAnnouncement((previous) => {
        const message = summary
          ? `${MODES[mode]}：${summary}售價不會自動調整。`
          : previous.context === context && previous.message
            ? `${MODES[mode]}：目前沒有低利潤或 VIP 低於成本提醒。`
            : "";
        return previous.context === context && previous.message === message
          ? previous
          : { context, message };
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [context, mode, summary]);
  return (
    <div
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="calculation-announcements"
    >
      {announcement.context === context ? announcement.message : ""}
    </div>
  );
}
function WeightNote({ result }: { result: Result }) {
  const weight = result.weight;
  if (!weight) return null;
  return (
    <div className="calc-weight-note" data-testid="weight-explanation">
      <strong>{IP_WEIGHT_GUIDE.factor} 重量參考</strong>
      {weight.kind === "zeroAir" ? (
        <p>
          空運單價為 0，重量不影響本次利潤；直接依未進位利潤是否低於 NT$
          {IP_WEIGHT_GUIDE.minimumProfit}
          提醒。
        </p>
      ) : weight.max.lt("0") ? (
        <p>
          即使重量為 0 g，原計算仍不足 NT${IP_WEIGHT_GUIDE.minimumProfit}{" "}
          利潤。反推上限約 {weight.max.toFixed(2)} g，沒有可保留{" "}
          {IP_WEIGHT_GUIDE.minimumProfit} 元利潤的非負重量。
        </p>
      ) : (
        <p>
          此價格及匯率下，保留 NT${IP_WEIGHT_GUIDE.minimumProfit}{" "}
          利潤的重量上限約 <strong>{weight.max.toFixed(2)} g</strong>。
          {weight.max.isZero() ? "僅重量為 0 g 時可達標。" : ""}{" "}
          此值僅供解釋，提醒依未進位利潤判斷。
        </p>
      )}
      <p>可參考含重量比較，不會自動提價或切換方案。</p>
      {weight.kind === "limit" && (
        <details>
          <summary>查看完整計算重量</summary>
          <p className="calc-exact">{exact(weight.max)} g（工作精度內數值）</p>
        </details>
      )}
    </div>
  );
}
function IpResults({ result }: { result: Result }) {
  return (
    <section className="calc-ip" aria-labelledby="ip-title">
      <div className="calc-section-heading">
        <h2 id="ip-title">五種倍率比較</h2>
        <p>原計算與含重量方案共用同一成本</p>
      </div>
      <div className="calc-ip-desktop">
        <table>
          <caption className="sr-only">IP 商品十組售價及利潤</caption>
          <thead>
            <tr>
              <th>倍率</th>
              <th>方案</th>
              <th>售價 NT$</th>
              <th>利潤 NT$</th>
              <th>有效匯率</th>
              <th>利潤率</th>
              <th>提醒</th>
            </tr>
          </thead>
          <tbody>
            {result.quotes.map((q) => (
              <tr key={q.id} data-testid={`table-${q.id}`}>
                <th scope="row">{q.id.split("-")[0]}</th>
                <td>{q.label}</td>
                <td>{exact(q.sale)}</td>
                <td title={exact(q.profit)}>{money(q.profit)}</td>
                <td>{rate(q.effectiveRate)}</td>
                <td>{q.margin ? percent(q.margin) : "—"}</td>
                <td>
                  <WarningText quote={q} />
                  {!q.warning && <span>達建議利潤</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="calc-ip-mobile">
        {IP_SCHEMES.map(({ factor }) => (
          <section key={factor} className="calc-panel">
            <h3 className="calc-factor">
              {factor} <span>倍率</span>
            </h3>
            <div className="calc-quotes">
              {result.quotes
                .filter((q) => q.id.startsWith(factor))
                .map((q) => (
                  <QuoteCard key={q.id} quote={q} showMargin />
                ))}
            </div>
            {factor === IP_WEIGHT_GUIDE.factor && (
              <WeightNote result={result} />
            )}
          </section>
        ))}
      </div>
      <div className="calc-ip-desktop">
        <WeightNote result={result} />
      </div>
    </section>
  );
}
export default function CalculatorPage() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("general");
  const [drafts, dispatch] = useReducer(reduceDrafts, undefined, emptyDrafts);
  const [memory, setMemory] = useState(readRate);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState("");
  const pointerInProgress = useRef(false);
  // Explicit draft-context changes invalidate old warnings synchronously, while
  // intermediate typing in the same draft keeps the existing debounce behavior.
  const [announcementContext, invalidateAnnouncements] = useReducer(
    (value: number) => value + 1,
    0,
  );
  const draft = drafts[mode];
  const { result, errors } = calculate(mode, draft, memory.value);
  const edit = (field: Field, value: string) => {
    dispatch({ type: "edit", mode, field, value });
    setNotice("");
  };
  const input = (field: Field, label: string, unit: string, hint?: string) => (
    <div className="calc-field" key={field}>
      <label htmlFor={`calc-${field}`}>
        {label} <span>{unit}</span>
      </label>
      <input
        id={`calc-${field}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft[field]}
        onChange={(event) => edit(field, event.target.value)}
        aria-invalid={!!draft[field] && !!errors[field]}
        aria-describedby={`calc-${field}-help`}
      />
      <p
        id={`calc-${field}-help`}
        className={draft[field] && errors[field] ? "calc-error" : "calc-hint"}
      >
        {draft[field] && errors[field]
          ? errors[field]
          : hint ||
            `最多 ${INPUT_LIMITS.standard.integer} 位整數、${INPUT_LIMITS.standard.fraction} 位小數`}
      </p>
    </div>
  );
  return (
    <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
      <div
        className="calculator-page bg-background text-foreground"
        onPointerDownCapture={() => {
          pointerInProgress.current = true;
        }}
        onPointerUpCapture={() => {
          pointerInProgress.current = false;
        }}
        onPointerCancelCapture={() => {
          pointerInProgress.current = false;
        }}
        onKeyDownCapture={() => {
          pointerInProgress.current = false;
        }}
        onFocus={(event) => {
          // Moving a control between pointer-down and pointer-up cancels its
          // activation. Keyboard/programmatic focus can be revealed immediately.
          if (!pointerInProgress.current)
            revealFocusedControl(event.target, event.currentTarget);
        }}
        onClick={(event) => {
          // Pointer activation has completed before adjusting the scroll position.
          revealFocusedControl(document.activeElement, event.currentTarget);
        }}
      >
        <header className="calc-header">
          <button
            type="button"
            className="calc-back"
            onClick={() => navigate("/settings")}
          >
            ‹ 設定
          </button>
          <div>
            <p className="calc-eyebrow">PIKA · 商家工具</p>
            <h1>價格計算機</h1>
            <p>輸入成本，即時比較售價與利潤。</p>
          </div>
          <span className="calc-badge">V2</span>
        </header>
        <main className="calc-main">
          <CalculationAnnouncements
            mode={mode}
            context={announcementContext}
            result={result}
            invalidVip={!!errors.vip}
          />
          <div className="calc-modes" role="group" aria-label="計算模式">
            {(Object.entries(MODES) as [Mode, string][]).map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={mode === key}
                onClick={() => {
                  if (mode !== key) invalidateAnnouncements();
                  setMode(key);
                  setNotice("");
                }}
              >
                {label}
                <small>
                  {key === "general" || key === "jam"
                    ? `日圓 ${PRICE_BOUNDARY_LABEL} 以下`
                    : key === "ip"
                      ? `日圓超過 ${PRICE_BOUNDARY_LABEL}`
                      : "退稅與人工 VIP"}
                </small>
              </button>
            ))}
          </div>
          <div className="calc-layout">
            <section
              className="calc-panel calc-inputs"
              aria-labelledby="inputs-title"
            >
              <div className="calc-section-heading">
                <h2 id="inputs-title">{MODES[mode]} · 商品資料</h2>
                <p>各模式保留本頁草稿，匯率四模式共用。</p>
              </div>
              <div className="calc-field">
                <label htmlFor="calc-rate">
                  日本匯率 <span>NT$／JPY</span>
                </label>
                <input
                  id="calc-rate"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={memory.value}
                  onChange={(e) =>
                    setMemory({
                      value: e.target.value,
                      message: saveRate(e.target.value),
                    })
                  }
                  aria-invalid={!!memory.value && !!errors.rate}
                  aria-describedby="calc-rate-help"
                />
                <p
                  id="calc-rate-help"
                  className={
                    memory.value && errors.rate ? "calc-error" : "calc-hint"
                  }
                >
                  {memory.value && errors.rate
                    ? errors.rate
                    : `手填；最多 ${INPUT_LIMITS.rate.integer} 位整數、${INPUT_LIMITS.rate.fraction} 位小數。只記住此瀏覽器。`}
                </p>
              </div>
              <p className="calc-memory" role="status">
                {memory.message}
              </p>
              {input("price", "商品原價", "JPY")}
              {input(
                "weight",
                "商品重量",
                "g",
                "請填實際重量；沒有重量費時可填 0",
              )}
              {mode === "boutique" && (
                <fieldset className="calc-tax">
                  <legend>退稅後價格 Q</legend>
                  <div className="calc-inline-actions">
                    <button
                      type="button"
                      aria-pressed={draft.qMode === "auto"}
                      onClick={() => dispatch({ type: "qMode", value: "auto" })}
                    >
                      恢復自動
                    </button>
                    <button
                      type="button"
                      aria-pressed={draft.qMode === "manual"}
                      onClick={() =>
                        dispatch({ type: "qMode", value: "manual" })
                      }
                    >
                      人工輸入
                    </button>
                  </div>
                  {draft.qMode === "auto" ? (
                    <div className="calc-auto">
                      <span>自動帶入 · 原價 × {BOUTIQUE_TAX_FACTOR}</span>
                      <output data-testid="auto-q">
                        {autoQ(draft.price) || "等待原價"}
                      </output>
                      <span>JPY</span>
                    </div>
                  ) : (
                    input(
                      "q",
                      "人工退稅後價格",
                      "JPY",
                      `最多 ${INPUT_LIMITS.manualQ.integer} 位整數、${INPUT_LIMITS.manualQ.fraction} 位小數；其他欄位變動不會覆蓋人工值`,
                    )
                  )}
                  <button
                    type="button"
                    className="calc-text-button"
                    disabled={!parseInput(draft.price, "price").value}
                    onClick={() => dispatch({ type: "noTax" })}
                  >
                    無退稅：設為原價
                  </button>
                  <p className="calc-hint">
                    {draft.qMode === "manual"
                      ? "目前使用人工值；所有相關結果仍即時計算。"
                      : "完整乘算值直接參與計算。"}
                  </p>
                </fieldset>
              )}
              {mode === "boutique" &&
                input(
                  "vip",
                  "VIP 售價（選填）",
                  "NT$",
                  "完全手填；留白時不顯示 VIP 計算結果",
                )}
              <div className="calc-divider" />
              <h3 className="calc-subheading">此模式費用</h3>
              {mode === "boutique" ? (
                <p className="calc-fixed">
                  虎航空運{" "}
                  <strong>NT${BOUTIQUE_TIGERAIR_RATE_PER_KG}／kg</strong>
                  <span>固定單價</span>
                </p>
              ) : (
                input("air", "空運單價", "NT$／kg")
              )}
              {input(
                "traffic",
                mode === "jam" ? "果醬獨立交通費" : "均攤交通費",
                "NT$",
              )}
              {mode === "general" && (
                <label className="calc-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.includeTraffic}
                    onChange={(e) =>
                      dispatch({
                        type: "trafficToggle",
                        value: e.target.checked,
                      })
                    }
                  />
                  <span>
                    是否將均攤交通費加到售價
                    <small>成本與試算利潤的成本基礎維持原公式</small>
                  </span>
                </label>
              )}
              <details className="calc-clear">
                <summary>清除與費用預設</summary>
                <button
                  type="button"
                  onClick={() => {
                    invalidateAnnouncements();
                    dispatch({ type: "clearProduct", mode });
                    setNotice("已清除此模式商品資料；匯率與費用保留。");
                  }}
                >
                  清除此模式商品資料
                </button>
                <p>清價格、重量、人工退稅價及 VIP；精品回到自動。</p>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: "resetFees", mode });
                    setNotice("已恢復此模式費用預設；商品與人工定價保留。");
                  }}
                >
                  恢復此模式費用預設
                </button>
                <p>只恢復空運、交通費；一般版另關閉交通費開關。</p>
                <AlertDialogTrigger asChild>
                  <button type="button">清除匯率記憶</button>
                </AlertDialogTrigger>
                <p>清除四模式共用匯率與瀏覽器記憶，保留商品草稿。</p>
              </details>
              <p role="status" className="calc-hint">
                {notice}
              </p>
            </section>
            <section className="calc-results" aria-labelledby="results-title">
              <div className="calc-section-heading">
                <h2 id="results-title">試算結果</h2>
                <p>警告只提醒，保留您的定價決定。</p>
              </div>
              {!result ? (
                <div className="calc-panel calc-empty">
                  <span aria-hidden="true">＋</span>
                  <h3>準備好資料，即可開始試算</h3>
                  <p>請完成有效的匯率、原價、重量與費用。結果會隨輸入更新。</p>
                </div>
              ) : (
                <>
                  <div className="calc-panel calc-cost">
                    <span>總成本 NT$</span>
                    <strong data-testid="total-cost" title={exact(result.cost)}>
                      {money(result.cost)}
                    </strong>
                    <dl>
                      <Metric
                        label="保本匯率（成本 ÷ 原價）"
                        value={result.breakEven}
                        format={rate}
                      />
                    </dl>
                    {mode === "general" && (
                      <p className="calc-hint">成本不含交通費。</p>
                    )}
                  </div>
                  {mode !== "ip" && (
                    <div className="calc-quotes">
                      {result.quotes.map((q) => (
                        <QuoteCard
                          key={q.id}
                          quote={q}
                          generalTraffic={
                            mode === "general" && draft.includeTraffic
                          }
                        />
                      ))}
                    </div>
                  )}
                  {mode === "boutique" &&
                    !result.quotes.some((q) => q.id === "vip") && (
                      <p className="calc-panel calc-hint">
                        {errors.vip
                          ? "VIP 輸入需修正；一般售價仍持續計算。"
                          : "VIP 售價留白，等待您的人工定價。"}
                      </p>
                    )}
                  {mode === "ip" && (
                    <p className="calc-panel">
                      下方列出五種倍率的原計算與含重量比較。成本中的空運費只計入一次。
                    </p>
                  )}
                  <details className="calc-panel calc-details">
                    <summary>成本明細與完整數值</summary>
                    <dl>
                      {result.costs.map((item) => (
                        <Metric
                          key={item.label}
                          label={item.label}
                          value={item.amount}
                          format={exact}
                        />
                      ))}
                      <Metric
                        label="總成本（未進位）"
                        value={result.cost}
                        format={exact}
                      />
                      {result.q && (
                        <Metric
                          label="使用中的 Q（JPY）"
                          value={result.q}
                          format={exact}
                        />
                      )}
                      {result.targetProfit && (
                        <Metric
                          label="定價目標利潤（不屬於成本）"
                          value={result.targetProfit}
                          format={exact}
                        />
                      )}
                    </dl>
                    {result.quotes.map((quote) => (
                      <section
                        key={quote.id}
                        data-testid={`exact-profit-${quote.id}`}
                      >
                        <h3>
                          {mode === "ip"
                            ? `${quote.id.split("-")[0]} ${quote.label}`
                            : quote.label}
                        </h3>
                        <dl>
                          <Metric
                            label="售價（原值）"
                            value={quote.sale}
                            format={exact}
                          />
                          <Metric
                            label="利潤（未進位）"
                            value={quote.profit}
                            format={exact}
                          />
                        </dl>
                        <p>
                          {quote.profitThreshold !== undefined
                            ? `提醒條件：未進位利潤低於 NT$${quote.profitThreshold}（等於不提醒）。`
                            : "此方案未設定低利潤提醒門檻。"}
                        </p>
                      </section>
                    ))}
                  </details>
                  <details className="calc-panel calc-details">
                    <summary>公式與進位說明</summary>
                    <p>
                      本次定價過程（NT$）：進位差額只影響售價，不重複加入成本。
                    </p>
                    {result.roundingSteps.map((step) => (
                      <div key={step.id} data-testid={`rounding-${step.id}`}>
                        <h3>{step.label}</h3>
                        <p>
                          {step.unit
                            ? `向上進位至 ${step.unit} 元`
                            : "依原公式保留原值，不進位"}
                        </p>
                        <dl>
                          <Metric
                            label="進位前金額"
                            value={step.before}
                            format={exact}
                          />
                          <Metric
                            label="本步驟結果"
                            value={step.after}
                            format={exact}
                          />
                          <Metric
                            label="本步驟進位差額"
                            value={step.difference}
                            format={exact}
                          />
                        </dl>
                      </div>
                    ))}
                    <p>VIP 沿用原減額或人工售價，不額外進位。</p>
                    {result.steps.map((step) => (
                      <p key={step}>{step}</p>
                    ))}
                    <p>
                      售價保留公式原值；成本、利潤顯示 2 位小數，匯率顯示 4
                      位。提醒使用未四捨五入數值，顯示格式不改變金額。
                    </p>
                  </details>
                </>
              )}
            </section>
          </div>
          {mode === "ip" && result && <IpResults result={result} />}
        </main>
        <AlertDialogContent className="w-[calc(100%-32px)] rounded-2xl">
          <AlertDialogTitle>清除匯率記憶？</AlertDialogTitle>
          <AlertDialogDescription>
            四個模式的共用匯率會清空。商品草稿與費用設定保留。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">取消</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={() => {
                invalidateAnnouncements();
                setMemory(removeRate());
              }}
            >
              確認清除匯率
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
        <BottomNav active="settings" />
      </div>
    </AlertDialog>
  );
}
