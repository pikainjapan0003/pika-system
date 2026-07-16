import assert from "node:assert/strict";
import test from "node:test";

import { filterCustomerOptions } from "./customerPicker.ts";

const customers = [
  { id: 1, code: "VIP-001", name: "王小明" },
  { id: 2, code: "PARTNER-02", name: "陳美玲" },
];

test("customer picker searches by code or name without changing the source list", () => {
  assert.deepEqual(filterCustomerOptions(customers, "vip"), [customers[0]]);
  assert.deepEqual(filterCustomerOptions(customers, "美玲"), [customers[1]]);
  assert.deepEqual(filterCustomerOptions(customers, "  "), customers);
  assert.equal(customers.length, 2);
});
