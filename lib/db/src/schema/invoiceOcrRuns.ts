import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores.ts";
import { invoiceOcrTestCasesTable } from "./invoiceOcrTestCases.ts";

export const invoiceOcrRunStatuses = [
  "processing",
  "completed",
  "failed",
] as const;
export type InvoiceOcrRunStatus = (typeof invoiceOcrRunStatuses)[number];

export interface InvoiceOcrPredictionJson {
  merchant_name: string | null;
  invoice_date: string | null;
  total_amount: string | null;
  currency: string | null;
  review_required: boolean;
  review_reasons: string[];
  evidence: {
    merchant_name: string | null;
    invoice_date: string | null;
    total_amount: string | null;
    currency: string | null;
  };
}

export const invoiceOcrRunsTable = pgTable(
  "invoice_ocr_runs",
  {
    id: serial("id").primaryKey(),
    testCaseId: integer("test_case_id")
      .notNull()
      .references(() => invoiceOcrTestCasesTable.id, {
        onDelete: "cascade",
      }),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull(),
    clientRequestId: uuid("client_request_id").notNull(),
    requestedModel: text("requested_model").notNull(),
    actualModel: text("actual_model"),
    promptVersion: text("prompt_version").notNull(),
    imageDetail: text("image_detail").notNull(),
    reasoningEffort: text("reasoning_effort").notNull(),
    predictedJson: jsonb("predicted_json").$type<InvoiceOcrPredictionJson>(),
    reviewRequired: boolean("review_required"),
    reviewReasons: jsonb("review_reasons").$type<string[]>(),
    evidenceJson: jsonb("evidence_json").$type<
      InvoiceOcrPredictionJson["evidence"]
    >(),
    openaiResponseId: text("openai_response_id"),
    openaiRequestId: text("openai_request_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    latencyMs: integer("latency_ms"),
    status: text("status")
      .$type<InvoiceOcrRunStatus>()
      .notNull()
      .default("processing"),
    safeErrorCode: text("safe_error_code"),
    attemptCount: integer("attempt_count").notNull().default(1),
    rerunOfRunId: integer("rerun_of_run_id").references(
      (): AnyPgColumn => invoiceOcrRunsTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("invoice_ocr_runs_client_request_unique").on(
      table.clientRequestId,
    ),
    uniqueIndex("invoice_ocr_runs_one_processing_per_user_unique")
      .on(table.createdByUserId)
      .where(sql`${table.status} = 'processing'`),
    index("invoice_ocr_runs_test_case_created_idx").on(
      table.testCaseId,
      table.createdAt,
    ),
    index("invoice_ocr_runs_store_created_idx").on(
      table.storeId,
      table.createdAt,
    ),
    index("invoice_ocr_runs_benchmark_config_idx").on(
      table.requestedModel,
      table.promptVersion,
      table.imageDetail,
      table.reasoningEffort,
    ),
    check(
      "invoice_ocr_runs_status_valid",
      sql`${table.status} IN ('processing', 'completed', 'failed')`,
    ),
    check(
      "invoice_ocr_runs_requested_model_valid",
      sql`${table.requestedModel} IN ('gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6-luna')`,
    ),
    check(
      "invoice_ocr_runs_image_detail_valid",
      sql`${table.imageDetail} IN ('original', 'high', 'low', 'auto')`,
    ),
    check(
      "invoice_ocr_runs_reasoning_effort_valid",
      sql`${table.reasoningEffort} IN ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')`,
    ),
    check(
      "invoice_ocr_runs_attempt_count_valid",
      sql`${table.attemptCount} BETWEEN 1 AND 2`,
    ),
    check(
      "invoice_ocr_runs_usage_non_negative",
      sql`(${table.inputTokens} IS NULL OR ${table.inputTokens} >= 0)
        AND (${table.outputTokens} IS NULL OR ${table.outputTokens} >= 0)
        AND (${table.totalTokens} IS NULL OR ${table.totalTokens} >= 0)
        AND (${table.cachedInputTokens} IS NULL OR ${table.cachedInputTokens} >= 0)
        AND (${table.reasoningTokens} IS NULL OR ${table.reasoningTokens} >= 0)
        AND (${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0)`,
    ),
    check(
      "invoice_ocr_runs_completed_shape",
      sql`${table.status} <> 'completed' OR (
        ${table.actualModel} IS NOT NULL
        AND ${table.predictedJson} IS NOT NULL
        AND ${table.reviewRequired} IS NOT NULL
        AND ${table.reviewReasons} IS NOT NULL
        AND ${table.evidenceJson} IS NOT NULL
        AND ${table.openaiResponseId} IS NOT NULL
        AND ${table.latencyMs} IS NOT NULL
        AND ${table.completedAt} IS NOT NULL
      )`,
    ),
    check(
      "invoice_ocr_runs_failed_shape",
      sql`${table.status} <> 'failed' OR (
        ${table.safeErrorCode} IS NOT NULL
        AND ${table.completedAt} IS NOT NULL
      )`,
    ),
    check(
      "invoice_ocr_runs_error_code_safe_length",
      sql`${table.safeErrorCode} IS NULL OR char_length(${table.safeErrorCode}) BETWEEN 1 AND 80`,
    ),
  ],
);

export const insertInvoiceOcrRunSchema = createInsertSchema(
  invoiceOcrRunsTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertInvoiceOcrRun = z.infer<typeof insertInvoiceOcrRunSchema>;
export type InvoiceOcrRun = typeof invoiceOcrRunsTable.$inferSelect;
