import { describe, expect, it, vi, beforeEach } from "vitest";
import { setupIsolatedDataDir } from "./helpers/testEnv";
import { addIdentifier, requireVerifiedIdentifier, UnverifiedIdentifierError, getIdentifier } from "@/lib/identifiers";
import { startVerification, confirmVerification } from "@/lib/verification";

setupIsolatedDataDir();

beforeEach(() => {
  // No SMTP configured in tests -> email verification falls back to local-display mode.
  delete process.env.SMTP_HOST;
});

describe("ownership verification gate", () => {
  it("refuses to treat a freshly added identifier as verified", () => {
    const identifier = addIdentifier("me", "email", "me@example.com");
    expect(() => requireVerifiedIdentifier(identifier.id)).toThrow(UnverifiedIdentifierError);
  });

  it("stores unverified identifiers but never marks them verified on their own", () => {
    const identifier = addIdentifier("me", "email", "me@example.com");
    const stored = getIdentifier(identifier.id);
    expect(stored).not.toBeNull();
    expect(stored!.verified_at).toBeNull();
  });

  it("verifies an email identifier only with the exact code", async () => {
    const identifier = addIdentifier("me", "email", "me@example.com");
    const start = await startVerification(identifier.id);
    expect(start.localCode).toBeDefined(); // no SMTP in tests -> code surfaced locally

    const wrong = await confirmVerification({ verificationId: start.verificationId, code: "00000000" });
    expect(wrong.verified).toBe(false);
    expect(() => requireVerifiedIdentifier(identifier.id)).toThrow(UnverifiedIdentifierError);

    const right = await confirmVerification({ verificationId: start.verificationId, code: start.localCode! });
    expect(right.verified).toBe(true);
    expect(() => requireVerifiedIdentifier(identifier.id)).not.toThrow();
  });

  it("does not verify on a reused/expired verification after it already succeeded differently", async () => {
    const identifier = addIdentifier("me", "email", "me@example.com");
    const start = await startVerification(identifier.id);
    await confirmVerification({ verificationId: start.verificationId, code: start.localCode! });
    // Confirming again against the same (now 'verified') request should not throw, but should not re-verify either.
    const again = await confirmVerification({ verificationId: start.verificationId, code: start.localCode! });
    expect(again.verified).toBe(false);
  });

  it("domain verification requires a matching DNS TXT record", async () => {
    const identifier = addIdentifier("me", "domain", "example.invalid");
    const start = await startVerification(identifier.id);
    expect(start.method).toBe("dns_txt");
    const result = await confirmVerification({ verificationId: start.verificationId });
    expect(result.verified).toBe(false);
    expect(() => requireVerifiedIdentifier(identifier.id)).toThrow(UnverifiedIdentifierError);
  });

  it("username verification requires the token to actually be present on the given profile URL", async () => {
    const identifier = addIdentifier("me", "username", "someone");
    const start = await startVerification(identifier.id);
    expect(start.method).toBe("profile_token");
    const token = start.instructions!.match(/"(dfc-verify-\S+)"/)![1];

    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("this page does not contain the token", { status: 200 }))
      );
      const failed = await confirmVerification({ verificationId: start.verificationId, profileUrl: "https://example.invalid/me" });
      expect(failed.verified).toBe(false);
      expect(() => requireVerifiedIdentifier(identifier.id)).toThrow(UnverifiedIdentifierError);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(`<html><body>bio: ${token}</body></html>`, { status: 200 }))
      );
      const succeeded = await confirmVerification({ verificationId: start.verificationId, profileUrl: "https://example.invalid/me" });
      expect(succeeded.verified).toBe(true);
      expect(() => requireVerifiedIdentifier(identifier.id)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
