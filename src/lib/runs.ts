import { getDb, genId, nowIso } from "./db";
import { computeScore } from "./scoring";
import { listAllFindings } from "./findings";

export interface RunRecord {
  id: string;
  owner: string;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  previous_score: number | null;
  trigger: "manual" | "scheduled";
}

export function createRun(owner: string, trigger: "manual" | "scheduled" = "manual"): RunRecord {
  const db = getDb();
  const previous = db
    .prepare(`SELECT score FROM runs WHERE owner = ? AND score IS NOT NULL ORDER BY started_at DESC LIMIT 1`)
    .get(owner) as { score: number } | undefined;
  const id = genId("run");
  const started_at = nowIso();
  db.prepare(
    `INSERT INTO runs (id, owner, started_at, previous_score, trigger) VALUES (?, ?, ?, ?, ?)`
  ).run(id, owner, started_at, previous?.score ?? null, trigger);
  return { id, owner, started_at, finished_at: null, score: null, previous_score: previous?.score ?? null, trigger };
}

export function finishRun(runId: string, owner: string): RunRecord {
  const db = getDb();
  const openFindings = listAllFindings(owner).filter((f) => f.status === "open");
  const { score } = computeScore(openFindings);
  const finished_at = nowIso();
  db.prepare(`UPDATE runs SET finished_at = ?, score = ? WHERE id = ?`).run(finished_at, score, runId);
  return getRun(runId)!;
}

export function getRun(id: string): RunRecord | null {
  const db = getDb();
  return (db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as unknown as RunRecord | undefined) ?? null;
}

export function listRuns(owner?: string): RunRecord[] {
  const db = getDb();
  return (owner
    ? db.prepare(`SELECT * FROM runs WHERE owner = ? ORDER BY started_at DESC`).all(owner)
    : db.prepare(`SELECT * FROM runs ORDER BY started_at DESC`).all()) as unknown as RunRecord[];
}
