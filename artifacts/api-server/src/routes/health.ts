import { readdir } from "node:fs/promises";
import path from "node:path";
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { sanitizeError } from "../lib/sanitizeError.ts";
import { logger } from "../lib/logger.ts";

const router: IRouter = Router();

const BUILD_TIME = process.env.BUILD_TIME ?? "unknown";
const MIGRATION_DIRECTORIES = [
  path.resolve(process.cwd(), "lib/db/migrations"),
  path.resolve(process.cwd(), "../../lib/db/migrations"),
];

async function latestMigration() {
  for (const directory of MIGRATION_DIRECTORIES) {
    try {
      const files = (await readdir(directory))
        .filter((file) => /^\d+_[^/]+\.sql$/.test(file))
        .sort();
      const filename = files.at(-1);
      if (filename) {
        return {
          filename,
          schemaVersion: filename.slice(0, filename.indexOf("_")),
        };
      }
    } catch {
      // The published bundle may not include the source migration directory.
    }
  }
  return { filename: null, schemaVersion: "unknown" };
}

router.get("/healthz", async (_req, res) => {
  const migration = await latestMigration();
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      status: "ok",
      database: "ok",
      latestMigration: migration.filename,
      schemaVersion: migration.schemaVersion,
      buildTime: BUILD_TIME,
    });
  } catch (error) {
    logger.warn({ err: sanitizeError(error) }, "Health database check failed");
    res.status(503).json({
      status: "degraded",
      database: "unavailable",
      latestMigration: migration.filename,
      schemaVersion: migration.schemaVersion,
      buildTime: BUILD_TIME,
    });
  }
});

export default router;
