import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import JSZip from "jszip";

import {
  generateMaihuobianXlsm,
  getOfficialMaihuobianTemplate,
  inspectMaihuobianXlsm,
  MAIHUOBIAN_IMPORT_HEADERS,
  MAIHUOBIAN_OFFICIAL_TEMPLATE_SHA256,
  MAIHUOBIAN_OFFICIAL_VBA_SHA256,
  MAIHUOBIAN_TEMPLATE_VERSION,
  MAIHUOBIAN_WORKSHEET_NAMES,
} from "./maihuobianXlsm.ts";

const rows = [
  {
    recipientName: "王小明",
    recipientPhone: "0912345678",
    cvsStoreId: "123456",
    temperature: "常溫",
    productSummary: "假商品 A × 2",
    totalPrice: "800.00",
    shippingFee: "60.00",
    orderDate: "2026/7/31",
    notes: "假資料",
    socialAccount: "",
  },
  {
    recipientName: "林小花",
    recipientPhone: "0987654321",
    cvsStoreId: "654321",
    temperature: "冷凍",
    productSummary: "假商品 B × 1",
    totalPrice: "1200.50",
    shippingFee: "100.00",
    orderDate: "2026/7/31",
    notes: "",
    socialAccount: "",
  },
];

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("official XLSM asset is the owner-supplied v1.4 macro template", async () => {
  const template = getOfficialMaihuobianTemplate();
  assert.equal(hash(template), MAIHUOBIAN_OFFICIAL_TEMPLATE_SHA256);
  const inspection = await inspectMaihuobianXlsm(template);
  assert.deepEqual(inspection.worksheetNames, [...MAIHUOBIAN_WORKSHEET_NAMES]);
  assert.equal(inspection.templateVersion, MAIHUOBIAN_TEMPLATE_VERSION);
  assert.deepEqual(inspection.headers, [...MAIHUOBIAN_IMPORT_HEADERS]);
  assert.equal(inspection.vbaSha256, MAIHUOBIAN_OFFICIAL_VBA_SHA256);
  assert.equal(inspection.hasMacroEnabledContentType, true);
  assert.equal(inspection.hasVbaRelationship, true);
});

test("XLSM fill changes only the order-import worksheet and keeps VBA byte-identical", async () => {
  const template = getOfficialMaihuobianTemplate();
  const output = await generateMaihuobianXlsm(rows);
  const [originalZip, outputZip] = await Promise.all([
    JSZip.loadAsync(template),
    JSZip.loadAsync(output),
  ]);
  const changed = [];
  for (const path of Object.keys(originalZip.files).filter(
    (path) => !originalZip.files[path].dir,
  )) {
    const [before, after] = await Promise.all([
      originalZip.file(path).async("nodebuffer"),
      outputZip.file(path).async("nodebuffer"),
    ]);
    if (!before.equals(after)) changed.push(path);
  }
  assert.deepEqual(changed, ["xl/worksheets/sheet1.xml"]);

  const worksheet = await outputZip
    .file("xl/worksheets/sheet1.xml")
    .async("string");
  assert.match(worksheet, /<dimension ref="A1:K8"\/>/u);
  assert.match(worksheet, /<row r="7" spans="1:10">/u);
  assert.match(worksheet, /<t xml:space="preserve">王小明<\/t>/u);
  assert.match(worksheet, /<t xml:space="preserve">0912345678<\/t>/u);
  assert.match(worksheet, /<c r="F7" s="18" t="n"><v>800\.00<\/v><\/c>/u);
  assert.match(worksheet, /<row r="8" spans="1:10">/u);
  assert.match(worksheet, /<t xml:space="preserve">冷凍<\/t>/u);

  const inspection = await inspectMaihuobianXlsm(output);
  assert.equal(inspection.vbaSha256, MAIHUOBIAN_OFFICIAL_VBA_SHA256);
  assert.equal(inspection.templateVersion, "1.4");
  assert.deepEqual(inspection.headers, [...MAIHUOBIAN_IMPORT_HEADERS]);
});

test("filled XLSM keeps the official sheets, B1 version and macro package", async () => {
  const output = await generateMaihuobianXlsm([rows[0]]);
  const inspection = await inspectMaihuobianXlsm(output);
  assert.deepEqual(inspection.worksheetNames, [...MAIHUOBIAN_WORKSHEET_NAMES]);
  assert.equal(inspection.templateVersion, "1.4");
  assert.equal(inspection.vbaSha256, MAIHUOBIAN_OFFICIAL_VBA_SHA256);
  assert.equal(inspection.hasMacroEnabledContentType, true);
  assert.equal(inspection.hasVbaRelationship, true);
});

test("XLSM generation fails closed outside the official 1 to 500 row limit", async () => {
  await assert.rejects(() => generateMaihuobianXlsm([]), /1 to 500 rows/u);
  await assert.rejects(
    () => generateMaihuobianXlsm(Array.from({ length: 501 }, () => rows[0])),
    /1 to 500 rows/u,
  );
});
