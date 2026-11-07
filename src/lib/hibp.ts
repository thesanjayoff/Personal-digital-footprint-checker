import { sha1Upper } from "./crypto";
import type { Severity } from "./modules/types";

const HIBP_BASE = "https://haveibeenpwned.com/api/v3";
const PWNED_PASSWORDS_BASE = "https://api.pwnedpasswords.com/range";
const USER_AGENT = "digital-footprint-checker-local";

export interface HibpBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsSensitive: boolean;
}

export function isHibpConfigured(): boolean {
  return !!process.env.HIBP_API_KEY;
}

/** Have I Been Pwned breach lookup for one email. Requires HIBP_API_KEY (paid, official API). */
export async function fetchBreaches(email: string): Promise<HibpBreach[]> {
  const apiKey = process.env.HIBP_API_KEY;
  if (!apiKey) throw new Error("HIBP_API_KEY is not configured");
  const res = await fetch(
    `${HIBP_BASE}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
    { headers: { "hibp-api-key": apiKey, "user-agent": USER_AGENT } }
  );
  if (res.status === 404) return [];
  if (res.status === 429) throw new Error("HIBP rate limit hit; try again shortly.");
  if (!res.ok) throw new Error(`HIBP API returned ${res.status}`);
  return (await res.json()) as HibpBreach[];
}

const HIGHLY_SENSITIVE_CLASSES = [
  "passwords",
  "security questions and answers",
  "social security numbers",
  "credit cards",
  "financial",
  "bank account numbers",
  "biometric data",
];

export function classifyBreachSeverity(breach: HibpBreach): Severity {
  const classes = breach.DataClasses.map((c) => c.toLowerCase());
  const sensitiveHits = classes.filter((c) => HIGHLY_SENSITIVE_CLASSES.some((s) => c.includes(s)));
  if (breach.IsSensitive || sensitiveHits.length >= 2) return "critical";
  if (sensitiveHits.length >= 1) return "high";
  if (classes.length >= 3) return "medium";
  return "low";
}

/**
 * Pwned Passwords k-anonymity check: only the first 5 hex characters of the
 * SHA-1 hash ever leave the machine. The full password and full hash never
 * do. Returns how many times this exact password has been seen in breaches
 * (0 = not found).
 */
export async function checkPasswordPwned(password: string): Promise<number> {
  const hash = sha1Upper(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const res = await fetch(`${PWNED_PASSWORDS_BASE}/${prefix}`, {
    headers: { "user-agent": USER_AGENT, "Add-Padding": "true" },
  });
  if (!res.ok) throw new Error(`Pwned Passwords API returned ${res.status}`);
  const body = await res.text();
  for (const line of body.split("\n")) {
    const [lineSuffix, count] = line.trim().split(":");
    if (lineSuffix === suffix) return Number(count) || 0;
  }
  return 0;
}
