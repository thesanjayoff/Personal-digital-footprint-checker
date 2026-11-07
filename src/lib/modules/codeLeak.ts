import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { simpleGit } from "simple-git";
import type { DfcModule, FindingInput, Severity } from "./types";
import { scanLocalRepoHistory, type HistoryMatch } from "../gitHistoryScanner";
import { recordAudit } from "../audit";

interface GhRepo {
  name: string;
  full_name: string;
  fork: boolean;
  private: boolean;
  clone_url: string;
  html_url: string;
  pushed_at: string;
}

const MAX_REPOS = Number(process.env.DFC_CODE_LEAK_MAX_REPOS ?? 15);

async function listPublicRepos(username: string): Promise<GhRepo[]> {
  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner&sort=pushed`,
    { headers: { "User-Agent": "digital-footprint-checker-local", Accept: "application/vnd.github+json" } }
  );
  if (!res.ok) throw new Error(`GitHub API returned ${res.status} listing repos for ${username}`);
  const repos = (await res.json()) as GhRepo[];
  return repos.filter((r) => !r.fork && !r.private).slice(0, MAX_REPOS);
}

async function cloneRepo(repo: GhRepo): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dfc-codeleak-"));
  const git = simpleGit();
  try {
    await git.clone(repo.clone_url, dir, ["--filter=blob:none", "--no-single-branch"]);
  } catch {
    await git.clone(repo.clone_url, dir, ["--no-single-branch"]);
  }
  return dir;
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort; OS temp cleanup will catch anything left behind
  }
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function recommendationFor(match: HistoryMatch): string {
  if (match.category === "sensitive_file") {
    return `Remove this file from the repo and rewrite history to purge it (e.g. "git filter-repo --path ${match.file} --invert-paths"), then force-push. Rotate any credentials it may have contained.`;
  }
  if (match.category === "pii") {
    return "Remove this personal data from the file and consider rewriting history if it shouldn't be public.";
  }
  return `Revoke/rotate this credential immediately (it is public, even if later removed), then rewrite git history to purge it (e.g. with "git filter-repo") and force-push.`;
}

export const codeLeakModule: DfcModule = {
  id: "code_leak",
  name: "Code leak check",
  description: "Scans your own public GitHub repositories and their full git history for secrets and sensitive files.",
  dataSource: "GitHub public REST API (repo listing) + local clone and scan of public repo history.",
  termsUrl: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
  supportedTypes: ["github"],

  async run(ctx): Promise<FindingInput[]> {
    const username = ctx.identifier.value;
    recordAudit({ identifierId: ctx.identifier.id, module: "code_leak", action: "list_repos_started" });
    const repos = await listPublicRepos(username);
    recordAudit({
      identifierId: ctx.identifier.id,
      module: "code_leak",
      action: "list_repos_completed",
      details: { repoCount: repos.length },
    });

    const findings: FindingInput[] = [];

    for (const repo of repos) {
      let dir: string | null = null;
      try {
        dir = await cloneRepo(repo);
        const matches = await scanLocalRepoHistory(dir);
        recordAudit({
          identifierId: ctx.identifier.id,
          module: "code_leak",
          action: "repo_scanned",
          details: { repo: repo.full_name, matchCount: matches.length },
        });

        const grouped = new Map<string, HistoryMatch[]>();
        for (const m of matches) {
          const key = `${repo.full_name}:${m.file}:${m.ruleId}:${m.redacted}`;
          grouped.set(key, [...(grouped.get(key) ?? []), m]);
        }

        for (const [key, group] of grouped) {
          const m = group[0];
          findings.push({
            module: "code_leak",
            severity: m.severity,
            title:
              m.category === "sensitive_file"
                ? `Sensitive file "${m.file}" committed in ${repo.full_name}`
                : `${m.description} found in ${repo.full_name}/${m.file}`,
            description:
              m.category === "sensitive_file"
                ? `A file matching a known sensitive pattern was committed to the public repo ${repo.full_name}.`
                : `A probable ${m.description.toLowerCase()} was committed to the public repo ${repo.full_name} (file: ${m.file}). Matched value (redacted): ${m.redacted}. Seen in ${group.length} commit(s), starting with ${m.commit.slice(0, 10)}.`,
            evidence: { repo: repo.full_name, file: m.file, ruleId: m.ruleId, redacted: m.redacted, commits: group.map((g) => g.commit).slice(0, 10) },
            recommendation: recommendationFor(m),
            links: [{ label: `View ${repo.full_name}`, url: repo.html_url }],
            effort: m.category === "sensitive_file" ? "high" : "medium",
            impactScore: SEVERITY_ORDER[m.severity] * 2 + 2,
            dedupeKey: `code_leak:${key}`,
          });
        }
      } catch (err) {
        recordAudit({
          identifierId: ctx.identifier.id,
          module: "code_leak",
          action: "repo_scan_failed",
          details: { repo: repo.full_name, error: String(err) },
        });
      } finally {
        if (dir) cleanup(dir);
      }
    }

    return findings;
  },
};
