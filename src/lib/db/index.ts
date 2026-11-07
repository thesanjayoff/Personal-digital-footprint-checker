import { DatabaseSync } from "node:sqlite";
import { getDbPath } from "../paths";
import { SCHEMA_SQL } from "./schema";

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(getDbPath());
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  return db;
}

export function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Only for tests: forces a fresh in-memory-like file and resets the cached handle. */
export function resetDbForTests(): void {
  db = null;
}
