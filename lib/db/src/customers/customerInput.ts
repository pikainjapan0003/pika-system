import { customerTierEnum } from "../schema/customers.ts";
import type { CustomerTier } from "../schema/customers.ts";

export interface CustomerInput {
  code: unknown;
  name: unknown;
  phone?: unknown;
  tier?: unknown;
  cvsStoreId?: unknown;
  cvsStoreName?: unknown;
  cvsStoreAddress?: unknown;
  cvsStorePhone?: unknown;
  notes?: unknown;
}

export interface ValidCustomerInput {
  code: string;
  name: string;
  phone: string | null;
  tier: CustomerTier;
  cvsStoreId: string | null;
  cvsStoreName: string | null;
  cvsStoreAddress: string | null;
  cvsStorePhone: string | null;
  notes: string | null;
}

export const CUSTOMER_TIERS = customerTierEnum;

export function parseCustomerTier(value: unknown): CustomerTier {
  const tier = value === undefined || value === null || value === "" ? "general" : value;
  if (typeof tier !== "string" || !CUSTOMER_TIERS.includes(tier as CustomerTier)) {
    throw new TypeError("tier must be general, vip, wholesale, or partner");
  }
  return tier as CustomerTier;
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
    phone: optionalText(input.phone),
    tier: parseCustomerTier(input.tier),
    cvsStoreId: optionalText(input.cvsStoreId),
    cvsStoreName: optionalText(input.cvsStoreName),
    cvsStoreAddress: optionalText(input.cvsStoreAddress),
    cvsStorePhone: optionalText(input.cvsStorePhone),
    notes: optionalText(input.notes),
  };
}
