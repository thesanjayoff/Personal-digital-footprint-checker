import { getDb, genId, nowIso } from "./db";

/**
 * Every lookup the tool performs is recorded here: who/what was queried,
 * by which module, and when. This is the "keep an audit log of every
 * lookup" requirement — it is append-only and shown in the UI, never hidden.
 */
export function recordAudit(entry: {
  identifierId?: string | null;
  module: string;
  action: string;
  details?: Record<string, unknown>;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (id, ts, identifier_id, module, action, details) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    genId("audit"),
    nowIso(),
    entry.identifierId ?? null,
    entry.module,
    entry.action,
    entry.details ? JSON.stringify(redact(entry.details)) : null
  );
}

export function listAudit(limit = 200): Array<{
  id: string;
  ts: string;
  identifier_id: string | null;
  module: string;
  action: string;
  details: string | null;
}> {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?`)
    .all(limit) as never;
}

/** Strips obvious secrets/raw identifiers out of anything we log, defense-in-depth. */
function redact(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (/password|secret|token|key|code/i.test(k)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string" && v.length > 500) {
      out[k] = v.slice(0, 500) + "…[truncated]";
    } else {
      out[k] = v;
    }
  }
  return out;
}
