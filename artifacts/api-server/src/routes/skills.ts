import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  auditLogsTable,
  db,
  ordersTable,
  productsTable,
  shipmentTrackingsTable,
  storeSkillStatesTable,
  storesTable,
} from "@workspace/db";
import {
  SKILL_CATALOG_VERSION,
  SKILL_KEYS,
  evaluateSkillPrerequisites,
  isHighRiskSkill,
  isSkillKey,
  isSkillPackageKey,
  previewSkillPackage,
  previewSkillToggle,
  type SkillKey,
  type SkillMapFacts,
} from "@workspace/db/skill-map";

import { requireAuth, verifyStoreOwner } from "../middlewares/auth.ts";

const router: IRouter = Router();

function parseStoreId(value: unknown): number {
  const storeId = Number(value);
  if (!Number.isSafeInteger(storeId) || storeId <= 0) {
    throw new TypeError("storeId must be a positive integer");
  }
  return storeId;
}

async function loadSkillFacts(storeId: number): Promise<SkillMapFacts> {
  const [storeRows, productRows, orderRows, shipmentRows] = await Promise.all([
    db
      .select({ purchaseExchangeRate: storesTable.purchaseExchangeRate })
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1),
    db
      .select({
        costJpy: productsTable.costJpy,
        tripRouteId: productsTable.tripRouteId,
        vipPrice: productsTable.vipPrice,
        wholesalePrice: productsTable.wholesalePrice,
        partnerPrice: productsTable.partnerPrice,
      })
      .from(productsTable)
      .where(eq(productsTable.storeId, storeId)),
    db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(eq(ordersTable.storeId, storeId))
      .limit(1),
    db
      .select({ id: shipmentTrackingsTable.id })
      .from(shipmentTrackingsTable)
      .innerJoin(
        ordersTable,
        eq(shipmentTrackingsTable.orderId, ordersTable.id),
      )
      .where(eq(ordersTable.storeId, storeId))
      .limit(1),
  ]);
  const present = (value: unknown) =>
    value !== null && value !== undefined && value !== "";
  return {
    hasStore: storeRows.length > 0,
    hasProduct: productRows.length > 0,
    hasOrder: orderRows.length > 0,
    hasStoreExchangeRate: present(storeRows[0]?.purchaseExchangeRate),
    hasProductCost: productRows.some((product) => present(product.costJpy)),
    hasLinkedTripRoute: productRows.some((product) =>
      present(product.tripRouteId),
    ),
    hasTierPrice: productRows.some((product) =>
      [product.vipPrice, product.wholesalePrice, product.partnerPrice].some(
        present,
      ),
    ),
    hasShipmentOrder: shipmentRows.length > 0,
    // BATCH-7A package 2 added the reviewed report-only Phase 1 foundation.
    hasAutomationFoundation: true,
  };
}

async function loadEnabledSkills(storeId: number): Promise<Set<SkillKey>> {
  const rows = await db
    .select({ skillKey: storeSkillStatesTable.skillKey })
    .from(storeSkillStatesTable)
    .where(
      and(
        eq(storeSkillStatesTable.storeId, storeId),
        eq(storeSkillStatesTable.enabled, true),
      ),
    );
  return new Set(rows.map((row) => row.skillKey).filter(isSkillKey));
}

