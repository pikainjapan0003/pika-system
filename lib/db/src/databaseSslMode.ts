const SUPPORTED_DATABASE_SSL_MODES = new Set([
  "disable",
  "no-verify",
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
]);

/**
 * Applies an explicit node-postgres sslmode without changing the default
 * connection behavior when DATABASE_SSLMODE is unset. Replit currently
 * recommends `verify-full`; deployment configuration remains owner-controlled.
 */
export function applyDatabaseSslMode(
  connectionString: string,
  sslMode: string | undefined,
): string {
  const normalized = sslMode?.trim();
  if (!normalized) return connectionString;
  if (!SUPPORTED_DATABASE_SSL_MODES.has(normalized)) {
    throw new RangeError(`Unsupported DATABASE_SSLMODE: ${normalized}`);
  }

  const url = new URL(connectionString);
  url.searchParams.set("sslmode", normalized);
  return url.toString();
}
