import { D, ceil1, ceil5, type Amount } from "./decimal";
import { parseInput, type Draft, type Field, type Mode } from "./model";
import {
  RULE_VERSION,
  ENGINEERING_CONTRACT_VERSION,
  BOUTIQUE_PROFIT,
  BOUTIQUE_TAX_FACTOR,
  BOUTIQUE_TIGERAIR_RATE_PER_KG,
  CREDIT_CARD_FEE_RATE,
  DEPARTMENT_STORE_FEE_RATE,
  GENERAL_PRICING,
  GRAMS_PER_KG,
  IP_SCHEMES,
  IP_WEIGHT_GUIDE,
  JAM_PRICING,
  PERCENT_SCALE,
  PRICE_BOUNDARY_JPY,
  PRICE_BOUNDARY_LABEL,
  ROUNDING_UNITS,
  VIP_MINIMUM_PROFIT,
} from "./constants";

const rulePercent = (value: string) =>
  new D(value).mul(PERCENT_SCALE).toFixed();
const costRateMultiplier = () => new D("1").plus(CREDIT_CARD_FEE_RATE);

export type Warning = {
  type: "PROFIT_BELOW_RECOMMENDED" | "VIP_PRICE_BELOW_COST";
  threshold: string;
};
export type Quote = {
  id: string;
  label: string;
  sale: Amount;
  profit: Amount;
  effectiveRate: Amount;
  margin: Amount | null;
  profitThreshold?: string;
  warning?: Warning;
};
export type WeightExplanation =
  | { kind: "limit"; max: Amount }
  | { kind: "zeroAir" };
