import { assertPocDatabase } from "./database-guard.mjs";

assertPocDatabase();
const ownerId = process.env.PIKA_OWNER_CLERK_USER_ID;
if (!ownerId?.startsWith("user_") || ownerId === "user_poc_test_owner") {
  throw new Error("Supply the explicitly designated Clerk TEST application owner ID");
}
const { db, pool, storesTable, productsTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
try {
  const store = await db.transaction(async tx => {
    const [existing] = await tx.select().from(storesTable).where(eq(storesTable.slug, "synthetic-private-poc"));
    if (existing) {
      if (existing.merchantId !== ownerId) throw new Error("Existing POC owner differs; refusing automatic reassignment");
      return existing;
    }
    const [created] = await tx.insert(storesTable).values({
      merchantId: ownerId, name: "合成資料測試店鋪", slug: "synthetic-private-poc",
      description: "只用假資料、不收款、不出貨",
      shippingCvsEnabled: false, shippingBlackCatEnabled: false,
      shippingPostOfficeEnabled: false, shippingSelfPickupEnabled: true,
    }).returning();
    await tx.insert(productsTable).values({
      storeId: created.id, name: "測試用筆記本（合成商品）", price: "100.00",
      inventory: 30, shareToken: "synthetic-private-poc-notebook",
      description: "請只用合成資料下單；本商品不收款、不出貨。", isActive: true,
    });
    return created;
  });
  console.log(JSON.stringify({ storeId: store.id, slug: store.slug, synthetic: true }));
} finally { await pool.end(); }
