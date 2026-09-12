// Business-rule identity retained from CALC-PLAN-v1.1 §8. The separate
// engineering contract identifies the approved Decimal/state/D1–D5 revision.
export const RULE_VERSION = "price-calculator-v2-2026-09";
export const ENGINEERING_CONTRACT_VERSION = "CALC-PLAN-v1.2";

// Approved business values are decimal strings. Calculation, draft defaults and
// explanatory text must consume these definitions, never copy their literals.
export const CREDIT_CARD_FEE_RATE = "0.015";
export const DEPARTMENT_STORE_FEE_RATE = "0.0155";
export const BOUTIQUE_TAX_FACTOR = "0.9155";
export const BOUTIQUE_TIGERAIR_RATE_PER_KG = "52.5";
export const VIP_MINIMUM_PROFIT = "0";
export const PRICE_BOUNDARY_JPY = "1000";
export const PRICE_BOUNDARY_LABEL = PRICE_BOUNDARY_JPY.replace(
  /\B(?=(\d{3})+(?!\d))/g,
  ",",
);
export const GRAMS_PER_KG = "1000";
export const PERCENT_SCALE = "100";
export const ROUNDING_UNITS = { single: "1", five: "5" } as const;

// Equal initial values remain separately configurable for each mode. In
// particular, resetting jam's fees must never read another mode's draft.
export const DEFAULT_FEES = {
  general: { air: "50", traffic: "32" },
  jam: { air: "50", traffic: "32" },
  ip: { air: "220", traffic: "32" },
  boutique: { air: BOUTIQUE_TIGERAIR_RATE_PER_KG, traffic: "32" },
} as const;

export const GENERAL_PRICING = {
  doubleCostMax: "100",
  doubleCostFactor: "2",
  doubleCostAddition: "5",
  middleMax: "500",
  middleAddition: "20",
  upperMax: "650",
  upperAddition: "40",
  lastAddition: "50",
  vipDiscount: "5",
  trafficVipDiscount: "10",
} as const;
export const JAM_PRICING = {
  tiers: [
    { max: "600", addition: "80" },
    { max: "700", addition: "90" },
    { max: "900", addition: "110" },
    { max: PRICE_BOUNDARY_JPY, addition: "130" },
  ],
  vipDiscount: "10",
} as const;

export const IP_SCHEMES = [
  {
    factor: "0.35",
    minimumProfit: "100",
    addTraffic: false,
    originalRounding: null,
  },
  {
    factor: "0.31",
    minimumProfit: "100",
    addTraffic: true,
    originalRounding: ROUNDING_UNITS.single,
  },
  {
    factor: "0.29",
    minimumProfit: "100",
    addTraffic: true,
    originalRounding: null,
  },
  {
    factor: "0.28",
    minimumProfit: "80",
    addTraffic: true,
    originalRounding: null,
  },
  {
    factor: "0.26",
    minimumProfit: "50",
    addTraffic: true,
    originalRounding: null,
  },
] as const;
// D5 refers to the same scheme whose unrounded profit controls its warning.
export const IP_WEIGHT_GUIDE = IP_SCHEMES[4];

export const BOUTIQUE_PROFIT = {
  fixed: [
    { below: "5000", amount: "250" },
    { below: "6000", amount: "300" },
    { below: "7000", amount: "350" },
  ],
  proportional: [
    { below: "30000", rate: "0.04" },
    { below: "267000", rate: "0.03" },
  ],
  finalRate: "0.02",
} as const;

// Validation and its help text share the approved D1 limits. These are counts,
// not monetary operands, and do not truncate the automatic Q result.
export const INPUT_LIMITS = {
  standard: { integer: 9, fraction: 6 },
  rate: { integer: 2, fraction: 8 },
  manualQ: { integer: 9, fraction: 10 },
} as const;
