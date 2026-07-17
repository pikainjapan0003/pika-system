import {
  db,
  ordersTable,
  pool,
  productsTable,
  storesTable,
} from "@workspace/db";

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

  const [product] = await db
    .insert(productsTable)
    .values({
      storeId: store.id,
      name: "CI 冒煙測試商品",
      description: "僅供 GitHub Actions 拋棄式資料庫測試",
      price: "123.00",
      inventory: 10,
      shareToken,
      isActive: true,
    })
    .returning({ id: productsTable.id });

  await db.insert(ordersTable).values({
    productId: product.id,
    storeId: store.id,
    productName: "CI 冒煙測試商品",
    publicToken: "ci-smoke-track-order",
    buyerName: "CI 假買家",
    buyerPhone: "0900000000",
    pickupMethod: "面交",
    quantity: 1,
    unitPrice: "123.00",
    shippingFee: "0.00",
    totalPrice: "123.00",
    status: "preparing",
  });

  process.stdout.write(`seeded ${shareToken}\n`);
} finally {
  await pool.end();
}
