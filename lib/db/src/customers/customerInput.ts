export interface CustomerInput {
  code: unknown;
  name: unknown;
  phone: unknown;
  cvsStoreId?: unknown;
  cvsStoreName?: unknown;
  cvsStoreAddress?: unknown;
  cvsStorePhone?: unknown;
  notes?: unknown;
}

export interface ValidCustomerInput {
  code: string;
  name: string;
  phone: string;
  cvsStoreId: string | null;
  cvsStoreName: string | null;
  cvsStoreAddress: string | null;
  cvsStorePhone: string | null;
  notes: string | null;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} is required`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function validateCustomerInput(input: CustomerInput): ValidCustomerInput {
  return {
    code: requiredText(input.code, "code"),
    name: requiredText(input.name, "name"),
    phone: requiredText(input.phone, "phone"),
    cvsStoreId: optionalText(input.cvsStoreId),
    cvsStoreName: optionalText(input.cvsStoreName),
    cvsStoreAddress: optionalText(input.cvsStoreAddress),
    cvsStorePhone: optionalText(input.cvsStorePhone),
    notes: optionalText(input.notes),
  };
}
