import type { DfcModule, FindingInput } from "./types";
import sites from "../../data/sites.json";
import { recordAudit } from "../audit";
import { RobotsDisallowedError } from "../fetchGuard";

interface SiteDef {
  id: string;
  name: string;
  profileUrl: string;
  checkUrl: string;
  mode: "http_status" | "json_nonempty_array" | "json_nonnull" | "json_path_nonempty_array";
  path?: string;
}

const SITES = sites as SiteDef[];

function fill(template: string, username: string): string {
  return template.replace("{username}", encodeURIComponent(username));
}

async function checkSite(
  site: SiteDef,
  username: string,
  fetcher: (url: string) => Promise<Response>
): Promise<{ found: boolean; skipped?: string }> {
  const url = fill(site.checkUrl, username);
  try {
    const res = await fetcher(url);
    if (site.mode === "http_status") {
      if (res.status === 404) return { found: false };
      if (res.ok) return { found: true };
      return { found: false, skipped: `unexpected status ${res.status}` };
    }
    if (!res.ok && res.status !== 404) return { found: false, skipped: `unexpected status ${res.status}` };
    const body = res.status === 404 ? null : await res.json().catch(() => null);
    if (site.mode === "json_nonnull") return { found: body != null };
    if (site.mode === "json_nonempty_array") return { found: Array.isArray(body) && body.length > 0 };
    if (site.mode === "json_path_nonempty_array" && site.path) {
      const arr = body?.[site.path];
      return { found: Array.isArray(arr) && arr.length > 0 };
    }
    return { found: false, skipped: "unrecognized mode" };
  } catch (err) {
    if (err instanceof RobotsDisallowedError) return { found: false, skipped: "robots.txt disallows" };
    return { found: false, skipped: "network error" };
  }
}

export const usernameFootprintModule: DfcModule = {
  id: "username_footprint",
  name: "Username footprint",
  description:
    "Checks a curated, editable list of sites' official public APIs/pages to see where a username has a public profile.",
  dataSource: "Per-site official public APIs — see src/data/sites.json (editable) for the full list and sources.",
  termsUrl: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
  supportedTypes: ["username"],

  async run(ctx): Promise<FindingInput[]> {
    const username = ctx.identifier.value;
    const found: SiteDef[] = [];

    for (const site of SITES) {
      const result = await checkSite(site, username, ctx.fetch);
      recordAudit({
        identifierId: ctx.identifier.id,
        module: "username_footprint",
        action: "site_checked",
        details: { site: site.id, found: result.found, skipped: result.skipped },
      });
      if (result.found) found.push(site);
    }

    const findings: FindingInput[] = found.map((site) => ({
      module: "username_footprint",
      severity: found.length >= 3 ? "medium" : "low",
      title: `Public profile found on ${site.name}`,
      description: `The username "${username}" has a public profile on ${site.name}. On its own this is often intentional, but reused usernames make it easy to link your accounts together.`,
      evidence: { site: site.id, profileUrl: fill(site.profileUrl, username) },
      recommendation: `If you don't want this profile linked to your other accounts, consider using a distinct username on ${site.name} or locking down/deleting the profile.`,
      links: [{ label: `View profile on ${site.name}`, url: fill(site.profileUrl, username) }],
      effort: "medium",
      impactScore: 4,
      dedupeKey: `username_footprint:${site.id}:${username}`,
    }));

    if (found.length >= 2) {
      findings.push({
        module: "username_footprint",
        severity: found.length >= 4 ? "high" : "medium",
        title: `Username "${username}" links ${found.length} accounts together`,
        description: `The same username appears publicly on ${found.length} sites (${found
          .map((s) => s.name)
          .join(", ")}), making it straightforward for anyone to correlate your activity across them.`,
        evidence: { sites: found.map((s) => s.id) },
        recommendation:
          "Use different usernames for sensitive accounts, or at minimum separate your real identity from the shared handle.",
        links: found.map((s) => ({ label: s.name, url: fill(s.profileUrl, username) })),
        effort: "high",
        impactScore: 6,
        dedupeKey: `username_footprint:linked:${username}`,
      });
    }

    return findings;
  },
};
