const DATABASE_URL_FLAG = "--database-url";
const STORE_ID_FLAG = "--store-id";
const APPLY_FLAG = "--apply";
const FORBIDDEN_TARGET_PATTERN = /(replit|prod)/i;

function fail(message: string): never {
  throw new Error(message);
}

export interface BackfillTripStoreOptions {
  databaseUrl: string;
  storeId: number;
  apply: boolean;
}

export function parseBackfillTripStoreOptions(
  args: readonly string[],
): BackfillTripStoreOptions {
  let databaseUrl: string | null = null;
  let storeId: number | null = null;
  let apply = false;
  let applySeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (index === 0 && argument === "--") continue;

    if (argument === APPLY_FLAG) {
      if (applySeen) fail(`${APPLY_FLAG} may only be provided once`);
      applySeen = true;
      apply = true;
      continue;
    }

    const readFlagValue = (flag: string): string | null => {
      if (argument === flag) {
        const value = args[index + 1];
        if (!value || value.startsWith("--")) {
          fail(`${flag} requires an explicit value`);
        }
        index += 1;
        return value;
      }
      if (argument.startsWith(`${flag}=`)) {
        const value = argument.slice(`${flag}=`.length);
        if (!value) fail(`${flag} requires an explicit value`);
        return value;
      }
      return null;
    };

    const databaseUrlValue = readFlagValue(DATABASE_URL_FLAG);
    if (databaseUrlValue !== null) {
      if (databaseUrl !== null)
        fail(`${DATABASE_URL_FLAG} may only be provided once`);
      databaseUrl = databaseUrlValue;
      continue;
    }

    const storeIdValue = readFlagValue(STORE_ID_FLAG);
    if (storeIdValue !== null) {
      if (storeId !== null) fail(`${STORE_ID_FLAG} may only be provided once`);
      if (!/^\d+$/.test(storeIdValue))
        fail(`${STORE_ID_FLAG} must be a positive integer`);
      storeId = Number(storeIdValue);
      if (!Number.isSafeInteger(storeId) || storeId <= 0)
        fail(`${STORE_ID_FLAG} must be a positive integer`);
      continue;
    }

    fail(`Unknown argument: ${argument}`);
  }

  if (databaseUrl === null) {
    fail(
      `${DATABASE_URL_FLAG} is required; environment DATABASE_URL is never used`,
    );
  }
  if (storeId === null) fail(`${STORE_ID_FLAG} is required`);

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail(`${DATABASE_URL_FLAG} must be a valid PostgreSQL URL`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    fail(`${DATABASE_URL_FLAG} must use postgres:// or postgresql://`);
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
    fail(`${DATABASE_URL_FLAG} must include a host and database name`);
  }

  let decodedTarget: string;
  try {
    decodedTarget = decodeURIComponent(databaseUrl);
  } catch {
    fail(`${DATABASE_URL_FLAG} contains invalid URL encoding`);
  }
  if (FORBIDDEN_TARGET_PATTERN.test(decodedTarget)) {
    fail("Refusing trip backfill: URL contains a Replit/production marker");
  }

  return { databaseUrl, storeId, apply };
}
