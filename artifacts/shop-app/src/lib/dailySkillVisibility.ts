import type { SkillKey } from "@workspace/db/skill-map";

/**
 * Q37 beginner defaults. These eight existing surfaces stay available when a
 * store has no explicit skill-state row, so the rollout cannot hide the core
 * selling flow from existing stores.
 */
export const Q37_BEGINNER_DEFAULT_DAILY_PAGES = [
  { id: "product-listing", label: "商品上架", path: "/products" },
  { id: "product-sharing", label: "商品分享", path: "/products" },
  { id: "public-ordering", label: "客人下單", path: "/p/:shareToken" },
  { id: "order-list", label: "訂單列表", path: "/orders" },
  { id: "basic-order-total", label: "基本總額", path: "/dashboard" },
  { id: "cvs-selection", label: "7-11 選店", path: "/cvs/711/select" },
  { id: "packing-list", label: "包貨清單", path: "/orders" },
  { id: "manual-logistics", label: "手動物流", path: "/orders" },
] as const;

export type DailySkillSurface =
  | "dashboard"
  | "products"
  | "orders"
  | "settings"
  | "guide"
  | "categories"
  | "customers"
  | "trips"
  | "logistics"
  | "agent-settings"
  | "audit-logs"
  | "skill-map";

export interface StoreSkillVisibilityState {
  skillKey: string;
  enabled: boolean;
  configured: boolean;
}

interface DailySkillSurfaceRule {
  skillKey: SkillKey | null;
  defaultEnabledWithoutState: boolean;
}

export const DAILY_SKILL_SURFACE_RULES: Record<
  DailySkillSurface,
  DailySkillSurfaceRule
> = {
  dashboard: { skillKey: null, defaultEnabledWithoutState: true },
  settings: { skillKey: null, defaultEnabledWithoutState: true },
  "skill-map": { skillKey: null, defaultEnabledWithoutState: true },
  products: { skillKey: "S-01", defaultEnabledWithoutState: true },
  orders: { skillKey: "S-04", defaultEnabledWithoutState: true },
  categories: { skillKey: "S-04", defaultEnabledWithoutState: true },
  guide: { skillKey: "S-05", defaultEnabledWithoutState: true },
  customers: { skillKey: "S-19", defaultEnabledWithoutState: false },
  trips: { skillKey: "S-09", defaultEnabledWithoutState: false },
  logistics: { skillKey: "S-34", defaultEnabledWithoutState: false },
  "agent-settings": { skillKey: "S-21", defaultEnabledWithoutState: false },
  "audit-logs": { skillKey: "S-23", defaultEnabledWithoutState: false },
};

export function resolveDailySkillSurfaceVisibility(
  surface: DailySkillSurface,
  states: readonly StoreSkillVisibilityState[],
): boolean {
  const rule = DAILY_SKILL_SURFACE_RULES[surface];
  if (rule.skillKey === null) return true;

  const state = states.find(
    (candidate) => candidate.skillKey === rule.skillKey && candidate.configured,
  );
  return state?.enabled ?? rule.defaultEnabledWithoutState;
}
