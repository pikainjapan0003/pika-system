import assert from "node:assert/strict";
import test from "node:test";
import { parsePaymentLast5 } from "./paymentLast5.ts";

test("payment last five accepts an optional five-digit string", () => {
  assert.equal(parsePaymentLast5(undefined), null);
  assert.equal(parsePaymentLast5("12345"), "12345");
});

test("payment last five rejects malformed references", () => {
  for (const value of ["1234", "123456", "12a45", 12345]) {
    assert.throws(() => parsePaymentLast5(value), /exactly five digits/);
  }
});
