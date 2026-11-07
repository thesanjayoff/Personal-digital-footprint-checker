import { describe, expect, it } from "vitest";
import { scanContent, isSensitiveFilename, redact } from "@/lib/secretScanner";

describe("secretScanner rules", () => {
  it("detects an AWS access key id", () => {
    const matches = scanContent("config.js", `const AWS_KEY = "AKIAABCDEFGHIJKLMNOP";`);
    expect(matches.some((m) => m.ruleId === "aws_access_key_id")).toBe(true);
  });

  it("detects a GitHub token", () => {
    const matches = scanContent("config.js", `const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";`);
    expect(matches.some((m) => m.ruleId === "github_token")).toBe(true);
  });

  it("detects a private key block", () => {
    const matches = scanContent("id_rsa.txt", `-----BEGIN RSA PRIVATE KEY-----`);
    expect(matches.some((m) => m.ruleId === "private_key_block")).toBe(true);
  });

  it("detects credentials embedded in a URL", () => {
    const matches = scanContent("notes.txt", `curl https://admin:Sw0rdSecure123@internal.example.com/status`);
    expect(matches.some((m) => m.ruleId === "basic_auth_url")).toBe(true);
  });

  it("flags a sensitive filename regardless of content", () => {
    const matches = scanContent(".env", `DB_PASSWORD=supersecret123`);
    expect(matches.some((m) => m.ruleId === "sensitive_filename")).toBe(true);
    expect(isSensitiveFilename(".env")).toBe(true);
    expect(isSensitiveFilename("src/app.ts")).toBe(false);
  });

  it("requires high entropy before flagging a generic secret-like assignment", () => {
    const low = scanContent("config.js", `const password = "changeme";`);
    expect(low.some((m) => m.ruleId === "generic_high_entropy_assignment")).toBe(false);

    const high = scanContent("config.js", `const apiSecret = "zQ9k2vL8pN4xR7mC1wF6sT3u";`);
    expect(high.some((m) => m.ruleId === "generic_high_entropy_assignment")).toBe(true);
  });

  it("does not flag an all-repeated-character placeholder", () => {
    const matches = scanContent("config.js", `const apiKey = "xxxxxxxxxxxxxxxxxxxx";`);
    expect(matches.some((m) => m.ruleId === "generic_high_entropy_assignment")).toBe(false);
  });

  it("does not flag an ordinary URL with no credentials", () => {
    const matches = scanContent("notes.txt", `See https://example.com/path for details.`);
    expect(matches.some((m) => m.ruleId === "basic_auth_url")).toBe(false);
  });

  it("redacts values down to a safe-to-display form", () => {
    expect(redact("AKIAABCDEFGHIJKLMNOP")).toBe("AKIA************MNOP");
    expect(redact("abc")).toBe("***");
  });
});
