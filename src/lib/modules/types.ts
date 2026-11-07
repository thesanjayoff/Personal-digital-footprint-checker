import type { IdentifierRecord, IdentifierType } from "../identifiers";
import { guardedFetch } from "../fetchGuard";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Effort = "low" | "medium" | "high";

export interface Link {
  label: string;
  url: string;
}

export interface FindingInput {
  module: string;
  severity: Severity;
  title: string;
  description: string;
  evidence?: Record<string, unknown>;
  recommendation: string;
  links?: Link[];
  effort?: Effort;
  /** 1 (low) – 10 (high) how much fixing this reduces real-world exposure. */
  impactScore?: number;
  /** Stable key for this exact finding so re-checks update instead of duplicating it. */
  dedupeKey: string;
}

export interface ModuleRunContext {
  identifier: IdentifierRecord;
  fetch: typeof guardedFetch;
  settings: Record<string, unknown>;
}

export interface DfcModule {
  id: string;
  name: string;
  description: string;
  /** Shown in Settings so the data source and its terms are always visible. */
  dataSource: string;
  termsUrl: string;
  supportedTypes: IdentifierType[];
  run(ctx: ModuleRunContext): Promise<FindingInput[]>;
}
