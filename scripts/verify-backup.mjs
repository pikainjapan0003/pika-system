#!/usr/bin/env node

/**
 * Read-only PostgreSQL backup verifier.
 *
 * The dump is always read from an explicit --dump-file. An optional
 * --ephemeral-database-url is only for restoring schema into a disposable
 * verification database; the script never falls back to DATABASE_URL.
 */
import { access, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";

function usage(message) {
  if (message) console.error(`ERROR: ${message}`);
  console.error(
    "Usage: node scripts/verify-backup.mjs --dump-file <dump> [--ephemeral-database-url <url>]",
  );
  process.exitCode = 2;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dump-file") options.dumpFile = argv[++i];
    else if (arg === "--ephemeral-database-url")
      options.databaseUrl = argv[++i];
    else if (arg === "--help") return { help: true };
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function assertSafeDatabaseUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("--ephemeral-database-url must be a non-empty URL");
  }
  if (/(replit|production|prod)/i.test(value)) {
    throw new Error("refusing a Replit/production-looking database URL");
  }
  try {
    const url = new URL(value);
    if (!/^postgres(?:ql)?:$/.test(url.protocol)) {
      throw new Error("database URL must use postgres:// or postgresql://");
    }
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "invalid database URL",
    );
  }
}

function runPgRestore(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PG_RESTORE_BIN ?? "pg_restore", args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code, signal) =>
      resolve({ code: code ?? 1, signal, stdout, stderr }),
    );
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (typeof options.dumpFile !== "string" || options.dumpFile.trim() === "") {
    usage("--dump-file is required; DATABASE_URL is never used implicitly");
    return;
  }
  if (options.databaseUrl !== undefined)
    assertSafeDatabaseUrl(options.databaseUrl);

  const dump = options.dumpFile;
  await access(dump);
  const info = await stat(dump);
  if (!info.isFile() || info.size === 0)
    throw new Error("dump file must be a non-empty regular file");

  const list = await runPgRestore(["--list", "--no-password", dump]);
  if (list.code !== 0) {
    throw new Error(
      list.stderr.trim() || `pg_restore --list exited ${list.code}`,
    );
  }
  const entries = list.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (entries.length === 0)
    throw new Error("backup contains no archive entries");

  console.log(`BACKUP_FILE=${dump}`);
  console.log(`BACKUP_BYTES=${info.size}`);
  console.log(`ARCHIVE_ENTRIES=${entries.length}`);
  if (options.databaseUrl) {
    const schema = await runPgRestore([
      "--schema-only",
      "--no-owner",
      "--no-acl",
      "--no-password",
      "--exit-on-error",
      `--dbname=${options.databaseUrl}`,
      dump,
    ]);
    if (schema.code !== 0) {
      throw new Error(
        schema.stderr.trim() || `schema restore exited ${schema.code}`,
      );
    }
    console.log("EPHEMERAL_SCHEMA_RESTORE=pass");
  } else {
    console.log("EPHEMERAL_SCHEMA_RESTORE=not-requested");
  }
  console.log("BACKUP_VERIFY=pass");
}

try {
  await main();
} catch (error) {
  console.error(
    `BACKUP_VERIFY=fail: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
