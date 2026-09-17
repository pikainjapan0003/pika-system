import {pgTable,serial,integer,text,jsonb,timestamp,unique,foreignKey,boolean} from 'drizzle-orm/pg-core';
import {sheetImportBatchesTable,sheetImportRowsTable} from './sheetImports.ts';
import {catalogProductsTable,productCostRecordsTable,shopeePriceObservationsTable} from './catalogProducts.ts';
import {storesTable} from './stores.ts';
export const sheetImportEffectsTable=pgTable('sheet_import_effects',{
 id:serial('id').primaryKey(),storeId:integer('store_id').notNull(),batchId:integer('batch_id').notNull(),rowId:integer('row_id').notNull(),
 catalogProductId:integer('catalog_product_id').notNull(),createdCatalog:boolean('created_catalog').notNull(),
 createdCostRecordId:integer('created_cost_record_id'),previousCostRecordId:integer('previous_cost_record_id'),createdShopeeId:integer('created_shopee_id'),
 catalogState:jsonb('catalog_state').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[unique().on(t.storeId,t.rowId),unique().on(t.storeId,t.id),
 foreignKey({columns:[t.storeId,t.batchId],foreignColumns:[sheetImportBatchesTable.storeId,sheetImportBatchesTable.id]}),
 foreignKey({columns:[t.storeId,t.rowId],foreignColumns:[sheetImportRowsTable.storeId,sheetImportRowsTable.id]}),
 foreignKey({columns:[t.storeId,t.catalogProductId],foreignColumns:[catalogProductsTable.storeId,catalogProductsTable.id]}),
 foreignKey({columns:[t.storeId,t.catalogProductId,t.createdCostRecordId],foreignColumns:[productCostRecordsTable.storeId,productCostRecordsTable.catalogProductId,productCostRecordsTable.id]}),
 foreignKey({columns:[t.storeId,t.catalogProductId,t.previousCostRecordId],foreignColumns:[productCostRecordsTable.storeId,productCostRecordsTable.catalogProductId,productCostRecordsTable.id]}),
 foreignKey({columns:[t.storeId,t.createdShopeeId],foreignColumns:[shopeePriceObservationsTable.storeId,shopeePriceObservationsTable.id]})]);
export const sheetImportAuditTable=pgTable('sheet_import_audit',{id:serial('id').primaryKey(),storeId:integer('store_id').notNull(),batchId:integer('batch_id').notNull(),actor:text('actor').notNull(),action:text('action').notNull(),details:jsonb('details').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()},t=>[foreignKey({columns:[t.storeId,t.batchId],foreignColumns:[sheetImportBatchesTable.storeId,sheetImportBatchesTable.id]})]);
export const listingMatchActionsTable=pgTable('listing_match_actions',{id:serial('id').primaryKey(),storeId:integer('store_id').notNull().references(()=>storesTable.id),requestKey:text('request_key').notNull(),inputHash:text('input_hash').notNull(),actor:text('actor').notNull(),result:jsonb('result').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()},t=>[unique().on(t.storeId,t.requestKey)]);
