import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCustomerExportCsv,
  parseCustomerExportMode,
} from "./customerExport.ts";

const fakeCustomer = {
  code: "C-001",
  name: "王小明",
  phone: "0912345678",
  tier: "vip",
  cvsStoreId: "711001",
  cvsStoreName: "測試門市",
  cvsStoreAddress: "台北市中正區測試路1號",
  cvsStorePhone: "0223456789",
};

test("masked customer CSV uses the shared masks and excludes cleartext PII", () => {
  const csv = formatCustomerExportCsv([fakeCustomer], "masked");
  assert.match(csv, /王\*明/);
  assert.match(csv, /0912\*\*\*678/);
  assert.match(csv, /台北市中正區\*/);
  assert.doesNotMatch(csv, /王小明/);
  assert.doesNotMatch(csv, /0912345678/);
  assert.doesNotMatch(csv, /測試路1號/);
});

test("cleartext mode is rejected unless the second confirmation reaches the server", () => {
  assert.equal(parseCustomerExportMode(undefined, false), "masked");
  assert.throws(
    () => parseCustomerExportMode("cleartext", false),
    /explicit confirmation/,
  );
  assert.equal(parseCustomerExportMode("cleartext", true), "cleartext");
});

test("CSV cells neutralize spreadsheet formulas", () => {
  const csv = formatCustomerExportCsv(
    [{ ...fakeCustomer, code: '=HYPERLINK("https://example.invalid")' }],
    "masked",
  );
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
});
