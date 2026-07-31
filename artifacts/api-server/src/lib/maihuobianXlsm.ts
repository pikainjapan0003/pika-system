import { createHash } from "node:crypto";

import JSZip from "jszip";

import type { MaihuobianValidatedRow } from "@workspace/db/maihuobian";

import { MAIHUOBIAN_OFFICIAL_TEMPLATE_V14_BASE64 } from "./maihuobianOfficialTemplate.ts";

const DATA_SHEET_PATH = "xl/worksheets/sheet1.xml";
const INSTRUCTIONS_SHEET_PATH = "xl/worksheets/sheet2.xml";
const SHARED_STRINGS_PATH = "xl/sharedStrings.xml";
const WORKBOOK_PATH = "xl/workbook.xml";
const WORKBOOK_RELATIONSHIPS_PATH = "xl/_rels/workbook.xml.rels";
const CONTENT_TYPES_PATH = "[Content_Types].xml";
const VBA_PATH = "xl/vbaProject.bin";

export const MAIHUOBIAN_TEMPLATE_VERSION = "1.4";
export const MAIHUOBIAN_OFFICIAL_TEMPLATE_SHA256 =
  "1d1b9219780edbe85133cf61818d56eb9f2fa32ba1f59393f105fdb4725fcabb";
export const MAIHUOBIAN_OFFICIAL_VBA_SHA256 =
  "4a863928a679fe1e1e639d236fc12c8d5748f6a15d70212e5401d753468dfb08";
export const MAIHUOBIAN_WORKSHEET_NAMES = ["訂單匯入", "填寫說明"] as const;
export const MAIHUOBIAN_IMPORT_HEADERS = [
  "＊取件人姓名",
  "＊取件人手機",
  "＊取件門市",
  "* 溫層",
  "＊商品",
  "＊訂單金額",
  "＊運費金額",
  "買家下訂日期",
  "商品備註",
  "其他資訊\r\n(FB/LINE/IG帳號)",
] as const;

export interface MaihuobianXlsmInspection {
  worksheetNames: string[];
  templateVersion: string;
  headers: string[];
  vbaSha256: string;
  hasMacroEnabledContentType: boolean;
  hasVbaRelationship: boolean;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gu)].map((match) =>
    [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)]
      .map((part) => decodeXml(part[1]))
      .join(""),
  );
}

function sharedStringCell(
  worksheetXml: string,
  reference: string,
  sharedStrings: readonly string[],
): string {
  const cell = new RegExp(
    `<c\\s[^>]*r=["']${reference}["'][^>]*t=["']s["'][^>]*>[\\s\\S]*?<v>(\\d+)<\\/v>[\\s\\S]*?<\\/c>`,
    "u",
  ).exec(worksheetXml);
  if (!cell) throw new Error(`Official XLSM is missing ${reference}`);
  const value = sharedStrings[Number(cell[1])];
  if (value === undefined) {
    throw new Error(`Official XLSM ${reference} has an invalid shared string`);
  }
  return value;
}

async function requiredText(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  if (!entry) throw new Error(`Official XLSM is missing ${path}`);
  return entry.async("string");
}

async function requiredBytes(zip: JSZip, path: string): Promise<Uint8Array> {
  const entry = zip.file(path);
  if (!entry) throw new Error(`Official XLSM is missing ${path}`);
  return entry.async("uint8array");
}

export function getOfficialMaihuobianTemplate(): Buffer {
  const value = Buffer.from(MAIHUOBIAN_OFFICIAL_TEMPLATE_V14_BASE64, "base64");
  if (sha256(value) !== MAIHUOBIAN_OFFICIAL_TEMPLATE_SHA256) {
    throw new Error("Official Maihuobian XLSM asset hash mismatch");
  }
  return value;
}

export async function inspectMaihuobianXlsm(
  workbook: Uint8Array,
): Promise<MaihuobianXlsmInspection> {
  const zip = await JSZip.loadAsync(workbook);
  const [
    workbookXml,
    relationshipsXml,
    contentTypesXml,
    instructionsXml,
    dataXml,
    sharedStringsXml,
    vba,
  ] = await Promise.all([
    requiredText(zip, WORKBOOK_PATH),
    requiredText(zip, WORKBOOK_RELATIONSHIPS_PATH),
    requiredText(zip, CONTENT_TYPES_PATH),
    requiredText(zip, INSTRUCTIONS_SHEET_PATH),
    requiredText(zip, DATA_SHEET_PATH),
    requiredText(zip, SHARED_STRINGS_PATH),
    requiredBytes(zip, VBA_PATH),
  ]);
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const worksheetNames = [
    ...workbookXml.matchAll(/<sheet\s[^>]*name=["']([^"']+)["']/gu),
  ].map((match) => decodeXml(match[1]));
  const headers = "ABCDEFGHIJ"
    .split("")
    .map((column) => sharedStringCell(dataXml, `${column}6`, sharedStrings));

  return {
    worksheetNames,
    templateVersion: sharedStringCell(instructionsXml, "B1", sharedStrings),
    headers,
    vbaSha256: sha256(vba),
    hasMacroEnabledContentType: contentTypesXml.includes(
      "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
    ),
    hasVbaRelationship: relationshipsXml.includes(
      "http://schemas.microsoft.com/office/2006/relationships/vbaProject",
    ),
  };
}

