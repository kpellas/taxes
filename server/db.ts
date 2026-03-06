import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.resolve(import.meta.dirname, '../data/portfolio.db');

// Ensure data directory exists
import fs from 'fs';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performance settings
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchase_breakdowns (
    property_id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tax_documents (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS action_items (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS property_documents (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL,
    data TEXT NOT NULL
  );

  -- Global Document Index: single source of truth for all documents
  CREATE TABLE IF NOT EXISTS document_index (
    id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    category TEXT NOT NULL,          -- loan, insurance, settlement, valuation, tax, rates, lease, correspondence, other
    provider TEXT,                    -- NAB, CGU, SPG, Bankwest, etc.
    doc_date TEXT,                    -- document date (YYYY-MM-DD)
    source_type TEXT NOT NULL,        -- file, email, upload, note
    source_ref TEXT,                  -- file path, email ID, URL, or freeform text
    file_path TEXT,                   -- relative path to actual file (if source_type=file or upload)
    property_id TEXT,                 -- security property (what the bank sees)
    purpose_property_id TEXT,         -- purpose property (what the money was used for) — null means same as property_id
    entity_id TEXT,                   -- nullable
    loan_id TEXT,                     -- nullable
    metadata TEXT DEFAULT '{}',       -- JSON for extra fields (account numbers, size, etc.)
    verified INTEGER DEFAULT 0,       -- 1=verified, 0=not verified
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Links: one document can satisfy many requirements
  CREATE TABLE IF NOT EXISTS document_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES document_index(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL,          -- property, entity, loan, event, template
    link_id TEXT NOT NULL,
    UNIQUE(document_id, link_type, link_id)
  );

  -- Document Templates: what documents SHOULD exist for each event type
  CREATE TABLE IF NOT EXISTS document_templates (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,          -- purchase, refinance, annual, insurance_renewal, new_tenant, etc.
    name TEXT NOT NULL,                -- "Loan Documents", "Discharge Statement", etc.
    category TEXT NOT NULL,            -- matches document_index.category
    description TEXT,
    required INTEGER DEFAULT 1,        -- 1=required, 0=optional
    match_hints TEXT DEFAULT '{}',     -- JSON: keywords, provider patterns for auto-matching
    applies_to TEXT DEFAULT 'all'      -- all, h_and_l, investment, trust
  );

  CREATE TABLE IF NOT EXISTS flowchart_state (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`);

// ── Migrations ──
// Add purpose_property_id column if missing (existing DBs)
try {
  db.prepare(`SELECT purpose_property_id FROM document_index LIMIT 1`).get();
} catch {
  db.exec(`ALTER TABLE document_index ADD COLUMN purpose_property_id TEXT`);
}
// Add verified column if missing
try {
  db.prepare(`SELECT verified FROM document_index LIMIT 1`).get();
} catch {
  db.exec(`ALTER TABLE document_index ADD COLUMN verified INTEGER DEFAULT 0`);
}
// Add file_created_at column if missing
try {
  db.prepare(`SELECT file_created_at FROM document_index LIMIT 1`).get();
} catch {
  db.exec(`ALTER TABLE document_index ADD COLUMN file_created_at TEXT`);
}
// Add added_via column if missing (tracks how doc entered the system)
try {
  db.prepare(`SELECT added_via FROM document_index LIMIT 1`).get();
} catch {
  db.exec(`ALTER TABLE document_index ADD COLUMN added_via TEXT DEFAULT 'existing'`);
}

// ── Helpers ──

// Store JSON objects with an indexed id + denormalized foreign keys for queries
// The full object lives in `data` as JSON

export function getAll<T>(table: string): T[] {
  const rows = db.prepare(`SELECT data FROM ${table}`).all() as { data: string }[];
  return rows.map(r => JSON.parse(r.data));
}

export function getById<T>(table: string, id: string): T | undefined {
  const row = db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : undefined;
}

export function getByField<T>(table: string, field: string, value: string): T[] {
  const rows = db.prepare(`SELECT data FROM ${table} WHERE ${field} = ?`).all(value) as { data: string }[];
  return rows.map(r => JSON.parse(r.data));
}

export function upsertEntity(entity: { id: string; [key: string]: unknown }) {
  db.prepare(`INSERT OR REPLACE INTO entities (id, data) VALUES (?, ?)`).run(entity.id, JSON.stringify(entity));
}

export function upsertProperty(property: { id: string; entityId: string; [key: string]: unknown }) {
  db.prepare(`INSERT OR REPLACE INTO properties (id, entity_id, data) VALUES (?, ?, ?)`).run(property.id, property.entityId, JSON.stringify(property));
}

export function upsertLoan(loan: { id: string; entityId: string; propertyId: string; [key: string]: unknown }) {
  db.prepare(`INSERT OR REPLACE INTO loans (id, entity_id, property_id, data) VALUES (?, ?, ?, ?)`).run(loan.id, loan.entityId, loan.propertyId, JSON.stringify(loan));
}

export function deleteLoan(id: string) {
  db.prepare(`DELETE FROM loans WHERE id = ?`).run(id);
}

export function upsertPurchaseBreakdown(pb: { propertyId: string; [key: string]: unknown }) {
  db.prepare(`INSERT OR REPLACE INTO purchase_breakdowns (property_id, data) VALUES (?, ?)`).run(pb.propertyId, JSON.stringify(pb));
}

export function deletePurchaseBreakdown(propertyId: string) {
  db.prepare(`DELETE FROM purchase_breakdowns WHERE property_id = ?`).run(propertyId);
}

export function upsertTaxDocument(doc: { id: string; [key: string]: unknown }) {
  db.prepare(`INSERT OR REPLACE INTO tax_documents (id, data) VALUES (?, ?)`).run(doc.id, JSON.stringify(doc));
}

export function upsertActionItem(item: { id: string; [key: string]: unknown }) {
  db.prepare(`INSERT OR REPLACE INTO action_items (id, data) VALUES (?, ?)`).run(item.id, JSON.stringify(item));
}

export function upsertTimelineEvent(event: { id: string; propertyId: string; [key: string]: unknown }) {
  db.prepare(`INSERT OR REPLACE INTO timeline_events (id, property_id, data) VALUES (?, ?, ?)`).run(event.id, event.propertyId, JSON.stringify(event));
}

export function upsertPropertyDocument(doc: { id: string; propertyId: string; [key: string]: unknown }) {
  db.prepare(`INSERT OR REPLACE INTO property_documents (id, property_id, data) VALUES (?, ?, ?)`).run(doc.id, doc.propertyId, JSON.stringify(doc));
}

// ── Document Index ──

export interface DbDocument {
  id: string;
  canonical_name: string;
  category: string;
  provider: string | null;
  doc_date: string | null;
  source_type: string;
  source_ref: string | null;
  file_path: string | null;
  property_id: string | null;
  purpose_property_id: string | null;  // JSON array: [{"propertyId":"x","portion":100}] or legacy single id
  entity_id: string | null;
  loan_id: string | null;
  metadata: string;
  verified: number;
  file_created_at: string | null;
  added_via: string;          // existing, scraper, manual, ai
  created_at: string;
  updated_at: string;
}

export function upsertDocument(doc: {
  id: string;
  canonical_name: string;
  category: string;
  provider?: string | null;
  doc_date?: string | null;
  source_type: string;
  source_ref?: string | null;
  file_path?: string | null;
  property_id?: string | null;
  purpose_property_id?: string | null;
  entity_id?: string | null;
  loan_id?: string | null;
  metadata?: Record<string, unknown>;
  file_created_at?: string | null;
  added_via?: string;
}) {
  db.prepare(`
    INSERT INTO document_index
      (id, canonical_name, category, provider, doc_date, source_type, source_ref, file_path, property_id, purpose_property_id, entity_id, loan_id, metadata, file_created_at, added_via, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      canonical_name = excluded.canonical_name,
      category = excluded.category,
      provider = excluded.provider,
      doc_date = excluded.doc_date,
      source_type = excluded.source_type,
      source_ref = excluded.source_ref,
      file_path = excluded.file_path,
      property_id = COALESCE(document_index.property_id, excluded.property_id),
      purpose_property_id = COALESCE(document_index.purpose_property_id, excluded.purpose_property_id),
      entity_id = COALESCE(document_index.entity_id, excluded.entity_id),
      loan_id = COALESCE(document_index.loan_id, excluded.loan_id),
      metadata = excluded.metadata,
      file_created_at = COALESCE(excluded.file_created_at, document_index.file_created_at),
      added_via = COALESCE(document_index.added_via, excluded.added_via),
      updated_at = datetime('now')
  `).run(
    doc.id, doc.canonical_name, doc.category, doc.provider ?? null,
    doc.doc_date ?? null, doc.source_type, doc.source_ref ?? null,
    doc.file_path ?? null, doc.property_id ?? null, doc.purpose_property_id ?? null,
    doc.entity_id ?? null, doc.loan_id ?? null, JSON.stringify(doc.metadata ?? {}),
    doc.file_created_at ?? null, doc.added_via ?? 'existing'
  );
}

export function findDuplicateDocument(filePath: string | null, canonicalName: string, category: string, propertyId: string | null): DbDocument | null {
  // Strongest match: same file_path
  if (filePath) {
    const byPath = db.prepare('SELECT * FROM document_index WHERE file_path = ?').get(filePath) as DbDocument | undefined;
    if (byPath) return byPath;
  }
  // Next: same canonical_name + category + property
  const byName = db.prepare(
    'SELECT * FROM document_index WHERE canonical_name = ? AND category = ? AND (property_id = ? OR (property_id IS NULL AND ? IS NULL))'
  ).get(canonicalName, category, propertyId, propertyId) as DbDocument | undefined;
  return byName || null;
}

export function getAllDocuments(): DbDocument[] {
  return db.prepare('SELECT * FROM document_index ORDER BY doc_date DESC').all() as DbDocument[];
}

export function getDocumentsByProperty(propertyId: string): DbDocument[] {
  return db.prepare('SELECT * FROM document_index WHERE property_id = ? ORDER BY doc_date DESC').all(propertyId) as DbDocument[];
}

export function getDocumentsByCategory(category: string): DbDocument[] {
  return db.prepare('SELECT * FROM document_index WHERE category = ? ORDER BY doc_date DESC').all(category) as DbDocument[];
}

export function renameDocumentByPath(oldRelativePath: string, newRelativePath: string, newCanonicalName: string) {
  db.prepare(`
    UPDATE document_index
    SET file_path = ?, source_ref = ?, canonical_name = ?, updated_at = datetime('now')
    WHERE file_path = ?
  `).run(newRelativePath, newRelativePath, newCanonicalName, oldRelativePath);
}

export function updateDocumentField(id: string, field: string, value: string | null) {
  const allowed = ['category', 'provider', 'doc_date', 'canonical_name', 'source_type'];
  if (!allowed.includes(field)) return;
  db.prepare(`UPDATE document_index SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`).run(value, id);
}

export function setDocumentVerified(id: string, verified: number) {
  db.prepare(`UPDATE document_index SET verified = ?, updated_at = datetime('now') WHERE id = ?`).run(verified, id);
}

export function updateDocumentProperties(id: string, propertyId: string | null, purposePropertyId: string | null) {
  // purposePropertyId is stored as-is — can be a JSON array string or a plain id
  db.prepare(`
    UPDATE document_index
    SET property_id = ?, purpose_property_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(propertyId, purposePropertyId, id);
}

export function deleteDocument(id: string) {
  db.prepare('DELETE FROM document_index WHERE id = ?').run(id);
  db.prepare('DELETE FROM document_links WHERE document_id = ?').run(id);
}

export function addDocumentLink(documentId: string, linkType: string, linkId: string) {
  db.prepare(`
    INSERT OR IGNORE INTO document_links (document_id, link_type, link_id)
    VALUES (?, ?, ?)
  `).run(documentId, linkType, linkId);
}

export function getDocumentLinks(documentId: string): { link_type: string; link_id: string }[] {
  return db.prepare('SELECT link_type, link_id FROM document_links WHERE document_id = ?').all(documentId) as { link_type: string; link_id: string }[];
}

export function getLinkedDocuments(linkType: string, linkId: string): DbDocument[] {
  return db.prepare(`
    SELECT di.* FROM document_index di
    JOIN document_links dl ON dl.document_id = di.id
    WHERE dl.link_type = ? AND dl.link_id = ?
    ORDER BY di.doc_date DESC
  `).all(linkType, linkId) as DbDocument[];
}

// ── Document Templates ──

export interface DbTemplate {
  id: string;
  event_type: string;
  name: string;
  category: string;
  description: string | null;
  required: number;
  match_hints: string;
  applies_to: string;
}

export function getAllTemplates(): DbTemplate[] {
  return db.prepare('SELECT * FROM document_templates ORDER BY event_type, name').all() as DbTemplate[];
}

export function getTemplatesByEvent(eventType: string): DbTemplate[] {
  return db.prepare('SELECT * FROM document_templates WHERE event_type = ?').all(eventType) as DbTemplate[];
}

export function upsertTemplate(tmpl: {
  id: string;
  event_type: string;
  name: string;
  category: string;
  description?: string;
  required?: boolean;
  match_hints?: Record<string, unknown>;
  applies_to?: string;
}) {
  db.prepare(`
    INSERT OR REPLACE INTO document_templates (id, event_type, name, category, description, required, match_hints, applies_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tmpl.id, tmpl.event_type, tmpl.name, tmpl.category,
    tmpl.description ?? null, tmpl.required !== false ? 1 : 0,
    JSON.stringify(tmpl.match_hints ?? {}), tmpl.applies_to ?? 'all'
  );
}

export function getFlowchartState(key: string): unknown | undefined {
  const row = db.prepare(`SELECT data FROM flowchart_state WHERE key = ?`).get(key) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : undefined;
}

export function setFlowchartState(key: string, data: unknown) {
  db.prepare(`INSERT OR REPLACE INTO flowchart_state (key, data) VALUES (?, ?)`).run(key, JSON.stringify(data));
}

// ── Users ──

export interface DbUser {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export function getUserByEmail(email: string): DbUser | undefined {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as DbUser | undefined;
}

export function getUserById(id: number): DbUser | undefined {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as DbUser | undefined;
}

export function createUser(email: string, name: string, passwordHash: string, role: string = 'viewer'): DbUser {
  const result = db.prepare(`INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)`).run(email, name, passwordHash, role);
  return getUserById(Number(result.lastInsertRowid))!;
}

export function getAllUsers(): Omit<DbUser, 'password_hash'>[] {
  return db.prepare(`SELECT id, email, name, role, created_at FROM users`).all() as Omit<DbUser, 'password_hash'>[];
}

// ── Seeding ──

export function isEmpty(table: string): boolean {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
  return row.count === 0;
}

export function runInTransaction(fn: () => void) {
  db.transaction(fn)();
}

export default db;
