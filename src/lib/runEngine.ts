import { MODULES } from "./modules/registry";
import { listIdentifiers, isVerified } from "./identifiers";
import { isModuleEnabled } from "./settings";
import { createRun, finishRun, type RunRecord } from "./runs";
import { upsertFinding, type FindingRecord } from "./findings";
import { recordAudit } from "./audit";
import { guardedFetch } from "./fetchGuard";

export interface RunOutcome {
  run: RunRecord;
  findings: FindingRecord[];
  newFindings: FindingRecord[];
  errors: Array<{ module: string; identifierId: string; error: string }>;
}

/**
 * The single place that turns "run a check" into findings. It only ever
 * touches identifiers that have completed ownership verification — an
 * identifier without `verified_at` is invisible to every module here,
 * which is the enforcement point for the whole project's core rule.
 */
export async function runAllChecks(owner: string, trigger: "manual" | "scheduled" = "manual"): Promise<RunOutcome> {
  const run = createRun(owner, trigger);
  const identifiers = listIdentifiers(owner).filter(isVerified);
  const allFindings: FindingRecord[] = [];
  const errors: RunOutcome["errors"] = [];

  for (const identifier of identifiers) {
    for (const mod of MODULES) {
      if (!mod.supportedTypes.includes(identifier.type)) continue;
      if (!isModuleEnabled(mod.id)) continue;
      try {
        const inputs = await mod.run({ identifier, fetch: guardedFetch, settings: {} });
        for (const input of inputs) {
          allFindings.push(upsertFinding(run.id, identifier.id, input));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ module: mod.id, identifierId: identifier.id, error: message });
        recordAudit({ identifierId: identifier.id, module: mod.id, action: "run_failed", details: { error: message } });
      }
    }
  }

  const finished = finishRun(run.id, owner);
  const newFindings = allFindings.filter((f) => f.first_seen_at === f.last_seen_at && f.first_seen_at >= run.started_at);
  return { run: finished, findings: allFindings, newFindings, errors };
}

export async function runChecksForIdentifier(owner: string, identifierId: string): Promise<RunOutcome> {
  const run = createRun(owner, "manual");
  const identifiers = listIdentifiers(owner).filter(isVerified).filter((i) => i.id === identifierId);
  const allFindings: FindingRecord[] = [];
  const errors: RunOutcome["errors"] = [];

  for (const identifier of identifiers) {
    for (const mod of MODULES) {
      if (!mod.supportedTypes.includes(identifier.type)) continue;
      if (!isModuleEnabled(mod.id)) continue;
      try {
        const inputs = await mod.run({ identifier, fetch: guardedFetch, settings: {} });
        for (const input of inputs) {
          allFindings.push(upsertFinding(run.id, identifier.id, input));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ module: mod.id, identifierId: identifier.id, error: message });
      }
    }
  }
  const finished = finishRun(run.id, owner);
  const newFindings = allFindings.filter((f) => f.first_seen_at === f.last_seen_at);
  return { run: finished, findings: allFindings, newFindings, errors };
}
