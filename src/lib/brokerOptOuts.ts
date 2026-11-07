import { getDb, genId, nowIso } from "./db";
import brokers from "../data/brokers.json";

export type OptOutStatus = "not_started" | "requested" | "confirmed" | "relisted";

export interface BrokerDef {
  id: string;
  name: string;
  searchUrl: string;
  optOutUrl: string;
  difficulty: "low" | "medium" | "high";
}

export const BROKERS = brokers as BrokerDef[];

export interface OptOutRecord {
  id: string;
  identifier_id: string;
  broker_id: string;
  status: OptOutStatus;
  requested_at: string | null;
  confirmed_at: string | null;
  notes: string | null;
}

export function getOptOutStatus(identifierId: string, brokerId: string): OptOutRecord | null {
  const db = getDb();
  return (
    (db
      .prepare(`SELECT * FROM broker_opt_outs WHERE identifier_id = ? AND broker_id = ?`)
      .get(identifierId, brokerId) as unknown as OptOutRecord | undefined) ?? null
  );
}

export function listOptOuts(identifierId: string): OptOutRecord[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM broker_opt_outs WHERE identifier_id = ?`).all(identifierId) as unknown as OptOutRecord[];
}

export function setOptOutStatus(
  identifierId: string,
  brokerId: string,
  status: OptOutStatus,
  notes?: string
): OptOutRecord {
  const db = getDb();
  const existing = getOptOutStatus(identifierId, brokerId);
  const ts = nowIso();
  if (!existing) {
    const id = genId("optout");
    db.prepare(
      `INSERT INTO broker_opt_outs (id, identifier_id, broker_id, status, requested_at, confirmed_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      identifierId,
      brokerId,
      status,
      status === "requested" ? ts : null,
      status === "confirmed" ? ts : null,
      notes ?? null
    );
    return getOptOutStatus(identifierId, brokerId)!;
  }
  db.prepare(
    `UPDATE broker_opt_outs SET status = ?, requested_at = COALESCE(?, requested_at), confirmed_at = ?, notes = ? WHERE id = ?`
  ).run(
    status,
    status === "requested" ? ts : null,
    status === "confirmed" ? ts : existing.status === "confirmed" && status !== "relisted" ? existing.confirmed_at : null,
    notes ?? existing.notes,
    existing.id
  );
  return getOptOutStatus(identifierId, brokerId)!;
}
