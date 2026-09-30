import {pgTable,serial,integer,varchar,jsonb,timestamp,foreignKey,index} from 'drizzle-orm/pg-core';
import {storesTable} from './stores.ts';
import {catalogProductsTable} from './catalogProducts.ts';
export const catalogAuditEventsTable=pgTable('catalog_audit_events',{
 id:serial('id').primaryKey(),storeId:integer('store_id').notNull().references(()=>storesTable.id),
 catalogProductId:integer('catalog_product_id'),action:varchar('action',{length:64}).notNull(),
 actor:varchar('actor',{length:256}).notNull(),details:jsonb('details').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
},t=>[foreignKey({columns:[t.storeId,t.catalogProductId],foreignColumns:[catalogProductsTable.storeId,catalogProductsTable.id]}),index('catalog_audit_scope_idx').on(t.storeId,t.catalogProductId,t.id)]);
