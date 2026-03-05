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

  CREATE TABLE IF NOT EXISTS flowchart_state (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`);

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
