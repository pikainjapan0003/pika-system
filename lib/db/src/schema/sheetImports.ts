// Phase 1 foundation. SQL 0041 additionally installs immutable triggers and
// tenant guards for the two legacy optional catalog hints; use SQL to migrate.
import { pgTable, serial, integer, text, numeric, boolean, timestamp, date, jsonb, check, unique, uniqueIndex, index, foreignKey, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { storesTable } from "./stores.ts";
import { catalogProductsTable } from "./catalogProducts.ts";

export const sheetImportBatchesTable = pgTable("sheet_import_batches", {
  sourceType: text("source_type").notNull().default("LEGACY_UNVERIFIED"),
  originalFileSha256: text("original_file_sha256"),
  originalFileBytes: customType<{data:Buffer;driverData:Buffer}>({dataType:()=>"bytea"})("original_file_bytes"),
  sourceMeta: jsonb("source_meta").notNull().default({}),
  reviewVersion: integer("review_version").notNull().default(0),
  approvalVersion: integer("approval_version"),
  approvalHash: text("approval_hash"),
  rolledBackAt: timestamp("rolled_back_at", {withTimezone:true}),
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  spreadsheetId: text("spreadsheet_id").notNull(),
  spreadsheetTitle: text("spreadsheet_title").notNull(),
  sheetTitle: text("sheet_title").notNull(),
  sourceHash: text("source_hash").notNull(),
  status: text("status").notNull().default(sql.raw("'DRAFT'")),
  exchangeRateSnapshot: numeric("exchange_rate_snapshot", { precision: 30, scale: 12 }),
  requestedBy: text("requested_by").notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql.raw("now()")),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  committedAt: timestamp("committed_at", { withTimezone: true }),
}, (t) => [
  unique("sheet_import_batches_store_id_key").on(t.storeId, t.id),
  unique("sheet_import_batches_source_key").on(t.storeId, t.spreadsheetId, t.sheetTitle, t.sourceHash),
  foreignKey({ name: "sheet_import_batches_store_fk", columns: [t.storeId], foreignColumns: [storesTable.id] }).onDelete("restrict"),
  check("sheet_import_batches_status_valid", sql.raw("status IN ('DRAFT','PREVIEWED','APPROVED','COMMITTED','ROLLED_BACK','FAILED')")),
  check("sheet_import_batches_exchange_rate_snapshot_valid", sql.raw("exchange_rate_snapshot <> 'NaN'::numeric AND exchange_rate_snapshot > 0")),
]);

export const sheetImportRowsTable = pgTable("sheet_import_rows", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  batchId: integer("batch_id").notNull(),
  sourceRowNumber: integer("source_row_number").notNull(),
  rawValues: jsonb("raw_values").notNull(),
  rawFormulas: jsonb("raw_formulas").notNull(),
  rowHash: text("row_hash").notNull(),
  rowKind: text("row_kind").notNull(),
  sourceGroup: text("source_group"),
  normalizedName: text("normalized_name"),
  barcodeCandidate: text("barcode_candidate"),
  weightCandidate: numeric("weight_candidate", { precision: 12, scale: 2 }),
  originalPriceJpyCandidate: numeric("original_price_jpy_candidate", { precision: 30, scale: 12 }),
  effectiveCostJpyCandidate: numeric("effective_cost_jpy_candidate", { precision: 30, scale: 12 }),
  matchStatus: text("match_status").notNull(),
  matchedCatalogProductId: integer("matched_catalog_product_id"),
  warnings: jsonb("warnings").notNull(),
  resolution: jsonb("resolution"),
  committedAt: timestamp("committed_at", { withTimezone: true }),
}, (t) => [
  unique("sheet_import_rows_store_id_key").on(t.storeId, t.id),
  unique("sheet_import_rows_row_key").on(t.batchId, t.sourceRowNumber),
  foreignKey({ name: "sheet_import_rows_store_fk", columns: [t.storeId], foreignColumns: [storesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "sheet_import_rows_batch_fk", columns: [t.storeId, t.batchId], foreignColumns: [sheetImportBatchesTable.storeId, sheetImportBatchesTable.id] }).onDelete("restrict"),
  foreignKey({ name: "sheet_import_rows_catalog_fk", columns: [t.storeId, t.matchedCatalogProductId], foreignColumns: [catalogProductsTable.storeId, catalogProductsTable.id] }).onDelete("restrict"),
  check("sheet_import_rows_row_positive", sql.raw("source_row_number > 0")),
  check("sheet_import_rows_weight_candidate_valid", sql.raw("weight_candidate <> 'NaN'::numeric AND weight_candidate >= 0")),
  check("sheet_import_rows_original_price_jpy_candidate_valid", sql.raw("original_price_jpy_candidate <> 'NaN'::numeric AND original_price_jpy_candidate >= 0")),
  check("sheet_import_rows_effective_cost_jpy_candidate_valid", sql.raw("effective_cost_jpy_candidate <> 'NaN'::numeric AND effective_cost_jpy_candidate >= 0")),
  check("sheet_import_rows_row_kind_valid", sql.raw("row_kind IN ('PRODUCT','SOURCE_GROUP','HEADER','TEST','EMPTY','UNKNOWN')")),
  check("sheet_import_rows_match_status_valid", sql.raw("match_status IN ('SAFE_CANDIDATE','CONFLICT','NEW','IGNORED')")),
]);
