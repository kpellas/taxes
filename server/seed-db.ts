import {
  isEmpty, runInTransaction,
  upsertEntity, upsertProperty, upsertLoan,
  upsertPurchaseBreakdown, upsertTaxDocument, upsertActionItem,
  upsertTimelineEvent, upsertPropertyDocument,
} from './db.js';

// Import seed data — these are the same types used by the frontend
import { entities, properties, loans, taxDocuments, taxActionItems, timelineEvents, propertyDocuments, purchaseBreakdowns } from '../src/data/seed.js';

export function seedIfEmpty() {
  if (!isEmpty('entities')) {
    console.log('Database already has data, skipping seed.');
    return;
  }

  console.log('Seeding database from seed.ts...');

  runInTransaction(() => {
    for (const e of entities) upsertEntity(e);
    for (const p of properties) upsertProperty(p);
    for (const l of loans) upsertLoan(l);
    for (const pb of purchaseBreakdowns) upsertPurchaseBreakdown(pb);
    for (const d of taxDocuments) upsertTaxDocument(d);
    for (const a of taxActionItems) upsertActionItem(a);
    for (const t of timelineEvents) upsertTimelineEvent(t);
    for (const d of propertyDocuments) upsertPropertyDocument(d);
  });

  console.log(`Seeded: ${entities.length} entities, ${properties.length} properties, ${loans.length} loans, ${purchaseBreakdowns.length} purchase breakdowns`);
}