export type Result = {
  readonly ruleVersion: typeof RULE_VERSION;
  readonly engineeringContractVersion: typeof ENGINEERING_CONTRACT_VERSION;
  cost: Amount;
  costs: { label: string; amount: Amount }[];
  breakEven: Amount;
  quotes: Quote[];
  q?: Amount;
  targetProfit?: Amount;
  weight?: WeightExplanation;
  steps: string[];
  roundingSteps: {
    id: string;
    label: string;
    unit: "1" | "5" | null;
    before: Amount;
    after: Amount;
    difference: Amount;
  }[];
};
export type Calculation = {
  result?: Result;
  errors: Partial<Record<Field | "rate", string>>;
};
export function boutiqueProfit(q: Amount): Amount {
  for (const tier of BOUTIQUE_PROFIT.fixed)
    if (q.lt(tier.below)) return new D(tier.amount);
  for (const tier of BOUTIQUE_PROFIT.proportional)
    if (q.lt(tier.below)) return q.mul(tier.rate);
  return q.mul(BOUTIQUE_PROFIT.finalRate);
}
export function calculate(
  mode: Mode,
  draft: Draft,
  rawRate: string,
): Calculation {
  const errors: Calculation["errors"] = {};
  const values: Partial<Record<Field | "rate", Amount>> = {};
  for (const field of ["price", "weight", "air", "traffic", "rate"] as const) {
    const parsed = parseInput(
      field === "rate"
        ? rawRate
        : mode === "boutique" && field === "air"
          ? BOUTIQUE_TIGERAIR_RATE_PER_KG
          : draft[field],
      field,
    );
    if (parsed.error) errors[field] = parsed.error;
    else values[field] = parsed.value;
  }
  if (
    values.price &&
    (mode === "general" || mode === "jam") &&
    values.price.gt(PRICE_BOUNDARY_JPY)
  )
    errors.price = `此模式適用日圓價格 ${PRICE_BOUNDARY_LABEL} 以下`;
  if (values.price && mode === "ip" && values.price.lte(PRICE_BOUNDARY_JPY))
    errors.price = `IP 模式適用日圓價格超過 ${PRICE_BOUNDARY_LABEL}`;
  if (mode === "boutique" && draft.qMode === "manual") {
    const parsed = parseInput(draft.q, "q");
    if (parsed.error) errors.q = parsed.error;
    else values.q = parsed.value;
  }
  if (mode === "boutique" && draft.vip.trim()) {
    const parsed = parseInput(draft.vip, "vip");
    if (parsed.error) errors.vip = parsed.error;
    else values.vip = parsed.value;
  }
  if (Object.keys(errors).some((key) => key !== "vip")) return { errors };
  const p = values.price!,
    r = values.rate!,
    w = values.weight!,
    a = values.air!,
    t = values.traffic!;
  const q =
    mode === "boutique"
      ? draft.qMode === "auto"
        ? p.mul(BOUTIQUE_TAX_FACTOR)
        : values.q!
      : p;
  const converted = q.mul(r),
    air = w.div(GRAMS_PER_KG).mul(a),
    card = converted.mul(CREDIT_CARD_FEE_RATE);
  const costs = [
    {
      label: mode === "boutique" ? "退稅後換匯成本" : "商品換匯成本",
      amount: converted,
    },
    { label: "空運費", amount: air },
    { label: `刷卡手續費 ${rulePercent(CREDIT_CARD_FEE_RATE)}%`, amount: card },
  ];
  if (mode === "boutique")
    costs.push({
      label: `百貨手續費（原價 × 匯率 × ${rulePercent(DEPARTMENT_STORE_FEE_RATE)}%）`,
      amount: p.mul(r).mul(DEPARTMENT_STORE_FEE_RATE),
    });
  if (mode !== "general") costs.push({ label: "交通費", amount: t });
  const cost = costs.reduce((sum, item) => sum.plus(item.amount), new D("0"));
  const result: Result = {
    ruleVersion: RULE_VERSION,
    engineeringContractVersion: ENGINEERING_CONTRACT_VERSION,
    cost,
    costs,
    breakEven: cost.div(p),
    quotes: [],
    steps: [],
    roundingSteps: [],
  };
  // Record the actual operands at each existing rounding position. These
  // differences describe pricing only and are never added to product cost.
  const rounded = (
    id: string,
    label: string,
    before: Amount,
    unit: "1" | "5" | null,
  ) => {
    const after =
      unit === ROUNDING_UNITS.five
        ? ceil5(before)
        : unit === ROUNDING_UNITS.single
          ? ceil1(before)
          : before;
    result.roundingSteps.push({
      id,
      label,
      unit,
      before,
      after,
      difference: after.minus(before),
    });
    return after;
  };
  const quote = (
    id: string,
    label: string,
    sale: Amount,
    threshold?: string,
    vip = false,
  ) => {
    const profit = sale.minus(cost);
    const warning: Warning | undefined =
      threshold && profit.lt(threshold)
        ? { type: "PROFIT_BELOW_RECOMMENDED", threshold }
        : vip && sale.lt(cost)
          ? { type: "VIP_PRICE_BELOW_COST", threshold: VIP_MINIMUM_PROFIT }
          : undefined;
    result.quotes.push({
      id,
      label,
      sale,
      profit,
      effectiveRate: sale.div(q),
      margin: sale.isZero() ? null : profit.div(sale),
      profitThreshold: threshold ?? (vip ? VIP_MINIMUM_PROFIT : undefined),
      warning,
    });
  };
  if (mode === "general") {
    const base = rounded(
      "general-base",
      "一般售價：原級距進位",
      p.lte(GENERAL_PRICING.doubleCostMax)
        ? cost
            .mul(GENERAL_PRICING.doubleCostFactor)
            .plus(GENERAL_PRICING.doubleCostAddition)
        : cost.plus(
            p.lte(GENERAL_PRICING.middleMax)
              ? GENERAL_PRICING.middleAddition
              : p.lte(GENERAL_PRICING.upperMax)
                ? GENERAL_PRICING.upperAddition
                : GENERAL_PRICING.lastAddition,
          ),
      ROUNDING_UNITS.five,
    );
    const sale = draft.includeTraffic
      ? rounded(
          "general-traffic",
          "一般售價：加交通費後第二次進位",
          base.plus(t),
          ROUNDING_UNITS.five,
        )
      : base;
    quote("general", "一般售價", sale);
    quote(
      "vip",
      "VIP 售價",
      sale.minus(
        draft.includeTraffic
          ? GENERAL_PRICING.trafficVipDiscount
          : GENERAL_PRICING.vipDiscount,
      ),
    );
    result.steps = [
      `成本 C = P × R + W ÷ ${GRAMS_PER_KG} × A + P × R × ${CREDIT_CARD_FEE_RATE}，不含交通費。`,
      `原價 P ≤ ${GENERAL_PRICING.doubleCostMax}：C × ${GENERAL_PRICING.doubleCostFactor} + ${GENERAL_PRICING.doubleCostAddition}；P ≤ ${GENERAL_PRICING.middleMax}：C + ${GENERAL_PRICING.middleAddition}；P ≤ ${GENERAL_PRICING.upperMax}：C + ${GENERAL_PRICING.upperAddition}；P ≤ ${PRICE_BOUNDARY_JPY}：C + ${GENERAL_PRICING.lastAddition}。上述金額向上進位至 ${ROUNDING_UNITS.five} 元，得到原售價。`,
      draft.includeTraffic
        ? `開啟交通費：原售價加交通費後，再向上進位至 ${ROUNDING_UNITS.five} 元；VIP 減 ${GENERAL_PRICING.trafficVipDiscount} 元。試算利潤未扣本次交通費。`
        : `VIP 為一般售價減 ${GENERAL_PRICING.vipDiscount} 元；成本不含交通費。`,
    ];
  } else if (mode === "jam") {
    const addition = JAM_PRICING.tiers.find((tier) =>
      p.lte(tier.max),
    )!.addition;
    const sale = rounded(
      "jam-general",
      "果醬一般售價",
      cost.plus(addition),
      ROUNDING_UNITS.five,
    );
    quote("general", "一般售價", sale);
    quote("vip", "VIP 售價", sale.minus(JAM_PRICING.vipDiscount));
    result.steps = [
      `成本 C = P × R + W ÷ ${GRAMS_PER_KG} × A + P × R × ${CREDIT_CARD_FEE_RATE} + T。交通費為果醬獨立設定。`,
      `原價 ${JAM_PRICING.tiers.map((tier) => `P ≤ ${tier.max}：C + ${tier.addition}`).join("；")}。`,
      `成本已含此模式獨立交通費，加 ${addition} 元後向上進位至 ${ROUNDING_UNITS.five} 元。VIP 減 ${JAM_PRICING.vipDiscount} 元。`,
    ];
  } else if (mode === "ip") {
    for (const {
      factor,
      minimumProfit: threshold,
      addTraffic,
      originalRounding,
    } of IP_SCHEMES) {
      const base = p.mul(factor).plus(addTraffic ? t : "0");
      quote(
        `${factor}-original`,
        "原計算",
        rounded(
          `${factor}-original`,
          `${factor} 原計算`,
          base,
          originalRounding,
        ),
        threshold,
      );
      quote(
        `${factor}-weight`,
        "含重量比較",
        rounded(
          `${factor}-weight`,
          `${factor} 含重量比較`,
          base.plus(air),
          ROUNDING_UNITS.single,
        ),
        threshold,
      );
    }
    result.weight = a.isZero()
      ? { kind: "zeroAir" }
      : {
          kind: "limit",
          max: p
            .mul(
              new D(IP_WEIGHT_GUIDE.factor).minus(r.mul(costRateMultiplier())),
            )
            .minus(IP_WEIGHT_GUIDE.minimumProfit)
            .mul(GRAMS_PER_KG)
            .div(a),
        };
    result.steps = [
      `成本 C = P × R + W ÷ ${GRAMS_PER_KG} × A + P × R × ${CREDIT_CARD_FEE_RATE} + T。利潤 = 售價 − C；利潤率 = 利潤 ÷ 售價；有效匯率 = 售價 ÷ P。`,
      `${IP_SCHEMES[0].factor} 原計算：P × ${IP_SCHEMES[0].factor}；${IP_SCHEMES[1].factor} 原計算：P × ${IP_SCHEMES[1].factor} + T，向上進位至 ${IP_SCHEMES[1].originalRounding} 元。`,
      `${IP_SCHEMES.filter(
        (scheme) => scheme.addTraffic && scheme.originalRounding === null,
      )
        .map((scheme) => scheme.factor)
        .join("／")} 原計算：P × 倍率 + T，保留原值。`,
      `含重量比較：原倍率金額加一次空運費，再向上進位至 ${ROUNDING_UNITS.single} 元；兩方案使用同一成本。`,
      `${IP_WEIGHT_GUIDE.factor} 利潤 = P × (${IP_WEIGHT_GUIDE.factor} − R × ${costRateMultiplier().toFixed()}) − W ÷ ${GRAMS_PER_KG} × A。低於 ${IP_WEIGHT_GUIDE.minimumProfit} 元才提醒，所有價格皆適用。`,
      `A > 0 時 Wmax = ${GRAMS_PER_KG} × [P × (${IP_WEIGHT_GUIDE.factor} − R × ${costRateMultiplier().toFixed()}) − ${IP_WEIGHT_GUIDE.minimumProfit}] ÷ A。重量上限僅作解釋；警告直接比較未進位利潤。`,
    ];
  } else {
    result.q = q;
    result.targetProfit = boutiqueProfit(q);
    quote(
      "general",
      "一般售價",
      rounded(
        "boutique-general",
        "精品一般售價",
        cost.plus(result.targetProfit),
        ROUNDING_UNITS.single,
      ),
    );
    if (values.vip) quote("vip", "VIP 手填售價", values.vip, undefined, true);
    result.steps = [
      `自動退稅後價格 Q = 原價 P × ${BOUTIQUE_TAX_FACTOR}；人工模式保留您的輸入，直到恢復自動。`,
      `成本 C = Q × R + W ÷ ${GRAMS_PER_KG} × ${BOUTIQUE_TIGERAIR_RATE_PER_KG} + Q × R × ${CREDIT_CARD_FEE_RATE} + P × R × ${DEPARTMENT_STORE_FEE_RATE} + T。`,
      `目標利潤：Q ${BOUTIQUE_PROFIT.fixed.map((tier) => `< ${tier.below}：${tier.amount}`).join("；")}；${BOUTIQUE_PROFIT.proportional.map((tier) => `< ${tier.below}：Q × ${rulePercent(tier.rate)}%`).join("；")}；其餘 Q × ${rulePercent(BOUTIQUE_PROFIT.finalRate)}%。`,
      `一般售價 = 成本 + 目標利潤，向上進位至 ${ROUNDING_UNITS.single} 元。VIP 完全手填。保本匯率分母為 P，售價有效匯率分母為 Q。`,
    ];
  }
  result.steps.unshift(
    "P 為商品原價（JPY），R 為日本匯率，W 為重量（g），A 為空運單價（NT$／kg），T 為交通費（NT$）。",
  );
  return { result, errors };
}
