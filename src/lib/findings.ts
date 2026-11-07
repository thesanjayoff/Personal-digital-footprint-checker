import { getDb, genId, nowIso } from "./db";
import { encryptField, decryptField } from "./crypto";
import type { FindingInput, Severity, Effort } from "./modules/types";

export interface FindingRecord {
  id: string;
  run_id: string;
  identifier_id: string;
  module: string;
  severity: Severity;
  title: string;
  description: string;
  evidence: Record<string, unknown> | null;
  recommendation: string;
  links: { label: string; url: string }[];
  effort: Effort;
  impact_score: number;
  dedupe_key: string;
  status: "open" | "done" | "dismissed";
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  is_new: boolean;
}

interface Row {
  id: string;
  run_id: string;
  identifier_id: string;
  module: string;
  severity: Severity;
  title: string;
  description: string;
  evidence_encrypted: string | null;
  recommendation: string;
  links_json: string;
  effort: Effort;
  impact_score: number;
  dedupe_key: string;
  status: "open" | "done" | "dismissed";
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
}

function toRecord(row: Row): FindingRecord {
  return {
    id: row.id,
    run_id: row.run_id,
    identifier_id: row.identifier_id,
    module: row.module,
    severity: row.severity,
    title: row.title,
    description: row.description,
    evidence: row.evidence_encrypted ? JSON.parse(decryptField(row.evidence_encrypted)) : null,
    recommendation: row.recommendation,
    links: JSON.parse(row.links_json),
    effort: row.effort,
    impact_score: row.impact_score,
    dedupe_key: row.dedupe_key,
    status: row.status,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    resolved_at: row.resolved_at,
    is_new: row.first_seen_at === row.last_seen_at,
  };
}

/**
 * Inserts a finding, or if one with the same dedupe_key already exists,
 * refreshes it in place. A finding that had been marked "done" and then
 * reappears is reopened and its first_seen_at is reset so it surfaces as
 * new exposure again — a fixed secret leaking again is not a dismissible
 * duplicate. Explicit "dismissed" findings stay dismissed across re-checks.
 */
export function upsertFinding(runId: string, identifierId: string, input: FindingInput): FindingRecord {
  const db = getDb();
  const existing = db
    .prepare(`SELECT * FROM findings WHERE identifier_id = ? AND dedupe_key = ?`)
    .get(identifierId, input.dedupeKey) as unknown as Row | undefined;

  const ts = nowIso();
  const linksJson = JSON.stringify(input.links ?? []);
  const evidenceEncrypted = input.evidence ? encryptField(JSON.stringify(input.evidence)) : null;

  if (!existing) {
    const id = genId("find");
    db.prepare(
      `INSERT INTO findings (id, run_id, identifier_id, module, severity, title, description, evidence_encrypted,
        recommendation, links_json, effort, impact_score, dedupe_key, status, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
    ).run(
      id,
      runId,
      identifierId,
      input.module,
      input.severity,
      input.title,
      input.description,
      evidenceEncrypted,
      input.recommendation,
      linksJson,
      input.effort ?? "medium",
      input.impactScore ?? 5,
      input.dedupeKey,
      ts,
      ts
    );
    return toRecord(
      db.prepare(`SELECT * FROM findings WHERE id = ?`).get(id) as unknown as Row
    );
  }

  const reopen = existing.status === "done";
  const newFirstSeen = reopen ? ts : existing.first_seen_at;
  const newStatus = reopen ? "open" : existing.status;

  db.prepare(
    `UPDATE findings SET run_id = ?, severity = ?, title = ?, description = ?, evidence_encrypted = ?,
      recommendation = ?, links_json = ?, effort = ?, impact_score = ?, status = ?, first_seen_at = ?, last_seen_at = ?,
      resolved_at = CASE WHEN ? = 'open' THEN NULL ELSE resolved_at END
     WHERE id = ?`
  ).run(
    runId,
    input.severity,
    input.title,
    input.description,
    evidenceEncrypted,
    input.recommendation,
    linksJson,
    input.effort ?? "medium",
    input.impactScore ?? 5,
    newStatus,
    newFirstSeen,
    ts,
    newStatus,
    existing.id
  );
  return toRecord(db.prepare(`SELECT * FROM findings WHERE id = ?`).get(existing.id) as unknown as Row);
}

export function listFindingsForRun(runId: string): FindingRecord[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM findings WHERE run_id = ?`).all(runId) as unknown as Row[];
  return rows.map(toRecord);
}

export function listOpenFindings(owner?: string): FindingRecord[] {
  const db = getDb();
  const rows = (owner
    ? db
        .prepare(
          `SELECT f.* FROM findings f JOIN identifiers i ON i.id = f.identifier_id
           WHERE f.status = 'open' AND i.owner = ? ORDER BY f.impact_score DESC`
        )
        .all(owner)
    : db.prepare(`SELECT * FROM findings WHERE status = 'open' ORDER BY impact_score DESC`).all()) as unknown as Row[];
  return rows.map(toRecord);
}

export function listAllFindings(owner?: string): FindingRecord[] {
  const db = getDb();
  const rows = (owner
    ? db
        .prepare(
          `SELECT f.* FROM findings f JOIN identifiers i ON i.id = f.identifier_id
           WHERE i.owner = ? ORDER BY f.last_seen_at DESC`
        )
        .all(owner)
    : db.prepare(`SELECT * FROM findings ORDER BY last_seen_at DESC`).all()) as unknown as Row[];
  return rows.map(toRecord);
}

export function setFindingStatus(id: string, status: "open" | "done" | "dismissed"): void {
  const db = getDb();
  db.prepare(`UPDATE findings SET status = ?, resolved_at = ? WHERE id = ?`).run(
    status,
    status === "open" ? null : nowIso(),
    id
  );
}
