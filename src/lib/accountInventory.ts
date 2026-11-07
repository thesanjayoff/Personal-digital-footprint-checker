import { parse } from "csv-parse/sync";
import crypto from "node:crypto";
import { getDb, genId, nowIso } from "./db";
import { encryptField, decryptField } from "./crypto";
import { checkPasswordPwned } from "./hibp";
import deleteLinks from "../data/deleteAccountLinks.json";

export type PasswordStrength = "weak" | "reused" | "ok" | "unknown";

export interface AccountInventoryRecord {
  id: string;
  owner: string;
  service_name: string;
  username: string | null;
  last_used_at: string | null;
  has_mfa: boolean | null;
  password_strength: PasswordStrength;
  breached: boolean;
  status: "active" | "to_delete" | "deleted";
  source: string;
  created_at: string;
  deleteUrl?: string;
}

interface Row {
  id: string;
  owner: string;
  service_name: string;
  username_encrypted: string | null;
  email_encrypted: string | null;
  last_used_at: string | null;
  has_mfa: number | null;
  password_strength: PasswordStrength;
  breached: number;
  status: "active" | "to_delete" | "deleted";
  source: string;
  created_at: string;
}

const COLUMN_ALIASES = {
  service: ["name", "title", "url", "login_uri", "site", "service"],
  username: ["username", "login_username", "user", "email"],
  password: ["password", "login_password"],
  mfa: ["login_totp", "totp", "mfa", "2fa"],
  lastUsed: ["last_used", "last_used_at", "lastused"],
};

function findColumn(headers: string[], aliases: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function hostnameFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function assessPasswordBasicStrength(password: string): "weak" | "ok" {
  if (password.length < 10) return "weak";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  return classes >= 3 ? "ok" : "weak";
}

function toRecord(row: Row): AccountInventoryRecord {
  const service = row.service_name.toLowerCase();
  return {
    id: row.id,
    owner: row.owner,
    service_name: row.service_name,
    username: row.username_encrypted ? decryptField(row.username_encrypted) : null,
    last_used_at: row.last_used_at,
    has_mfa: row.has_mfa === null ? null : row.has_mfa === 1,
    password_strength: row.password_strength,
    breached: row.breached === 1,
    status: row.status,
    source: row.source,
    created_at: row.created_at,
    deleteUrl: (deleteLinks as Record<string, string>)[service] ?? `https://www.google.com/search?q=how+to+delete+${encodeURIComponent(row.service_name)}+account`,
  };
}

export interface ImportSummary {
  imported: number;
  weak: number;
  reused: number;
  breached: number;
  noMfaInfo: number;
}

/**
 * Imports a password-manager/Takeout-style CSV. Passwords are used only
 * in-memory for this one pass — to detect reuse (hash comparison) and to
 * check Pwned Passwords via k-anonymity — and are never written to disk
 * in any form, plaintext or hashed.
 */
export async function importAccountsCsv(owner: string, csvText: string, checkBreaches: boolean): Promise<ImportSummary> {
  const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  if (records.length === 0) return { imported: 0, weak: 0, reused: 0, breached: 0, noMfaInfo: 0 };

  const headers = Object.keys(records[0]);
  const serviceCol = findColumn(headers, COLUMN_ALIASES.service);
  const usernameCol = findColumn(headers, COLUMN_ALIASES.username);
  const passwordCol = findColumn(headers, COLUMN_ALIASES.password);
  const mfaCol = findColumn(headers, COLUMN_ALIASES.mfa);
  const lastUsedCol = findColumn(headers, COLUMN_ALIASES.lastUsed);

  // In-memory only: password -> occurrence count, to flag reuse within this import.
  const hashCounts = new Map<string, number>();
  if (passwordCol) {
    for (const r of records) {
      const pw = r[passwordCol];
      if (!pw) continue;
      const h = crypto.createHash("sha256").update(pw).digest("hex");
      hashCounts.set(h, (hashCounts.get(h) ?? 0) + 1);
    }
  }

  const db = getDb();
  const summary: ImportSummary = { imported: 0, weak: 0, reused: 0, breached: 0, noMfaInfo: 0 };

  for (const r of records) {
    const rawService = serviceCol ? r[serviceCol] : null;
    if (!rawService) continue;
    const serviceName = /^https?:\/\//.test(rawService) ? hostnameFromUrl(rawService) : rawService;
    const username = usernameCol ? r[usernameCol] || null : null;
    const password = passwordCol ? r[passwordCol] || null : null;
    const hasMfa = mfaCol ? (r[mfaCol] ? true : false) : null;
    const lastUsedAt = lastUsedCol && r[lastUsedCol] ? r[lastUsedCol] : null;

    let strength: PasswordStrength = "unknown";
    let breached = false;
    if (password) {
      const h = crypto.createHash("sha256").update(password).digest("hex");
      if ((hashCounts.get(h) ?? 0) > 1) {
        strength = "reused";
        summary.reused++;
      } else {
        strength = assessPasswordBasicStrength(password);
        if (strength === "weak") summary.weak++;
      }
      if (checkBreaches) {
        try {
          const count = await checkPasswordPwned(password);
          breached = count > 0;
          if (breached) summary.breached++;
        } catch {
          // network/API issue — leave breached as false rather than fail the whole import
        }
      }
    }
    if (hasMfa === null) summary.noMfaInfo++;

    const id = genId("acct");
    db.prepare(
      `INSERT INTO account_inventory (id, owner, service_name, username_encrypted, email_encrypted, last_used_at, has_mfa, password_strength, breached, status, source, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'active', 'csv_import', ?)`
    ).run(
      id,
      owner,
      serviceName,
      username ? encryptField(username) : null,
      lastUsedAt,
      hasMfa === null ? null : hasMfa ? 1 : 0,
      strength,
      breached ? 1 : 0,
      nowIso()
    );
    summary.imported++;
    // `password` and its hash are now out of scope and never referenced again.
  }

  return summary;
}

export function listAccounts(owner: string): AccountInventoryRecord[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM account_inventory WHERE owner = ? ORDER BY created_at DESC`).all(owner) as unknown as Row[];
  return rows.map(toRecord);
}

export function setAccountStatus(id: string, status: AccountInventoryRecord["status"]): void {
  getDb().prepare(`UPDATE account_inventory SET status = ? WHERE id = ?`).run(status, id);
}

export function deleteAllAccounts(owner: string): void {
  getDb().prepare(`DELETE FROM account_inventory WHERE owner = ?`).run(owner);
}

const STALE_DAYS = 365;

export function isStale(record: AccountInventoryRecord): boolean {
  if (!record.last_used_at) return false;
  const last = new Date(record.last_used_at).getTime();
  if (Number.isNaN(last)) return false;
  return Date.now() - last > STALE_DAYS * 24 * 60 * 60 * 1000;
}
