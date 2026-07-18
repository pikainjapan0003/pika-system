const DATABASE_URL_FLAG = "--database-url";
const APPEND_FLAG = "--append";
const FORBIDDEN_TARGET_PATTERN = /(replit|prod)/i;

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Demo seeding is intentionally opt-in. It never falls back to the process
 * environment, so a shell that happens to contain a production URL cannot be
 * modified by omitting the CLI flag.
 */
export interface DemoSeedCliOptions {
  databaseUrl: string;
  append: boolean;
}

export function parseExplicitDemoSeedOptions(
  args: readonly string[],
): DemoSeedCliOptions {
  let databaseUrl: string | null = null;
  let append = false;
  let appendSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (index === 0 && argument === "--") continue;

    if (argument === APPEND_FLAG) {
      if (appendSeen) fail(`${APPEND_FLAG} may only be provided once`);
      append = true;
      appendSeen = true;
      continue;
    }

    if (argument === DATABASE_URL_FLAG) {
      if (databaseUrl !== null)
        fail(`${DATABASE_URL_FLAG} may only be provided once`);
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        fail(`${DATABASE_URL_FLAG} requires an explicit value`);
      }
      databaseUrl = value;
      index += 1;
      continue;
    }

    if (argument.startsWith(`${DATABASE_URL_FLAG}=`)) {
      if (databaseUrl !== null)
        fail(`${DATABASE_URL_FLAG} may only be provided once`);
      databaseUrl = argument.slice(`${DATABASE_URL_FLAG}=`.length);
      if (!databaseUrl) fail(`${DATABASE_URL_FLAG} requires an explicit value`);
      continue;
    }

    fail(`Unknown argument: ${argument}`);
  }

  if (databaseUrl === null) {
    fail(
      `${DATABASE_URL_FLAG} is required; environment DATABASE_URL is never used`,
    );
  }

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

  let decodedTarget = databaseUrl;
  try {
    decodedTarget = decodeURIComponent(databaseUrl);
  } catch {
    fail(`${DATABASE_URL_FLAG} contains invalid URL encoding`);
  }
  if (FORBIDDEN_TARGET_PATTERN.test(decodedTarget)) {
    fail(
      "Refusing demo seed: database URL contains a Replit/production marker",
    );
  }

  return { databaseUrl, append };
}

export function parseExplicitDemoDatabaseUrl(args: readonly string[]): string {
  return parseExplicitDemoSeedOptions(args).databaseUrl;
}

export function assertDemoAppendAllowed(
  existingDemoRowCount: number,
  append: boolean,
): void {
  if (existingDemoRowCount > 0 && !append) {
    fail(
      `Demo data already exists (${existingDemoRowCount} matching rows); rerun with --append only if duplication is intentional`,
    );
  }
}
