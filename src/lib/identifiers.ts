import { getDb, genId, nowIso } from "./db";
import { encryptField, decryptField, hashSecret } from "./crypto";

export type IdentifierType = "email" | "username" | "domain" | "github";

export interface IdentifierRecord {
  id: string;
  owner: string;
  type: IdentifierType;
  value: string; // decrypted, for in-memory use only
  verified_at: string | null;
  verification_method: string | null;
  created_at: string;
}

interface Row {
  id: string;
  owner: string;
  type: IdentifierType;
  value_encrypted: string;
  value_fingerprint: string;
  verified_at: string | null;
  verification_method: string | null;
  created_at: string;
}

function toRecord(row: Row): IdentifierRecord {
  return {
    id: row.id,
    owner: row.owner,
    type: row.type,
    value: decryptField(row.value_encrypted),
    verified_at: row.verified_at,
    verification_method: row.verification_method,
    created_at: row.created_at,
  };
}

export function fingerprint(value: string): string {
  return hashSecret(value.trim().toLowerCase());
}

export function addIdentifier(owner: string, type: IdentifierType, value: string): IdentifierRecord {
  const db = getDb();
  const id = genId("ident");
  const created_at = nowIso();
  db.prepare(
    `INSERT INTO identifiers (id, owner, type, value_encrypted, value_fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, owner, type, encryptField(value), fingerprint(value), created_at);
  return { id, owner, type, value, verified_at: null, verification_method: null, created_at };
}

export function getIdentifier(id: string): IdentifierRecord | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM identifiers WHERE id = ?`).get(id) as unknown as Row | undefined;
  return row ? toRecord(row) : null;
}

export function listIdentifiers(owner?: string): IdentifierRecord[] {
  const db = getDb();
  const rows = (owner
    ? db.prepare(`SELECT * FROM identifiers WHERE owner = ? ORDER BY created_at DESC`).all(owner)
    : db.prepare(`SELECT * FROM identifiers ORDER BY created_at DESC`).all()) as unknown as Row[];
  return rows.map(toRecord);
}

export function markVerified(id: string, method: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE identifiers SET verified_at = ?, verification_method = ? WHERE id = ?`
  ).run(nowIso(), method, id);
}

export function deleteIdentifier(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM identifiers WHERE id = ?`).run(id);
}

export function isVerified(rec: IdentifierRecord | null): rec is IdentifierRecord & { verified_at: string } {
  return !!rec && !!rec.verified_at;
}

/**
 * THE core guardrail: every module must call this before doing any lookup.
 * An identifier that has not completed ownership verification is refused,
 * even though it may already be stored. This is what "can be stored but
 * never queried" means in code.
 */
export class UnverifiedIdentifierError extends Error {
  constructor(id: string) {
    super(`Identifier ${id} is not ownership-verified. Refusing to query it.`);
    this.name = "UnverifiedIdentifierError";
  }
}

export function requireVerifiedIdentifier(id: string): IdentifierRecord {
  const rec = getIdentifier(id);
  if (!isVerified(rec)) {
    throw new UnverifiedIdentifierError(id);
  }
  return rec;
}
