import dns from "node:dns/promises";
import { getDb, genId, nowIso } from "./db";
import { hashSecret, constantTimeEqual, randomCode, randomToken } from "./crypto";
import { getIdentifier, markVerified, type IdentifierRecord } from "./identifiers";
import { sendVerificationCode } from "./mailer";
import { recordAudit } from "./audit";

export type VerificationMethod = "email_code" | "dns_txt" | "profile_token";

const EXPIRY_MINUTES = 30;

interface VerificationRow {
  id: string;
  identifier_id: string;
  method: VerificationMethod;
  code_hash: string | null;
  token: string | null;
  status: "pending" | "verified" | "failed" | "expired";
  attempts: number;
  created_at: string;
  expires_at: string;
  verified_at: string | null;
}

function methodForType(type: IdentifierRecord["type"]): VerificationMethod {
  switch (type) {
    case "email":
      return "email_code";
    case "domain":
      return "dns_txt";
    case "username":
    case "github":
      return "profile_token";
  }
}

export interface StartVerificationResult {
  verificationId: string;
  method: VerificationMethod;
  expiresAt: string;
  /** Present only for dns_txt / profile_token: what to publish and where. */
  instructions?: string;
  /** Present only when email delivery could not be configured (local mode). */
  localCode?: string;
}

export async function startVerification(identifierId: string): Promise<StartVerificationResult> {
  const identifier = getIdentifier(identifierId);
  if (!identifier) throw new Error("Unknown identifier");
  const method = methodForType(identifier.type);
  const db = getDb();
  const id = genId("verif");
  const created_at = nowIso();
  const expires_at = new Date(Date.now() + EXPIRY_MINUTES * 60_000).toISOString();

  let codeHash: string | null = null;
  let token: string | null = null;
  let localCode: string | undefined;
  let instructions: string | undefined;

  if (method === "email_code") {
    const code = randomCode(8);
    codeHash = hashSecret(code);
    const result = await sendVerificationCode(identifier.value, code);
    if (result.mode === "local-display") {
      localCode = code;
      instructions =
        "No SMTP is configured, so the code was not emailed. Because this app only ever runs for you, " +
        "locally, the code is shown below for convenience — configure SMTP_* env vars for real delivery.";
    }
  } else if (method === "dns_txt") {
    token = `dfc-verify=${randomToken(16)}`;
    instructions = `Create a DNS TXT record at _dfc-verify.${identifier.value} with the exact value: ${token}`;
  } else if (method === "profile_token") {
    token = `dfc-verify-${randomToken(12)}`;
    if (identifier.type === "github") {
      instructions = `Add "${token}" anywhere in your public GitHub bio (https://github.com/settings/profile), then confirm.`;
    } else {
      instructions = `Add "${token}" anywhere in a public profile bio you control for username "${identifier.value}" (tell us the profile URL when confirming).`;
    }
  }

  db.prepare(
    `INSERT INTO verifications (id, identifier_id, method, code_hash, token, status, attempts, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`
  ).run(id, identifierId, method, codeHash, token, created_at, expires_at);

  recordAudit({ identifierId, module: "verification", action: "start", details: { method } });

  return { verificationId: id, method, expiresAt: expires_at, instructions, localCode };
}

function getVerification(id: string): VerificationRow | null {
  const db = getDb();
  return (db.prepare(`SELECT * FROM verifications WHERE id = ?`).get(id) as unknown as VerificationRow | undefined) ?? null;
}

function expireIfNeeded(v: VerificationRow): VerificationRow {
  if (v.status === "pending" && new Date(v.expires_at).getTime() < Date.now()) {
    getDb().prepare(`UPDATE verifications SET status = 'expired' WHERE id = ?`).run(v.id);
    return { ...v, status: "expired" };
  }
  return v;
}

export interface ConfirmInput {
  verificationId: string;
  code?: string;
  profileUrl?: string;
}

export interface ConfirmResult {
  verified: boolean;
  reason?: string;
}

export async function confirmVerification(input: ConfirmInput): Promise<ConfirmResult> {
  let v = getVerification(input.verificationId);
  if (!v) return { verified: false, reason: "Unknown verification request." };
  v = expireIfNeeded(v);
  if (v.status !== "pending") {
    return { verified: false, reason: `Verification is ${v.status}, not pending.` };
  }
  const identifier = getIdentifier(v.identifier_id);
  if (!identifier) return { verified: false, reason: "Identifier no longer exists." };

  const db = getDb();
  let ok = false;
  let reason: string | undefined;

  if (v.method === "email_code") {
    if (!input.code) {
      reason = "Missing code.";
    } else if (v.code_hash && constantTimeEqual(hashSecret(input.code.trim()), v.code_hash)) {
      ok = true;
    } else {
      reason = "Incorrect code.";
    }
  } else if (v.method === "dns_txt") {
    try {
      const records = await dns.resolveTxt(`_dfc-verify.${identifier.value}`);
      const flat = records.map((r) => r.join(""));
      ok = flat.some((r) => r.trim() === v!.token);
      if (!ok) reason = "TXT record not found or does not match yet (DNS can take time to propagate).";
    } catch {
      reason = "Could not resolve the TXT record. It may not have propagated yet.";
    }
  } else if (v.method === "profile_token") {
    if (identifier.type === "github") {
      try {
        const res = await fetch(`https://api.github.com/users/${encodeURIComponent(identifier.value)}`, {
          headers: { "User-Agent": "digital-footprint-checker-local" },
        });
        if (res.ok) {
          const data = (await res.json()) as { bio?: string | null };
          ok = !!data.bio && data.bio.includes(v.token ?? "\u0000");
          if (!ok) reason = "Token not found in GitHub bio yet.";
        } else {
          reason = `GitHub API returned ${res.status}.`;
        }
      } catch {
        reason = "Could not reach the GitHub API.";
      }
    } else {
      if (!input.profileUrl) {
        reason = "Provide the profile URL that contains the token.";
      } else {
        try {
          const url = new URL(input.profileUrl);
          if (!/^https?:$/.test(url.protocol)) throw new Error("bad protocol");
          const res = await fetch(url, { headers: { "User-Agent": "digital-footprint-checker-local" } });
          const text = await res.text();
          ok = text.includes(v.token ?? "\u0000");
          if (!ok) reason = "Token not found on that page yet.";
        } catch {
          reason = "Could not fetch that profile URL.";
        }
      }
    }
  }

  const attempts = v.attempts + 1;
  if (ok) {
    db.prepare(`UPDATE verifications SET status = 'verified', verified_at = ?, attempts = ? WHERE id = ?`).run(
      nowIso(),
      attempts,
      v.id
    );
    markVerified(identifier.id, v.method);
    recordAudit({ identifierId: identifier.id, module: "verification", action: "confirmed", details: { method: v.method } });
    return { verified: true };
  }
  db.prepare(`UPDATE verifications SET attempts = ? WHERE id = ?`).run(attempts, v.id);
  recordAudit({ identifierId: identifier.id, module: "verification", action: "failed_attempt", details: { method: v.method, reason } });
  return { verified: false, reason };
}

export function listVerifications(identifierId: string): VerificationRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM verifications WHERE identifier_id = ? ORDER BY created_at DESC`)
    .all(identifierId) as unknown as VerificationRow[];
}
