import ExcelJS from "exceljs";
import type { LogisticsImportRow, ParsedSpreadsheet } from "./types.ts";

const COLUMN_CANDIDATES: Record<string, string[]> = {
  recipientName: ["收件人姓名"],
  trackingCode: ["配送單編號", "配送單號", "物流單號"],
  storeName: ["取件地址", "取件門市", "門市名稱"],
  externalOrderNo: ["訂單編號"],
  productText: ["商品名稱"],
  status: ["狀態"],
};

const cellText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && "richText" in v)
    return v.richText
      .map((r) => r.text)
      .join("")
      .trim();
  if (typeof v === "object" && "text" in v) return String(v.text).trim();
  return String(v).trim();
};

/**
 * Parses a 7-11 賣貨便「訂單資訊」export. Columns are located by header label
 * (the header row is the one containing 收件人姓名), never by fixed letters.
 */
export async function parseSevenElevenSpreadsheet(
  filePath: string,
  fileName: string,
): Promise<ParsedSpreadsheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("FORM_PARSE_FAILED: no worksheet");

  let headerRow = 0;
  const columnMapping: Record<string, string> = {};
  ws.eachRow((row, rowNumber) => {
    if (headerRow) return;
    const labels: Record<string, string> = {};
    row.eachCell((cell) => {
      labels[cell.address.replace(/\d+/g, "")] = cellText(cell).replace(
        /\s/g,
        "",
      );
    });
    if (!Object.values(labels).some((l) => l.includes("收件人姓名"))) return;
    headerRow = rowNumber;
    for (const [field, names] of Object.entries(COLUMN_CANDIDATES)) {
      for (const [col, label] of Object.entries(labels)) {
        if (names.some((n) => label.includes(n))) {
          columnMapping[field] = col;
          break;
        }
      }
    }
  });
  if (!headerRow || !columnMapping.trackingCode)
    throw new Error("FORM_PARSE_FAILED: 7-11 header row not found");

  const rows: LogisticsImportRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const get = (field: string) =>
      columnMapping[field]
        ? cellText(row.getCell(columnMapping[field])) || null
        : null;
    const trackingCode = get("trackingCode");
    if (!trackingCode) return;
    rows.push({
      rowNumber,
      recipientName: get("recipientName"),
      recipientPhone: null,
      trackingCode,
      storeName: get("storeName"),
      externalOrderNo: get("externalOrderNo"),
      productText: get("productText"),
      status: (get("status") || "").split(/[\r\n]/)[0] || null,
    });
  });

  return { provider: "711", fileName, headerRow, columnMapping, rows };
}
