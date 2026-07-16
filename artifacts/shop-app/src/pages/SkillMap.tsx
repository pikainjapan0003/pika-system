import { useGetMyStore, useListOrders, useListProducts } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { BottomNav } from "./Dashboard";
import { resolveSkillUnlocks, SKILL_GROUPS, type SkillMapFacts } from "@/lib/skillMap";

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

export default function SkillMapPage() {
  const [, setLocation] = useLocation();
  const { data: store } = useGetMyStore();
  const storeId = store?.id;
  // Generated API types intentionally lag additive fields; skill detection is read-only and fail-closed.
  const { data: productData } = useListProducts(storeId!, { query: { enabled: !!storeId } as never });
  const { data: orderData } = useListOrders(storeId!, { query: { enabled: !!storeId } as never });
  const products = (productData ?? []) as Array<Record<string, unknown>>;
  const orders = (orderData ?? []) as Array<Record<string, unknown>>;
  const storeRecord = (store ?? {}) as Record<string, unknown>;

  const facts: SkillMapFacts = {
    hasStore: !!storeId,
    hasProduct: products.length > 0,
    hasOrder: orders.length > 0,
    hasStoreExchangeRate: isPresent(storeRecord.purchaseExchangeRate),
    hasProductCost: products.some((product) => isPresent(product.costJpy)),
    hasLinkedTripRoute: products.some((product) => isPresent(product.tripRouteId)),
    hasTierPrice: products.some((product) =>
      [product.vipPrice, product.wholesalePrice, product.partnerPrice].some(isPresent),
    ),
    hasShipmentOrder: orders.some((order) =>
      [order.trackingNumber, order.providerCode, order.logisticsProvider].some(isPresent),
    ),
    // The reviewed S-16 automation foundation is not present in this repository yet.
    hasAutomationFoundation: false,
  };
  const unlocks = resolveSkillUnlocks(facts);

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-5 pb-4 pt-10">
        <div className="flex items-center">
          <button type="button" onClick={() => setLocation("/settings")} className="w-16 text-left text-sm font-medium text-primary">
            ‹ 返回
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-foreground">技能地圖</h1>
          <div className="w-16" />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">目前只顯示狀態，不會開啟或關閉任何功能。</p>
      </header>

      <main className="space-y-5 px-5 py-5">
        {SKILL_GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`skill-group-${group.id}`}>
            <div className="mb-3">
              <h2 id={`skill-group-${group.id}`} className="font-bold text-foreground">{group.title}</h2>
              <p className="text-xs text-muted-foreground">{group.description}</p>
            </div>
            <div className="space-y-3">
              {group.skills.map((skill) => {
                const unlocked = unlocks[skill.id];
                return (
                  <article key={skill.id} className="rounded-2xl border border-border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">{skill.id}</p>
                        <h3 className="font-semibold text-foreground">{skill.title}</h3>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${unlocked ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>
                        {unlocked ? "已解鎖" : "尚未解鎖"}
                      </span>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm">
                      <div><dt className="font-medium text-foreground">省什麼工</dt><dd className="text-muted-foreground">{skill.saves}</dd></div>
                      <div><dt className="font-medium text-foreground">開啟前要準備</dt><dd className="text-muted-foreground">{skill.prerequisite}</dd></div>
                      <div><dt className="font-medium text-foreground">風險標記</dt><dd className="text-muted-foreground">{skill.risk}</dd></div>
                      <div><dt className="font-medium text-foreground">開了會發生什麼</dt><dd className="text-muted-foreground">{skill.effect}</dd></div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>
      <BottomNav active="settings" />
    </div>
  );
}
