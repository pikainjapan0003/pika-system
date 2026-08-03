import assert from "node:assert/strict";
import test from "node:test";

import { validateMaihuobianRow } from "./validateMaihuobianRow.ts";

function fixture(overrides = {}) {
  return {
    recipientName: "王小明",
    buyerName: "不該使用",
    recipientPhone: "0912345678",
    buyerPhone: "0999999999",
    cvsStoreId: "123456",
    storageTempClass: "normal",
    productSummary: "假商品 × 2",
    totalPrice: "20000",
    shippingFee: "38",
    createdAt: "2026-07-31T16:30:00.000Z",
    notes: "客人假備註",
    ...overrides,
  };
}

function errorCodes(result) {
  assert.equal(result.ok, false);
  return result.errors.map((error) => error.code);
}

test("valid row uses frozen order data and Taipei date formatting", () => {
  const result = validateMaihuobianRow(fixture());

  assert.equal(result.ok, true);
  assert.deepEqual(result.row, {
    recipientName: "王小明",
    recipientPhone: "0912345678",
    cvsStoreId: "123456",
    temperature: "常溫",
    productSummary: "假商品 × 2",
    totalPrice: "20000.00",
    shippingFee: "38.00",
    orderDate: "2026/8/1",
    notes: "客人假備註",
    socialAccount: "",
  });
});

test("cart items with one shared frozen class are accepted", () => {
  const result = validateMaihuobianRow(
    fixture({
      storageTempClass: undefined,
      itemStorageTempClasses: ["frozen", "frozen"],
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.row.temperature, "冷凍");
});

test("mixed or missing shipping temperatures fail closed", () => {
  assert.ok(
    errorCodes(
      validateMaihuobianRow(
        fixture({ itemStorageTempClasses: ["normal", "frozen"] }),
      ),
    ).includes("STORAGE_TEMPERATURE_INVALID"),
  );
  assert.ok(
    errorCodes(
      validateMaihuobianRow(fixture({ storageTempClass: null })),
    ).includes("STORAGE_TEMPERATURE_INVALID"),
  );
});

test("recipient name rejects over-limit Chinese and official forbidden characters", () => {
  assert.ok(
    errorCodes(
      validateMaihuobianRow(fixture({ recipientName: "王小明測試人" })),
    ).includes("RECIPIENT_NAME_INVALID"),
  );
  assert.ok(
    errorCodes(
      validateMaihuobianRow(fixture({ recipientName: "王小明1" })),
    ).includes("RECIPIENT_NAME_INVALID"),
  );
});

test("recipient name and phone use order fallbacks only when captured fields are empty", () => {
  const result = validateMaihuobianRow(
    fixture({
      recipientName: null,
      buyerName: "林小花",
      recipientPhone: null,
      buyerPhone: "0987654321",
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.row.recipientName, "林小花");
  assert.equal(result.row.recipientPhone, "0987654321");
});

test("phone must be 09 plus eight digits with no hyphen", () => {
  const codes = errorCodes(
    validateMaihuobianRow(fixture({ recipientPhone: "0912-345-678" })),
  );
  assert.ok(codes.includes("RECIPIENT_PHONE_INVALID"));
});

test("store ID must be exactly six digits", () => {
  const codes = errorCodes(
    validateMaihuobianRow(fixture({ cvsStoreId: "ABC123" })),
  );
  assert.ok(codes.includes("CVS_STORE_ID_INVALID"));
});

test("product summary is required and capped at 200 characters", () => {
  const emptyCodes = errorCodes(
    validateMaihuobianRow(fixture({ productSummary: "" })),
  );
  const longCodes = errorCodes(
    validateMaihuobianRow(fixture({ productSummary: "商".repeat(201) })),
  );
  assert.ok(emptyCodes.includes("PRODUCT_SUMMARY_INVALID"));
  assert.ok(longCodes.includes("PRODUCT_SUMMARY_INVALID"));
});

test("total price validates exact decimal boundaries without float accumulation", () => {
  assert.equal(validateMaihuobianRow(fixture({ totalPrice: "0.10" })).ok, true);
  assert.ok(
    errorCodes(
      validateMaihuobianRow(fixture({ totalPrice: "20000.01" })),
    ).includes("TOTAL_PRICE_OUT_OF_RANGE"),
  );
  assert.ok(
    errorCodes(
      validateMaihuobianRow(fixture({ totalPrice: "-0.01" })),
    ).includes("TOTAL_PRICE_OUT_OF_RANGE"),
  );
});

test("shipping fee validates 0 and 38 exactly and blocks 39", () => {
  assert.equal(validateMaihuobianRow(fixture({ shippingFee: "0" })).ok, true);
  assert.equal(validateMaihuobianRow(fixture({ shippingFee: "38" })).ok, true);
  assert.ok(
    errorCodes(validateMaihuobianRow(fixture({ shippingFee: "39" }))).includes(
      "SHIPPING_FEE_OUT_OF_RANGE",
    ),
  );
  const overage = validateMaihuobianRow(fixture({ shippingFee: "39" }));
  assert.equal(overage.ok, false);
  assert.match(
    overage.errors.find((error) => error.field === "shippingFee")?.message ??
      "",
    /38 元/u,
  );
  assert.ok(
    errorCodes(
      validateMaihuobianRow(fixture({ shippingFee: "-0.01" })),
    ).includes("SHIPPING_FEE_OUT_OF_RANGE"),
  );
});

test("invalid date and notes over 200 characters are reported independently", () => {
  const codes = errorCodes(
    validateMaihuobianRow(
      fixture({ createdAt: "not-a-date", notes: "備".repeat(201) }),
    ),
  );
  assert.ok(codes.includes("ORDER_DATE_INVALID"));
  assert.ok(codes.includes("NOTES_INVALID"));
});
