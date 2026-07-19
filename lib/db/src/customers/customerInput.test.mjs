import assert from "node:assert/strict";
import test from "node:test";

import { validateCustomerInput } from "./customerInput.ts";

test("customer input trims required fields and keeps optional CVS data", () => {
  assert.deepEqual(
    validateCustomerInput({
      code: "  DEMO-001 ",
      name: " 王小明 ",
      phone: " 0912345678 ",
      cvsStoreId: " 123456 ",
      cvsStoreName: " 測試門市 ",
      cvsStoreAddress: " 台北市測試區測試路1號 ",
      cvsStorePhone: " 0212345678 ",
      notes: " 假資料 ",
    }),
    {
      code: "DEMO-001",
      name: "王小明",
      phone: "0912345678",
      tier: "general",
      cvsStoreId: "123456",
      cvsStoreName: "測試門市",
      cvsStoreAddress: "台北市測試區測試路1號",
      cvsStorePhone: "0212345678",
      notes: "假資料",
    },
  );
});

test("customer input rejects a missing code or name and permits a missing phone", () => {
  assert.throws(
    () =>
      validateCustomerInput({ code: "", name: "假名", phone: "0912000000" }),
    /code is required/,
  );
  assert.throws(
    () =>
      validateCustomerInput({ code: "DEMO", name: " ", phone: "0912000000" }),
    /name is required/,
  );
  assert.equal(
    validateCustomerInput({ code: "DEMO", name: "假名", phone: null }).phone,
    null,
  );
  assert.equal(
    validateCustomerInput({ code: "DEMO", name: "假名" }).phone,
    null,
  );
});

test("customer input stores blank optional values as null", () => {
  const result = validateCustomerInput({
    code: "DEMO",
    name: "假名",
    phone: "0912000000",
  });
  assert.equal(result.cvsStoreId, null);
  assert.equal(result.notes, null);
  assert.equal(result.tier, "general");
});

test("customer tier accepts the four approved values and rejects inventions", () => {
  for (const tier of ["general", "vip", "wholesale", "partner"]) {
    assert.equal(
      validateCustomerInput({
        code: "DEMO",
        name: "假名",
        phone: "0912000000",
        tier,
      }).tier,
      tier,
    );
  }
  assert.throws(
    () =>
      validateCustomerInput({
        code: "DEMO",
        name: "假名",
        phone: "0912000000",
        tier: "gold",
      }),
    /tier must be/,
  );
});
