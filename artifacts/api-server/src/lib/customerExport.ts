import { maskAddress, maskName, maskPhone } from "@workspace/db/privacy";

export type CustomerExportMode = "masked" | "cleartext";

export interface CustomerExportRecord {
  code: string;
  name: string;
  phone: string | null;
  tier: string;
  cvsStoreId: string | null;
  cvsStoreName: string | null;
  cvsStoreAddress: string | null;
  cvsStorePhone: string | null;
}

export function parseCustomerExportMode(
  value: unknown,
  cleartextConfirmed: boolean,
): CustomerExportMode {
  if (value == null || value === "masked") return "masked";
  if (value !== "cleartext") {
    throw new TypeError("Invalid customer export mode");
  }
  if (!cleartextConfirmed) {
    throw new TypeError(
      "Cleartext customer export requires explicit confirmation",
    );
  }
  return "cleartext";
}

function csvCell(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function formatCustomerExportCsv(
  customers: readonly CustomerExportRecord[],
  mode: CustomerExportMode,
): string {
  const rows = [
    [
      "客戶代號",
      "姓名",
      "手機",
      "等級",
      "常用門市代碼",
      "常用門市名稱",
      "常用門市地址",
      "常用門市電話",
    ],
    ...customers.map((customer) => [
      customer.code,
      mode === "masked" ? maskName(customer.name) : customer.name,
      mode === "masked" ? maskPhone(customer.phone) : customer.phone,
      customer.tier,
      customer.cvsStoreId,
      customer.cvsStoreName,
      mode === "masked"
        ? maskAddress(customer.cvsStoreAddress)
        : customer.cvsStoreAddress,
      mode === "masked"
        ? maskPhone(customer.cvsStorePhone)
        : customer.cvsStorePhone,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
