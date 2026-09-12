import { D, type Amount } from "./decimal";
import { BOUTIQUE_TAX_FACTOR, DEFAULT_FEES, INPUT_LIMITS } from "./constants";

export const MODES = {
  general: "一般版",
  jam: "輕井澤果醬",
  ip: "IP 商品",
  boutique: "精品",
} as const;
export type Mode = keyof typeof MODES;
export type Field = "price" | "weight" | "air" | "traffic" | "q" | "vip";
export type Draft = Record<Field, string> & {
  qMode: "auto" | "manual";
  includeTraffic: boolean;
};
export const defaultAir = (mode: Mode) => DEFAULT_FEES[mode].air;
export const emptyDraft = (mode: Mode): Draft => ({
  price: "",
  weight: "",
  air: defaultAir(mode),
  traffic: DEFAULT_FEES[mode].traffic,
  q: "",
  vip: "",
  qMode: "auto",
  includeTraffic: false,
});
export type Drafts = Record<Mode, Draft>;
export const emptyDrafts = (): Drafts => ({
  general: emptyDraft("general"),
  jam: emptyDraft("jam"),
  ip: emptyDraft("ip"),
  boutique: emptyDraft("boutique"),
});

export type Parsed =
  | { value: Amount; error?: never }
  | { value?: never; error: string };
export function parseInput(raw: string, field: Field | "rate"): Parsed {
  const text = raw.trim();
  if (!text || text === "." || /^\d+\.$/.test(text))
    return { error: "請完成輸入" };
  if (!/^(?:\d+|\d*\.\d+)$/.test(text))
    return { error: "請輸入非負十進位數字，不使用逗號或科學記號" };
  const [integer, fraction = ""] = text.split(".");
  const { integer: maxInteger, fraction: maxFraction } =
    field === "rate"
      ? INPUT_LIMITS.rate
      : field === "q"
        ? INPUT_LIMITS.manualQ
        : INPUT_LIMITS.standard;
  if ((integer || "0").length > maxInteger || fraction.length > maxFraction)
    return {
      error: `最多 ${maxInteger} 位整數、${maxFraction} 位小數；請自行調整`,
    };
  const value = new D(text);
  if (["price", "q", "rate"].includes(field) && value.lte("0"))
    return { error: "必須大於 0" };
  return { value };
}
export const autoQ = (price: string): string => {
  const parsed = parseInput(price, "price");
  return parsed.value ? parsed.value.mul(BOUTIQUE_TAX_FACTOR).toFixed() : "";
};

export type Action =
  | { type: "edit"; mode: Mode; field: Field; value: string }
  | { type: "qMode"; value: "auto" | "manual" }
  | { type: "noTax" }
  | { type: "trafficToggle"; value: boolean }
  | { type: "clearProduct" | "resetFees"; mode: Mode };
export function reduceDrafts(state: Drafts, action: Action): Drafts {
  const mode =
    "mode" in action
      ? action.mode
      : action.type === "trafficToggle"
        ? "general"
        : "boutique";
  const next = { ...state[mode] };
  switch (action.type) {
    case "edit":
      next[action.field] = action.value;
      break;
    case "qMode":
      if (action.value === "manual" && next.qMode === "auto")
        next.q = autoQ(next.price);
      next.qMode = action.value;
      break;
    case "noTax":
      if (!parseInput(next.price, "price").value) return state;
      next.q = next.price.trim();
      next.qMode = "manual";
      break;
    case "trafficToggle":
      next.includeTraffic = action.value;
      break;
    case "clearProduct":
      next.price = next.weight = next.q = next.vip = "";
      next.qMode = "auto";
      break;
    case "resetFees":
      next.air = defaultAir(mode);
      next.traffic = DEFAULT_FEES[mode].traffic;
      if (mode === "general") next.includeTraffic = false;
      break;
  }
  return { ...state, [mode]: next };
}
