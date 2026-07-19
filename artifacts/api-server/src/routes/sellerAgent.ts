import { Router } from "express";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sellerAgentSettingsTable } from "@workspace/db";
import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";
import { logger } from "../lib/logger.ts";

const router = Router();

// Allowed values for PATCH validation
const VALID_AGENT_STATUS = new Set(["disabled", "enabled"]);
// platform_managed_reserved is excluded — sellers may not set this directly
const VALID_AGENT_MODE_SELLER = new Set([
  "self_hosted_webhook",
  "external_agent",
  "rule_worker",
]);
const VALID_QUERY_FREQUENCY = new Set([
  "manual",
  "daily",
  "every_6_hours",
  "every_2_hours_high_tier",
]);
const VALID_LOGISTICS = new Set([
  "seven_eleven",
  "family_mart",
  "home_delivery",
  "other",
  "webhook",
]);
const VALID_QUERY_METHODS = new Set([
  "manual",
  "csv_import",
  "webhook",
  "scheduled",
]);

const ALLOWED_PATCH_KEYS = new Set([
  "agentStatus",
  "agentMode",
  "enabledLogistics",
  "queryMethods",
  "queryFrequency",
  "notifyOnUnknown",
  "requireConfirmOnException",
  "requireConfirmOnReturned",
  "requireConfirmOnDelivered",
  "hideErrorDetailsFromBuyer",
  "webhookEnabled",
  "webhookUrl",
  "webhookSecret",
]);

const FORBIDDEN_PATCH_KEYS = new Set([
  "id",
  "storeId",
  "merchantId",
  "createdAt",
  "updatedAt",
  "lastRunAt",
  "lastTestRunAt",
  "webhookSecretHash",
]);

