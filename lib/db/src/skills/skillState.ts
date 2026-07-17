export const SKILL_CATALOG_VERSION = 1;

export const SKILL_KEYS = [
  "S-01",
  "S-03",
  "S-04",
  "S-05",
  "S-07",
  "S-08",
  "S-09",
  "S-19",
  "S-21",
  "S-23",
  "S-26",
  "S-34",
  "S-49",
] as const;

export type SkillKey = (typeof SKILL_KEYS)[number];
export type SkillPackageKey =
  | "beginner"
  | "cost"
  | "group-buy"
  | "wholesale"
  | "shipping"
  | "automation";

export interface SkillMapFacts {
  hasStore: boolean;
  hasProduct: boolean;
  hasOrder: boolean;
  hasStoreExchangeRate: boolean;
  hasProductCost: boolean;
  hasLinkedTripRoute: boolean;
  hasTierPrice: boolean;
  hasShipmentOrder: boolean;
  hasAutomationFoundation: boolean;
}

export interface SkillPrerequisiteResult {
  ready: boolean;
  missing: string[];
}

const HIGH_RISK_SKILLS = new Set<SkillKey>([
  "S-07",
  "S-08",
  "S-09",
  "S-19",
  "S-21",
  "S-23",
  "S-26",
  "S-34",
]);

export const SKILL_PACKAGES: Record<SkillPackageKey, readonly SkillKey[]> = {
  beginner: ["S-01", "S-03"],
  cost: ["S-07", "S-08", "S-09"],
  "group-buy": ["S-04", "S-49"],
  wholesale: ["S-19", "S-26"],
  shipping: ["S-05", "S-34"],
  automation: ["S-21", "S-23"],
};

export function isSkillKey(value: unknown): value is SkillKey {
  return (
    typeof value === "string" &&
    (SKILL_KEYS as readonly string[]).includes(value)
  );
}

export function isSkillPackageKey(value: unknown): value is SkillPackageKey {
  return typeof value === "string" && Object.hasOwn(SKILL_PACKAGES, value);
}

export function isHighRiskSkill(skillKey: SkillKey): boolean {
  return HIGH_RISK_SKILLS.has(skillKey);
}

export function evaluateSkillPrerequisites(
  skillKey: SkillKey,
  facts: SkillMapFacts,
): SkillPrerequisiteResult {
  const checks: Partial<Record<SkillKey, Array<[boolean, string]>>> = {
    "S-01": [[facts.hasStore, "請先建立店鋪"]],
    "S-03": [[facts.hasProduct, "請先上架至少一件商品"]],
    "S-04": [[facts.hasOrder, "請先收到至少一張訂單"]],
    "S-05": [[facts.hasOrder, "請先收到至少一張訂單"]],
    "S-07": [[facts.hasStoreExchangeRate, "請先填寫店鋪進貨匯率"]],
    "S-08": [
      [facts.hasStoreExchangeRate, "請先填寫店鋪進貨匯率"],
      [facts.hasProductCost, "請先填寫至少一件商品的日圓成本"],
    ],
    "S-09": [[facts.hasLinkedTripRoute, "請先把商品連結到行程路線"]],
    "S-19": [[facts.hasStore, "請先建立店鋪"]],
    "S-21": [[false, "LINE 對客發訊尚未另行核准"]],
    "S-23": [[facts.hasAutomationFoundation, "請先完成只讀監控基礎"]],
    "S-26": [[facts.hasTierPrice, "請先設定至少一個分級價格"]],
    "S-34": [[facts.hasShipmentOrder, "請先建立至少一筆物流追蹤"]],
    "S-49": [[facts.hasOrder, "請先收到至少一張訂單"]],
  };
  const missing = (checks[skillKey] ?? [])
    .filter(([satisfied]) => !satisfied)
    .map(([, message]) => message);
  return { ready: missing.length === 0, missing };
}

export interface SkillTogglePreview {
  skillKey: SkillKey;
  currentEnabled: boolean;
  requestedEnabled: boolean;
  changed: boolean;
  prerequisite: SkillPrerequisiteResult;
  highRiskConfirmationRequired: boolean;
}

export function previewSkillToggle(input: {
  skillKey: SkillKey;
  currentEnabled: boolean;
  requestedEnabled: boolean;
  facts: SkillMapFacts;
}): SkillTogglePreview {
  const prerequisite = evaluateSkillPrerequisites(input.skillKey, input.facts);
  return {
    skillKey: input.skillKey,
    currentEnabled: input.currentEnabled,
    requestedEnabled: input.requestedEnabled,
    changed: input.currentEnabled !== input.requestedEnabled,
    prerequisite,
    highRiskConfirmationRequired:
      input.requestedEnabled && isHighRiskSkill(input.skillKey),
  };
}

export interface SkillPackagePreview {
  packageKey: SkillPackageKey;
  enableNow: SkillKey[];
  alreadyEnabled: SkillKey[];
  missingPrerequisite: Array<{ skillKey: SkillKey; missing: string[] }>;
  requiresConfirmation: SkillKey[];
}

export function previewSkillPackage(input: {
  packageKey: SkillPackageKey;
  enabledSkills: ReadonlySet<SkillKey>;
  facts: SkillMapFacts;
}): SkillPackagePreview {
  const result: SkillPackagePreview = {
    packageKey: input.packageKey,
    enableNow: [],
    alreadyEnabled: [],
    missingPrerequisite: [],
    requiresConfirmation: [],
  };
  for (const skillKey of SKILL_PACKAGES[input.packageKey]) {
    if (input.enabledSkills.has(skillKey)) {
      result.alreadyEnabled.push(skillKey);
      continue;
    }
    const prerequisite = evaluateSkillPrerequisites(skillKey, input.facts);
    if (!prerequisite.ready) {
      result.missingPrerequisite.push({
        skillKey,
        missing: prerequisite.missing,
      });
    } else if (isHighRiskSkill(skillKey)) {
      result.requiresConfirmation.push(skillKey);
    } else {
      result.enableNow.push(skillKey);
    }
  }
  return result;
}
