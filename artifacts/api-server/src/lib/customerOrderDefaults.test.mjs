import assert from "node:assert/strict";
import test from "node:test";

import {
  parseOptionalCustomerId,
  resolveCustomerCvsDefaults,
} from "./customerOrderDefaults.ts";

const fakeCustomer = {
  cvsStoreId: "123456",
  cvsStoreName: "測試門市",
  cvsStoreAddress: "台北市測試區測試路1號",
  cvsStorePhone: "0212345678",
};

test("customer CVS defaults fill an otherwise blank merchant order", () => {
  assert.deepEqual(resolveCustomerCvsDefaults({}, fakeCustomer), {
    storeCode: "123456",
    storeName: "測試門市",
    cvsStoreAddress: "台北市測試區測試路1號",
    cvsStorePhone: "0212345678",
    usedCustomerDefault: true,
  });
});

test("an explicit CVS selection wins over customer defaults", () => {
  assert.deepEqual(
    resolveCustomerCvsDefaults(
      {
        storeCode: "654321",
        storeName: "另選門市",
        cvsStoreAddress: "台中市測試區另一條路2號",
      },
      fakeCustomer,
    ),
    {
      storeCode: "654321",
      storeName: "另選門市",
      cvsStoreAddress: "台中市測試區另一條路2號",
      cvsStorePhone: null,
      usedCustomerDefault: false,
    },
  );
});

test("optional customer id accepts blank and rejects invalid identifiers", () => {
  assert.equal(parseOptionalCustomerId(undefined), null);
  assert.equal(parseOptionalCustomerId("42"), 42);
  assert.throws(() => parseOptionalCustomerId(0), /positive integer/);
  assert.throws(() => parseOptionalCustomerId("not-an-id"), /positive integer/);
});
