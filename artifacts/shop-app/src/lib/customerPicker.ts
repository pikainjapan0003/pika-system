export interface SearchableCustomer {
  id: number;
  code: string;
  name: string;
}

export function filterCustomerOptions<T extends SearchableCustomer>(
  customers: readonly T[],
  query: string,
): T[] {
  const normalized = query.trim().toLocaleLowerCase("zh-TW");
  if (!normalized) return [...customers];
  return customers.filter(
    (customer) =>
      customer.code.toLocaleLowerCase("zh-TW").includes(normalized) ||
      customer.name.toLocaleLowerCase("zh-TW").includes(normalized),
  );
}
