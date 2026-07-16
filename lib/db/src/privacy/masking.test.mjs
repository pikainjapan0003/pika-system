import assert from "node:assert/strict";
import test from "node:test";

import {
  maskAddress,
  maskEmail,
  maskLineId,
  maskName,
  maskPhone,
} from "./masking.ts";

test("masks the specified personal-data examples", () => {
  assert.equal(maskName("王小明"), "王*明");
  assert.equal(maskPhone("0912345678"), "0912***678");
  assert.equal(maskPhone("0223456789"), "0223***789");
  assert.equal(maskAddress("臺北市大安區信義路一段1號"), "臺北市大安區*");
  assert.equal(maskEmail("pika@example.com"), "pi***@example.com");
  assert.equal(maskLineId("pika-owner"), "pi***");
});

test("empty values return an empty string without throwing", () => {
  const maskers = [maskName, maskPhone, maskAddress, maskEmail, maskLineId];
  for (const mask of maskers) {
    assert.equal(mask(null), "");
    assert.equal(mask(undefined), "");
    assert.equal(mask("   "), "");
  }
});

test("unrecognized or short values fail closed", () => {
  assert.equal(maskName("王"), "*");
  assert.equal(maskPhone("12345"), "*****");
  assert.equal(maskAddress("unknown"), "*");
  assert.equal(maskEmail("invalid"), "***");
  assert.equal(maskLineId("x"), "x***");
});