router.get("/stores/:storeId/skills", requireAuth, async (req: any, res) => {
  let storeId: number;
  try {
    storeId = parseStoreId(req.params.storeId);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
  if (!(await verifyStoreOwner(req, res, storeId))) return;

  const [facts, enabledSkills] = await Promise.all([
    loadSkillFacts(storeId),
    loadEnabledSkills(storeId),
  ]);
  return res.json({
    catalogVersion: SKILL_CATALOG_VERSION,
    skills: SKILL_KEYS.map((skillKey) => ({
      skillKey,
      enabled: enabledSkills.has(skillKey),
      highRisk: isHighRiskSkill(skillKey),
      prerequisite: evaluateSkillPrerequisites(skillKey, facts),
    })),
  });
});

router.post(
  "/stores/:storeId/skills/:skillKey/preview",
  requireAuth,
  async (req: any, res) => {
    let storeId: number;
    try {
      storeId = parseStoreId(req.params.storeId);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;
    if (!isSkillKey(req.params.skillKey)) {
      return res.status(404).json({ error: "Skill not found" });
    }
    const requestedEnabled = req.body?.enabled;
    if (typeof requestedEnabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be boolean" });
    }
    const [facts, enabledSkills] = await Promise.all([
      loadSkillFacts(storeId),
      loadEnabledSkills(storeId),
    ]);
    return res.json(
      previewSkillToggle({
        skillKey: req.params.skillKey,
        currentEnabled: enabledSkills.has(req.params.skillKey),
        requestedEnabled,
        facts,
      }),
    );
  },
);

router.post(
  "/stores/:storeId/skills/:skillKey/enable",
  requireAuth,
  async (req: any, res) => {
    let storeId: number;
    try {
      storeId = parseStoreId(req.params.storeId);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;
    if (!isSkillKey(req.params.skillKey)) {
      return res.status(404).json({ error: "Skill not found" });
    }
    const requestedEnabled = req.body?.enabled;
    if (typeof requestedEnabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be boolean" });
    }
    if (req.body?.catalogVersion !== SKILL_CATALOG_VERSION) {
      return res
        .status(409)
        .json({ error: "Skill catalog changed; preview again" });
    }

    const facts = await loadSkillFacts(storeId);
    const prerequisite = evaluateSkillPrerequisites(req.params.skillKey, facts);
    if (requestedEnabled && !prerequisite.ready) {
      return res
        .status(409)
        .json({ error: "Skill prerequisite is not ready", prerequisite });
    }
    if (
      requestedEnabled &&
      isHighRiskSkill(req.params.skillKey) &&
      (req.body?.confirmImpact !== true || req.body?.confirmRisk !== true)
    ) {
      return res
        .status(409)
        .json({ error: "High-risk skill requires two confirmations" });
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .insert(storeSkillStatesTable)
        .values({
          storeId,
          skillKey: req.params.skillKey,
          enabled: requestedEnabled,
          enabledAt: requestedEnabled ? now : null,
          enabledBy: requestedEnabled ? req.userId : null,
          catalogVersion: SKILL_CATALOG_VERSION,
          source: "manual",
          disabledAt: requestedEnabled ? null : now,
        })
        .onConflictDoUpdate({
          target: [
            storeSkillStatesTable.storeId,
            storeSkillStatesTable.skillKey,
          ],
          set: {
            enabled: requestedEnabled,
            enabledAt: requestedEnabled ? now : null,
            enabledBy: requestedEnabled ? req.userId : null,
            catalogVersion: SKILL_CATALOG_VERSION,
            source: "manual",
            disabledAt: requestedEnabled ? null : now,
          },
        });
      await tx.insert(auditLogsTable).values({
        storeId,
        actor: req.userId,
        action: requestedEnabled ? "skill_enabled" : "skill_disabled",
        target: `skill:${req.params.skillKey}`,
      });
    });
    return res.json({
      skillKey: req.params.skillKey,
      enabled: requestedEnabled,
    });
  },
);

router.post(
  "/stores/:storeId/skill-packages/:packageKey/preview",
  requireAuth,
  async (req: any, res) => {
    let storeId: number;
    try {
      storeId = parseStoreId(req.params.storeId);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;
    if (!isSkillPackageKey(req.params.packageKey)) {
      return res.status(404).json({ error: "Skill package not found" });
    }
    const [facts, enabledSkills] = await Promise.all([
      loadSkillFacts(storeId),
      loadEnabledSkills(storeId),
    ]);
    return res.json(
      previewSkillPackage({
        packageKey: req.params.packageKey,
        enabledSkills,
        facts,
      }),
    );
  },
);

router.post(
  "/stores/:storeId/skill-packages/:packageKey/apply",
  requireAuth,
  async (req: any, res) => {
    let storeId: number;
    try {
      storeId = parseStoreId(req.params.storeId);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    if (!(await verifyStoreOwner(req, res, storeId))) return;
    if (!isSkillPackageKey(req.params.packageKey)) {
      return res.status(404).json({ error: "Skill package not found" });
    }
    if (req.body?.catalogVersion !== SKILL_CATALOG_VERSION) {
      return res
        .status(409)
        .json({ error: "Skill catalog changed; preview again" });
    }
    const [facts, enabledSkills] = await Promise.all([
      loadSkillFacts(storeId),
      loadEnabledSkills(storeId),
    ]);
    const preview = previewSkillPackage({
      packageKey: req.params.packageKey,
      enabledSkills,
      facts,
    });
    const now = new Date();
    await db.transaction(async (tx) => {
      for (const skillKey of preview.enableNow) {
        await tx
          .insert(storeSkillStatesTable)
          .values({
            storeId,
            skillKey,
            enabled: true,
            enabledAt: now,
            enabledBy: req.userId,
            catalogVersion: SKILL_CATALOG_VERSION,
            source: "package",
          })
          .onConflictDoUpdate({
            target: [
              storeSkillStatesTable.storeId,
              storeSkillStatesTable.skillKey,
            ],
            set: {
              enabled: true,
              enabledAt: now,
              enabledBy: req.userId,
              catalogVersion: SKILL_CATALOG_VERSION,
              source: "package",
              disabledAt: null,
            },
          });
      }
      await tx.insert(auditLogsTable).values({
        storeId,
        actor: req.userId,
        action: "skill_package_applied",
        target: `skill-package:${req.params.packageKey}`,
      });
    });
    return res.json(preview);
  },
);

export default router;
