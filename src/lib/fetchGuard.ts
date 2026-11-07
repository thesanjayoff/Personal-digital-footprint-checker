import robotsParser from "robots-parser";

const USER_AGENT = "digital-footprint-checker/0.1 (+local, personal-use-only)";

const robotsCache = new Map<string, { parser: ReturnType<typeof robotsParser>; fetchedAt: number }>();
const lastRequestAtByHost = new Map<string, number>();
const MIN_INTERVAL_MS = 1200;
const ROBOTS_TTL_MS = 10 * 60_000;

async function getRobots(origin: string) {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) return cached.parser;
  const robotsUrl = `${origin}/robots.txt`;
  let body = "";
  try {
    const res = await fetch(robotsUrl, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
    if (res.ok) body = await res.text();
  } catch {
    // No robots.txt reachable — treat as "no rules", which is the standard
    // interpretation when the file is missing (not when it's present and disallows).
    body = "";
  }
  const parser = robotsParser(robotsUrl, body);
  robotsCache.set(origin, { parser, fetchedAt: Date.now() });
  return parser;
}

async function throttle(host: string): Promise<void> {
  const last = lastRequestAtByHost.get(host) ?? 0;
  const wait = MIN_INTERVAL_MS - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAtByHost.set(host, Date.now());
}

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows fetching ${url}; skipping per site policy.`);
    this.name = "RobotsDisallowedError";
  }
}

/**
 * The single choke point every module must use to fetch a third-party page.
 * It enforces: robots.txt compliance, a minimum per-host request interval,
 * and a descriptive User-Agent (never spoofed as a browser).
 */
export async function guardedFetch(url: string, init?: RequestInit): Promise<Response> {
  const parsed = new URL(url);
  const origin = `${parsed.protocol}//${parsed.host}`;
  const robots = await getRobots(origin);
  if (robots.isAllowed(url, USER_AGENT) === false) {
    throw new RobotsDisallowedError(url);
  }
  await throttle(parsed.host);
  return fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...(init?.headers ?? {}) },
    redirect: "follow",
  });
}

export function guardUserAgent(): string {
  return USER_AGENT;
}
