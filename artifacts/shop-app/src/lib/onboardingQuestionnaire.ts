export const ONBOARDING_PACKAGE_PRIORITY = [
  "beginner",
  "cost",
  "shipping",
  "group-buy",
  "wholesale",
  "automation",
] as const;

export type OnboardingPackageKey = (typeof ONBOARDING_PACKAGE_PRIORITY)[number];

export type OnboardingQuestionKey =
  | "primaryWork"
  | "costNeed"
  | "orderVolume"
  | "logisticsNeed";

export interface OnboardingQuestionOption {
  value: string;
  label: string;
  scores: Partial<Record<OnboardingPackageKey, 0 | 1 | 2>>;
}

export interface OnboardingQuestion {
  key: OnboardingQuestionKey;
  title: string;
  options: readonly OnboardingQuestionOption[];
}

export type OnboardingAnswers = Partial<
  Record<OnboardingQuestionKey, string | null>
>;

export interface OnboardingRecommendation {
  basePackage: "beginner";
  mainPackage: OnboardingPackageKey;
  packagesToApply: OnboardingPackageKey[];
  scores: Record<OnboardingPackageKey, number>;
}

export const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  {
    key: "primaryWork",
    title: "你現在最想先處理哪件事？",
    options: [
      {
        value: "basic-selling",
        label: "先把商品、訂單基本流程用順",
        scores: { beginner: 2 },
      },
      {
        value: "cost-control",
        label: "看懂成本與毛利",
        scores: { cost: 2 },
      },
      {
        value: "group-orders",
        label: "更快整理團購訂單",
        scores: { "group-buy": 2 },
      },
      {
        value: "customer-tiers",
        label: "管理客戶與分級價格",
        scores: { wholesale: 2 },
      },
      {
        value: "shipping",
        label: "改善出貨與物流追蹤",
        scores: { shipping: 2 },
      },
      {
        value: "automation",
        label: "減少重複操作",
        scores: { automation: 2 },
      },
    ],
  },
  {
    key: "costNeed",
    title: "你目前對成本管理的需要？",
    options: [
      {
        value: "not-yet",
        label: "暫時先不用",
        scores: { beginner: 1 },
      },
      {
        value: "basic",
        label: "想先看到大概毛利",
        scores: { cost: 1 },
      },
      {
        value: "precise",
        label: "需要精確分攤與定格毛利",
        scores: { cost: 2 },
      },
    ],
  },
  {
    key: "orderVolume",
    title: "你平常一次大約處理多少訂單？",
    options: [
      {
        value: "low",
        label: "少量，先求簡單好用",
        scores: { beginner: 2 },
      },
      {
        value: "medium",
        label: "中量，需要團購整理",
        scores: { "group-buy": 2, shipping: 1 },
      },
      {
        value: "high",
        label: "大量，需要客戶分級與省工",
        scores: { wholesale: 2, automation: 1 },
      },
    ],
  },
  {
    key: "logisticsNeed",
    title: "你目前的出貨與物流需求？",
    options: [
      {
        value: "simple",
        label: "量少，手動處理即可",
        scores: { beginner: 1 },
      },
      {
        value: "frequent",
        label: "經常出貨，需要集中管理",
        scores: { shipping: 2 },
      },
      {
        value: "automate",
        label: "想減少查件與更新貨態的時間",
        scores: { automation: 2, shipping: 1 },
      },
    ],
  },
] as const;

export function recommendOnboardingPackages(
  answers: OnboardingAnswers,
): OnboardingRecommendation {
  const scores = Object.fromEntries(
    ONBOARDING_PACKAGE_PRIORITY.map((packageKey) => [packageKey, 0]),
  ) as Record<OnboardingPackageKey, number>;

  for (const question of ONBOARDING_QUESTIONS) {
    const answer = answers[question.key];
    const option = question.options.find((item) => item.value === answer);
    if (!option) continue;
    for (const [packageKey, points] of Object.entries(option.scores)) {
      scores[packageKey as OnboardingPackageKey] += points ?? 0;
    }
  }

  let mainPackage: OnboardingPackageKey = "beginner";
  for (const packageKey of ONBOARDING_PACKAGE_PRIORITY.slice(1)) {
    if (scores[packageKey] > scores[mainPackage]) {
      mainPackage = packageKey;
    }
  }

  return {
    basePackage: "beginner",
    mainPackage,
    packagesToApply:
      mainPackage === "beginner" ? ["beginner"] : ["beginner", mainPackage],
    scores,
  };
}
