import { listOpenFindings, type FindingRecord } from "./findings";

const EFFORT_WEIGHT: Record<FindingRecord["effort"], number> = { low: 1, medium: 2, high: 3.5 };

export interface ChecklistItem extends FindingRecord {
  priority: number;
}

/** Highest impact-per-effort first — the "do this next" ordering for the cleanup checklist. */
export function getPrioritizedChecklist(owner: string): ChecklistItem[] {
  const open = listOpenFindings(owner);
  return open
    .map((f) => ({ ...f, priority: f.impact_score / EFFORT_WEIGHT[f.effort] }))
    .sort((a, b) => b.priority - a.priority);
}