function assertOfficialStructure(inspection: MaihuobianXlsmInspection): void {
  if (
    inspection.worksheetNames.length !== MAIHUOBIAN_WORKSHEET_NAMES.length ||
    inspection.worksheetNames.some(
      (name, index) => name !== MAIHUOBIAN_WORKSHEET_NAMES[index],
    )
  ) {
    throw new Error("Official XLSM worksheet names do not match v1.4");
  }
  if (inspection.templateVersion !== MAIHUOBIAN_TEMPLATE_VERSION) {
    throw new Error("Official XLSM template version is not 1.4");
  }
  if (
    inspection.headers.length !== MAIHUOBIAN_IMPORT_HEADERS.length ||
    inspection.headers.some(
      (header, index) => header !== MAIHUOBIAN_IMPORT_HEADERS[index],
    )
  ) {
    throw new Error("Official XLSM import columns do not match v1.4");
  }
  if (
    inspection.vbaSha256 !== MAIHUOBIAN_OFFICIAL_VBA_SHA256 ||
    !inspection.hasMacroEnabledContentType ||
    !inspection.hasVbaRelationship
  ) {
    throw new Error("Official XLSM VBA package is incomplete or changed");
  }
}

function inlineCell(reference: string, value: string): string {
  return `<c r="${reference}" s="18" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function numericCell(reference: string, value: string): string {
  return `<c r="${reference}" s="18" t="n"><v>${escapeXml(value)}</v></c>`;
}

function renderDataRow(row: MaihuobianValidatedRow, index: number): string {
  const rowNumber = index + 7;
  return `<row r="${rowNumber}" spans="1:10">${[
    inlineCell(`A${rowNumber}`, row.recipientName),
    inlineCell(`B${rowNumber}`, row.recipientPhone),
    inlineCell(`C${rowNumber}`, row.cvsStoreId),
    inlineCell(`D${rowNumber}`, row.temperature),
    inlineCell(`E${rowNumber}`, row.productSummary),
    numericCell(`F${rowNumber}`, row.totalPrice),
    numericCell(`G${rowNumber}`, row.shippingFee),
    inlineCell(`H${rowNumber}`, row.orderDate),
    inlineCell(`I${rowNumber}`, row.notes),
    inlineCell(`J${rowNumber}`, row.socialAccount),
  ].join("")}</row>`;
}

async function assertOnlyDataWorksheetChanged(
  original: JSZip,
  output: JSZip,
): Promise<void> {
  const paths = Object.keys(original.files).filter(
    (path) => !original.files[path].dir && path !== DATA_SHEET_PATH,
  );
  for (const path of paths) {
    const [before, after] = await Promise.all([
      requiredBytes(original, path),
      requiredBytes(output, path),
    ]);
    if (!Buffer.from(before).equals(Buffer.from(after))) {
      throw new Error(
        `XLSM generation changed protected package entry ${path}`,
      );
    }
  }
}

/**
 * Fills only the official v1.4 data worksheet. All other ZIP entries,
 * including the VBA project, version sheet, styles and relationships, must
 * remain byte-for-byte identical or generation fails closed.
 */
export async function generateMaihuobianXlsm(
  rows: readonly MaihuobianValidatedRow[],
): Promise<Buffer> {
  if (rows.length === 0 || rows.length > 500) {
    throw new RangeError("Maihuobian XLSM requires 1 to 500 rows");
  }

  const template = getOfficialMaihuobianTemplate();
  const originalZip = await JSZip.loadAsync(template);
  assertOfficialStructure(await inspectMaihuobianXlsm(template));
  const worksheetXml = await requiredText(originalZip, DATA_SHEET_PATH);
  const sheetData = /<sheetData>([\s\S]*?)<\/sheetData>/u.exec(worksheetXml);
  if (!sheetData) throw new Error("Official XLSM data worksheet is malformed");
  const protectedRows = [
    ...sheetData[1].matchAll(
      /<row\s[^>]*r=["']([1-6])["'][^>]*>[\s\S]*?<\/row>/gu,
    ),
  ].map((match) => match[0]);
  if (protectedRows.length !== 6) {
    throw new Error("Official XLSM protected header rows changed");
  }

  const lastRow = rows.length + 6;
  const updatedWorksheet = worksheetXml
    .replace(
      /<dimension\s+ref=["'][^"']+["']\s*\/>/u,
      `<dimension ref="A1:K${lastRow}"/>`,
    )
    .replace(
      /<sheetData>[\s\S]*?<\/sheetData>/u,
      `<sheetData>${protectedRows.join("")}${rows.map(renderDataRow).join("")}</sheetData>`,
    );

  originalZip.file(DATA_SHEET_PATH, updatedWorksheet);
  const result = await originalZip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  const outputZip = await JSZip.loadAsync(result);
  await assertOnlyDataWorksheetChanged(
    await JSZip.loadAsync(template),
    outputZip,
  );
  assertOfficialStructure(await inspectMaihuobianXlsm(result));
  return result;
}
