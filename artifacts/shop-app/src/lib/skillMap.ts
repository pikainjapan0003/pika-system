export type SkillRisk =
  | "低風險"
  | "💰 金額"
  | "🔒 個資"
  | "🌐 外部服務"
  | "📣 對客發訊";

import type { SkillMapFacts } from "@workspace/db/skill-map";

export type { SkillMapFacts } from "@workspace/db/skill-map";

export interface SkillCardDefinition {
  id: string;
  title: string;
  saves: string;
  prerequisite: string;
  risk: SkillRisk;
  effect: string;
  unlockWhen: (facts: SkillMapFacts) => boolean;
}

export interface SkillGroupDefinition {
  id:
    | "beginner"
    | "cost"
    | "group-buy"
    | "wholesale"
    | "shipping"
    | "automation";
  title: string;
  description: string;
  skills: readonly SkillCardDefinition[];
}

// Source: Dream-system/11_SKILL_TREE_ROADMAP.md, second-layer seller skill map (Q29–Q48).
// Card copy remains centralized here; persistence and prerequisite enforcement are server-side.
export const SKILL_GROUPS: readonly SkillGroupDefinition[] = [
  {
    id: "beginner",
    title: "新手套餐",
    description: "先把上架、分享與接單走順。",
    skills: [
      {
        id: "S-01",
        title: "商品上架",
        saves: "不用重複手打商品資料。",
        prerequisite: "先建立店鋪。",
        risk: "低風險",
        effect: "出現商品管理與分享連結。",
        unlockWhen: (facts) => facts.hasStore && facts.hasProduct,
      },
      {
        id: "S-03",
        title: "客人下單",
        saves: "客人自己填單，不再人工抄寫。",
        prerequisite: "至少上架一件商品。",
        risk: "低風險",
        effect: "訂單會進入後台訂單列表。",
        unlockWhen: (facts) => facts.hasProduct && facts.hasOrder,
      },
    ],
  },
  {
    id: "cost",
    title: "成本套餐",
    description: "日本現場代購的成本與毛利工具。",
    skills: [
      {
        id: "S-07",
        title: "進貨匯率",
        saves: "不用每件商品重填匯率。",
        prerequisite: "在店家設定填入進貨匯率。",
        risk: "💰 金額",
        effect: "商品預估成本可套用店鋪匯率。",
        unlockWhen: (facts) => facts.hasStoreExchangeRate,
      },
      {
        id: "S-08",
        title: "商品成本與毛利",
        saves: "不用另開試算表算單件毛利。",
        prerequisite: "商品日圓成本與店鋪匯率都已填。",
        risk: "💰 金額",
        effect: "商品與訂單會顯示預估或定格毛利。",
        unlockWhen: (facts) =>
          facts.hasProductCost && facts.hasStoreExchangeRate,
      },
      {
        id: "S-09",
        title: "交通成本分攤",
        saves: "自動把行程交通成本分到單件商品。",
        prerequisite: "商品已連結行程路線，且路線資料完整。",
        risk: "💰 金額",
        effect: "毛利會納入單件交通成本。",
        unlockWhen: (facts) => facts.hasLinkedTripRoute,
      },
    ],
  },
  {
    id: "group-buy",
    title: "團購模式",
    description: "集中管理開團、收單與提醒。",
    skills: [
      {
        id: "S-04",
        title: "訂單列表",
        saves: "不用在聊天訊息裡逐筆找訂單。",
        prerequisite: "至少收到一張訂單。",
        risk: "低風險",
        effect: "可集中查詢與更新訂單狀態。",
        unlockWhen: (facts) => facts.hasOrder,
      },
      {
        id: "S-49",
        title: "一鍵複製訊息",
        saves: "快速產生確認、到貨與催款文案。",
        prerequisite: "至少收到一張訂單。",
        risk: "低風險",
        effect: "訂單詳情會提供文案複製，不會自動發送。",
        unlockWhen: (facts) => facts.hasOrder,
      },
    ],
  },
  {
    id: "wholesale",
    title: "批發模式",
    description: "管理客戶等級與四層價格。",
    skills: [
      {
        id: "S-26",
        title: "四層價格",
        saves: "選客戶等級後不用人工查價。",
        prerequisite: "商品至少設定一個 VIP、批發或夥伴價。",
        risk: "💰 金額",
        effect: "商品可依客戶等級取價；空欄回落一般價。",
        unlockWhen: (facts) => facts.hasTierPrice,
      },
      {
        id: "S-19",
        title: "客戶個資保護",
        saves: "後台預設遮罩，降低誤曝風險。",
        prerequisite: "使用客戶主檔前先建立遮罩與權限防線。",
        risk: "🔒 個資",
        effect: "姓名、電話與地址預設遮罩，揭露會留下 audit log。",
        unlockWhen: (facts) => facts.hasStore,
      },
    ],
  },
  {
    id: "shipping",
    title: "出貨模式",
    description: "大量揀貨、包貨與物流追蹤。",
    skills: [
      {
        id: "S-05",
        title: "揀貨／包貨清單",
        saves: "不用逐張訂單手抄品項。",
        prerequisite: "至少收到一張訂單。",
        risk: "低風險",
        effect: "訂單頁可整理揀貨與出貨清單。",
        unlockWhen: (facts) => facts.hasOrder,
      },
      {
        id: "S-34",
        title: "物流異常追蹤",
        saves: "集中查看需要人工處理的貨態。",
        prerequisite: "至少一張訂單有物流追蹤資料。",
        risk: "🌐 外部服務",
        effect: "顯示物流差異與異常；不會自行改資料。",
        unlockWhen: (facts) => facts.hasShipmentOrder,
      },
    ],
  },
  {
    id: "automation",
    title: "自動化模式",
    description: "先當只讀哨兵，再談自動動作。",
    skills: [
      {
        id: "S-23",
        title: "只讀監控提醒",
        saves: "讓系統主動整理每日摘要與異常。",
        prerequisite: "Phase 1 與 CI 穩定，並完成監控設計審查。",
        risk: "🌐 外部服務",
        effect: "只產生提醒與報告，不改資料、不對客發訊。",
        unlockWhen: (facts) => facts.hasAutomationFoundation,
      },
      {
        id: "S-21",
        title: "LINE BOT 查單",
        saves: "減少重複回答查單問題。",
        prerequisite: "先通過 Q6 對外發訊閘門與 LINE 整合審查。",
        risk: "📣 對客發訊",
        effect: "未來可讓客人在 LINE 查單；目前保持上鎖。",
        unlockWhen: () => false,
      },
    ],
  },
];

export function resolveSkillUnlocks(
  facts: SkillMapFacts,
): Record<string, boolean> {
  return Object.fromEntries(
    SKILL_GROUPS.flatMap((group) =>
      group.skills.map((skill) => [skill.id, skill.unlockWhen(facts)]),
    ),
  );
}
