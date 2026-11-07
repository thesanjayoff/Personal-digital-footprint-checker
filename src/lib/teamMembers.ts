import { getDb, genId, nowIso } from "./db";
import { encryptField, decryptField, hashSecret } from "./crypto";
import { addIdentifier, listIdentifiers, deleteIdentifier } from "./identifiers";
import { startVerification, type StartVerificationResult } from "./verification";
import { listAllFindings } from "./findings";
import { computeScore, scoreBand } from "./scoring";
import { recordAudit } from "./audit";

export interface TeamMemberRecord {
  id: string;
  display_name: string;
  email: string;
  consent_status: "invited" | "consented" | "revoked";
  share_with_admin: boolean;
  invited_at: string;
  consented_at: string | null;
  revoked_at: string | null;
}

interface Row {
  id: string;
  display_name: string;
  email_encrypted: string;
  email_fingerprint: string;
  consent_status: "invited" | "consented" | "revoked";
  share_with_admin: number;
  invited_at: string;
  consented_at: string | null;
  revoked_at: string | null;
}

function toRecord(row: Row): TeamMemberRecord {
  return {
    id: row.id,
    display_name: row.display_name,
    email: decryptField(row.email_encrypted),
    consent_status: row.consent_status,
    share_with_admin: row.share_with_admin === 1,
    invited_at: row.invited_at,
    consented_at: row.consented_at,
    revoked_at: row.revoked_at,
  };
}

/**
 * Invites a team member and immediately starts ownership verification on
 * their email — nothing about them is ever looked up until they complete
 * it themselves. This is the entry point for "consent mode".
 */
export async function inviteTeamMember(
  displayName: string,
  email: string
): Promise<{ member: TeamMemberRecord; identifierId: string; verification: StartVerificationResult }> {
  const db = getDb();
  const id = genId("member");
  const invited_at = nowIso();
  db.prepare(
    `INSERT INTO team_members (id, display_name, email_encrypted, email_fingerprint, consent_status, invited_at)
     VALUES (?, ?, ?, ?, 'invited', ?)`
  ).run(id, displayName, encryptField(email), hashSecret(email.trim().toLowerCase()), invited_at);

  const identifier = addIdentifier(id, "email", email);
  const verification = await startVerification(identifier.id);
  recordAudit({ identifierId: identifier.id, module: "consent", action: "member_invited", details: { memberId: id } });

  return { member: getTeamMember(id)!, identifierId: identifier.id, verification };
}

export function markConsented(memberId: string): void {
  getDb()
    .prepare(`UPDATE team_members SET consent_status = 'consented', consented_at = ? WHERE id = ?`)
    .run(nowIso(), memberId);
  recordAudit({ module: "consent", action: "member_consented", details: { memberId } });
}

export function setShareWithAdmin(memberId: string, share: boolean): void {
  getDb().prepare(`UPDATE team_members SET share_with_admin = ? WHERE id = ?`).run(share ? 1 : 0, memberId);
}

/** "delete my data at any time" — wipes every identifier (cascading to verifications/findings) and the membership row itself. */
export function deleteTeamMemberData(memberId: string): void {
  for (const identifier of listIdentifiers(memberId)) {
    deleteIdentifier(identifier.id);
  }
  getDb().prepare(`DELETE FROM team_members WHERE id = ?`).run(memberId);
  recordAudit({ module: "consent", action: "member_data_deleted", details: { memberId } });
}

export function revokeConsent(memberId: string): void {
  getDb().prepare(`UPDATE team_members SET consent_status = 'revoked', revoked_at = ? WHERE id = ?`).run(nowIso(), memberId);
  recordAudit({ module: "consent", action: "member_consent_revoked", details: { memberId } });
}

export function getTeamMember(id: string): TeamMemberRecord | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM team_members WHERE id = ?`).get(id) as unknown as Row | undefined;
  return row ? toRecord(row) : null;
}

export function listTeamMembers(): TeamMemberRecord[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM team_members ORDER BY invited_at DESC`).all() as unknown as Row[];
  return rows.map(toRecord);
}

export interface AdminAggregateEntry {
  label: string;
  consentStatus: TeamMemberRecord["consent_status"];
  score: number | null;
  band: string | null;
  shared: boolean;
  findingCount?: number;
  openCritical?: number;
  openHigh?: number;
}

/**
 * The admin view: members who haven't opted to share get only a label and
 * a score band, nothing identifying and nothing about individual findings.
 */
export function getAdminAggregateView(): AdminAggregateEntry[] {
  const members = listTeamMembers();
  return members.map((member, idx) => {
    if (member.consent_status !== "consented") {
      return { label: `Member ${idx + 1} (not yet consented)`, consentStatus: member.consent_status, score: null, band: null, shared: false };
    }
    const findings = listAllFindings(member.id);
    const open = findings.filter((f) => f.status === "open");
    const { score } = computeScore(open);
    const band = scoreBand(score);
    if (!member.share_with_admin) {
      return { label: `Member ${idx + 1} (anonymous)`, consentStatus: member.consent_status, score, band, shared: false };
    }
    return {
      label: member.display_name,
      consentStatus: member.consent_status,
      score,
      band,
      shared: true,
      findingCount: findings.length,
      openCritical: open.filter((f) => f.severity === "critical").length,
      openHigh: open.filter((f) => f.severity === "high").length,
    };
  });
}
