import { db, pool, productsTable, storesTable } from "@workspace/db";

const shareToken = "ci-smoke-product";

try {
  const [store] = await db
    .insert(storesTable)
    .values({
      merchantId: "ci-smoke-merchant",
      name: "CI 假資料商店",
      slug: `ci-smoke-${Date.now()}`,
    })
    .returning({ id: storesTable.id });

  await db.insert(productsTable).values({
    storeId: store.id,
    name: "CI 冒煙測試商品",
    description: "僅供 GitHub Actions 拋棄式資料庫測試",
    price: "123.00",
    inventory: 10,
    shareToken,
    isActive: true,
  });

  process.stdout.write(`seeded ${shareToken}\n`);
} finally {
  await pool.end();
}
