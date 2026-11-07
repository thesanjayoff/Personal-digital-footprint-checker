import { describe, expect, it } from "vitest";
import { setupIsolatedDataDir } from "./helpers/testEnv";
import { inviteTeamMember, getTeamMember, setShareWithAdmin, deleteTeamMemberData, getAdminAggregateView } from "@/lib/teamMembers";
import { confirmVerification } from "@/lib/verification";
import { listIdentifiers, requireVerifiedIdentifier, UnverifiedIdentifierError } from "@/lib/identifiers";

setupIsolatedDataDir();

describe("team consent flow", () => {
  it("invites a member in 'invited' state with an unverified identifier", async () => {
    const { member, identifierId } = await inviteTeamMember("Alex", "alex@example.com");
    expect(member.consent_status).toBe("invited");
    expect(() => requireVerifiedIdentifier(identifierId)).toThrow(UnverifiedIdentifierError);
  });

  it("only becomes 'consented' after the member verifies their own email", async () => {
    const { member, verification } = await inviteTeamMember("Alex", "alex@example.com");
    const result = await confirmVerification({ verificationId: verification.verificationId, code: verification.localCode! });
    expect(result.verified).toBe(true);

    // The route handler calls markConsented() after a verified result; emulate that here.
    const { markConsented } = await import("@/lib/teamMembers");
    markConsented(member.id);

    expect(getTeamMember(member.id)!.consent_status).toBe("consented");
  });

  it("admin aggregate view hides identity and detail unless the member opts to share", async () => {
    const { member, verification } = await inviteTeamMember("Alex", "alex@example.com");
    await confirmVerification({ verificationId: verification.verificationId, code: verification.localCode! });
    const { markConsented } = await import("@/lib/teamMembers");
    markConsented(member.id);

    const hidden = getAdminAggregateView();
    expect(hidden[0].label).not.toContain("Alex");
    expect(hidden[0].shared).toBe(false);
    expect(hidden[0].findingCount).toBeUndefined();

    setShareWithAdmin(member.id, true);
    const shown = getAdminAggregateView();
    expect(shown[0].label).toBe("Alex");
    expect(shown[0].shared).toBe(true);
  });

  it("lets a member delete all of their data at any time", async () => {
    const { member } = await inviteTeamMember("Alex", "alex@example.com");
    expect(listIdentifiers(member.id).length).toBe(1);
    deleteTeamMemberData(member.id);
    expect(listIdentifiers(member.id).length).toBe(0);
    expect(getTeamMember(member.id)).toBeNull();
  });
});