type SafeSettings = {
  id?: number;
  storeId: number;
  merchantId: string;
  agentStatus: string;
  agentMode: string;
  enabledLogistics: string[];
  queryMethods: string[];
  queryFrequency: string;
  notifyOnUnknown: boolean;
  requireConfirmOnException: boolean;
  requireConfirmOnReturned: boolean;
  requireConfirmOnDelivered: boolean;
  hideErrorDetailsFromBuyer: boolean;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  hasWebhookSecret: boolean;
  lastTestRunAt: string | null;
  lastRunAt: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function toSafeSettings(
  row: typeof sellerAgentSettingsTable.$inferSelect,
): SafeSettings {
  return {
    id: row.id,
    storeId: row.storeId,
    merchantId: row.merchantId,
    agentStatus: row.agentStatus,
    agentMode: row.agentMode,
    enabledLogistics: (row.enabledLogistics as string[]) ?? [],
    queryMethods: (row.queryMethods as string[]) ?? ["manual"],
    queryFrequency: row.queryFrequency,
    notifyOnUnknown: row.notifyOnUnknown,
    requireConfirmOnException: row.requireConfirmOnException,
    requireConfirmOnReturned: row.requireConfirmOnReturned,
    requireConfirmOnDelivered: row.requireConfirmOnDelivered,
    hideErrorDetailsFromBuyer: row.hideErrorDetailsFromBuyer,
    webhookEnabled: row.webhookEnabled,
    webhookUrl: row.webhookUrl ?? null,
    hasWebhookSecret: row.webhookSecretHash !== null,
    lastTestRunAt: row.lastTestRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function defaultSettings(storeId: number, merchantId: string): SafeSettings {
  return {
    storeId,
    merchantId,
    agentStatus: "disabled",
    agentMode: "rule_worker",
    enabledLogistics: [],
    queryMethods: ["manual"],
    queryFrequency: "manual",
    notifyOnUnknown: true,
    requireConfirmOnException: true,
    requireConfirmOnReturned: false,
    requireConfirmOnDelivered: false,
    hideErrorDetailsFromBuyer: true,
    webhookEnabled: false,
    webhookUrl: null,
    hasWebhookSecret: false,
    lastTestRunAt: null,
    lastRunAt: null,
  };
}

// GET /stores/:storeId/agent/settings
// Returns current seller agent settings for the given store.
// If no row exists, returns a safe in-memory default (no DB write).
router.get(
  "/stores/:storeId/agent/settings",
  requireAuth,
  async (req: any, res) => {
    try {
      const storeId = parseInt(req.params.storeId, 10);
      if (isNaN(storeId))
        return res.status(400).json({ error: "Invalid storeId" });

      if (!(await verifyStoreOwner(req, res, storeId))) return;

      const [row] = await db
        .select()
        .from(sellerAgentSettingsTable)
        .where(eq(sellerAgentSettingsTable.storeId, storeId))
        .limit(1);

      if (!row) {
        return res.json({ data: defaultSettings(storeId, req.userId) });
      }

      return res.json({ data: toSafeSettings(row) });
    } catch (err) {
      logger.error({ err }, "seller_agent_settings_get_failed");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /stores/:storeId/agent/settings
// Upserts seller agent settings for the given store.
// webhookSecret (plaintext) is accepted and SHA-256 hashed; the hash is stored, not the plaintext.
// webhookSecretHash is never returned in the response.
router.patch(
  "/stores/:storeId/agent/settings",
  requireAuth,
  async (req: any, res) => {
    try {
      const storeId = parseInt(req.params.storeId, 10);
      if (isNaN(storeId))
        return res.status(400).json({ error: "Invalid storeId" });

      if (!(await verifyStoreOwner(req, res, storeId))) return;

      const body = req.body ?? {};

      // Reject forbidden or unknown keys
      for (const key of Object.keys(body)) {
        if (FORBIDDEN_PATCH_KEYS.has(key)) {
          return res
            .status(400)
            .json({ error: `Field "${key}" is not patchable` });
        }
        if (!ALLOWED_PATCH_KEYS.has(key)) {
          return res.status(400).json({ error: `Unknown field: "${key}"` });
        }
      }

      const patch: Record<string, unknown> = {};

      if ("agentStatus" in body) {
        if (!VALID_AGENT_STATUS.has(body.agentStatus)) {
          return res.status(400).json({
            error: "invalid_agent_status",
            message: `agentStatus must be one of: ${[...VALID_AGENT_STATUS].join(", ")}`,
          });
        }
        patch.agentStatus = body.agentStatus;
      }

      if ("agentMode" in body) {
        if (!VALID_AGENT_MODE_SELLER.has(body.agentMode)) {
          return res.status(400).json({
            error: "invalid_agent_mode",
            message: `agentMode must be one of: ${[...VALID_AGENT_MODE_SELLER].join(", ")} (platform_managed_reserved is reserved and not selectable)`,
          });
        }
        patch.agentMode = body.agentMode;
      }

      if ("queryFrequency" in body) {
        if (!VALID_QUERY_FREQUENCY.has(body.queryFrequency)) {
          return res.status(400).json({
            error: "invalid_query_frequency",
            message: `queryFrequency must be one of: ${[...VALID_QUERY_FREQUENCY].join(", ")}`,
          });
        }
        patch.queryFrequency = body.queryFrequency;
      }

      if ("enabledLogistics" in body) {
        if (!Array.isArray(body.enabledLogistics)) {
          return res
            .status(400)
            .json({ error: "enabledLogistics must be an array" });
        }
        for (const item of body.enabledLogistics as unknown[]) {
          if (!VALID_LOGISTICS.has(item as string)) {
            return res.status(400).json({
              error: "invalid_logistics",
              message: `enabledLogistics item "${item}" is invalid. Must be one of: ${[...VALID_LOGISTICS].join(", ")}`,
            });
          }
        }
        patch.enabledLogistics = body.enabledLogistics;
      }

      if ("queryMethods" in body) {
        if (!Array.isArray(body.queryMethods)) {
          return res
            .status(400)
            .json({ error: "queryMethods must be an array" });
        }
        for (const item of body.queryMethods as unknown[]) {
          if (!VALID_QUERY_METHODS.has(item as string)) {
            return res.status(400).json({
              error: "invalid_query_method",
              message: `queryMethods item "${item}" is invalid. Must be one of: ${[...VALID_QUERY_METHODS].join(", ")}`,
            });
          }
        }
        patch.queryMethods = body.queryMethods;
      }

      if ("notifyOnUnknown" in body) {
        if (typeof body.notifyOnUnknown !== "boolean") {
          return res
            .status(400)
            .json({ error: "notifyOnUnknown must be a boolean" });
        }
        patch.notifyOnUnknown = body.notifyOnUnknown;
      }

      if ("requireConfirmOnException" in body) {
        if (typeof body.requireConfirmOnException !== "boolean") {
          return res
            .status(400)
            .json({ error: "requireConfirmOnException must be a boolean" });
        }
        patch.requireConfirmOnException = body.requireConfirmOnException;
      }

      if ("requireConfirmOnReturned" in body) {
        if (typeof body.requireConfirmOnReturned !== "boolean") {
          return res
            .status(400)
            .json({ error: "requireConfirmOnReturned must be a boolean" });
        }
        patch.requireConfirmOnReturned = body.requireConfirmOnReturned;
      }

      if ("requireConfirmOnDelivered" in body) {
        if (typeof body.requireConfirmOnDelivered !== "boolean") {
          return res
            .status(400)
            .json({ error: "requireConfirmOnDelivered must be a boolean" });
        }
        patch.requireConfirmOnDelivered = body.requireConfirmOnDelivered;
      }

      if ("hideErrorDetailsFromBuyer" in body) {
        if (typeof body.hideErrorDetailsFromBuyer !== "boolean") {
          return res
            .status(400)
            .json({ error: "hideErrorDetailsFromBuyer must be a boolean" });
        }
        patch.hideErrorDetailsFromBuyer = body.hideErrorDetailsFromBuyer;
      }

      if ("webhookEnabled" in body) {
        if (typeof body.webhookEnabled !== "boolean") {
          return res
            .status(400)
            .json({ error: "webhookEnabled must be a boolean" });
        }
        patch.webhookEnabled = body.webhookEnabled;
      }

      if ("webhookUrl" in body) {
        if (body.webhookUrl !== null && typeof body.webhookUrl !== "string") {
          return res
            .status(400)
            .json({ error: "webhookUrl must be a string or null" });
        }
        if (typeof body.webhookUrl === "string") {
          try {
            new URL(body.webhookUrl);
          } catch {
            return res
              .status(400)
              .json({ error: "webhookUrl must be a valid URL" });
          }
        }
        patch.webhookUrl = body.webhookUrl;
      }

      if ("webhookSecret" in body) {
        if (body.webhookSecret === null) {
          // Clearing the secret
          patch.webhookSecretHash = null;
        } else {
          if (
            typeof body.webhookSecret !== "string" ||
            body.webhookSecret.length < 16
          ) {
            return res.status(400).json({
              error: "webhookSecret must be a string of at least 16 characters",
            });
          }
          if (body.webhookSecret.length > 256) {
            return res
              .status(400)
              .json({ error: "webhookSecret must not exceed 256 characters" });
          }
          // SHA-256 hash; never store or log the plaintext
          patch.webhookSecretHash = createHash("sha256")
            .update(body.webhookSecret)
            .digest("hex");
        }
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "No patchable fields provided" });
      }

      // Upsert: INSERT on first call, UPDATE on conflict with storeId unique constraint
      const [upserted] = await db
        .insert(sellerAgentSettingsTable)
        .values({
          storeId,
          merchantId: req.userId,
          ...(patch as any),
        })
        .onConflictDoUpdate({
          target: sellerAgentSettingsTable.storeId,
          set: {
            ...(patch as any),
            updatedAt: new Date(),
          },
        })
        .returning();

      return res.json({ data: toSafeSettings(upserted) });
    } catch (err) {
      logger.error({ err }, "seller_agent_settings_patch_failed");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
