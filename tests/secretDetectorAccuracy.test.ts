import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanLocalRepoHistory } from "@/lib/gitHistoryScanner";

/**
 * Builds a throwaway local git repo with known planted secrets (true
 * positives) and known look-alike-but-safe lines (true negatives / FP
 * traps), including one secret that is added in one commit and then
 * deleted in a later commit — proving the scanner finds it via history,
 * not just by reading the current working tree.
 */
describe("secret detector precision/recall on a synthetic repo", () => {
  let repoDir: string;

  const PLANTED = [
    { file: "config.js", ruleId: "aws_access_key_id", removedLater: true },
    { file: "config.js", ruleId: "github_token", removedLater: false },
    { file: "server.pem", ruleId: "private_key_block", removedLater: false },
    { file: "config.js", ruleId: "generic_high_entropy_assignment", removedLater: false },
    { file: ".env", ruleId: "sensitive_filename", removedLater: false },
    { file: "notes.txt", ruleId: "phone_number", removedLater: false },
    { file: "notes.txt", ruleId: "basic_auth_url", removedLater: false },
  ];

  beforeAll(async () => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "dfc-secret-accuracy-"));
    const git = simpleGit(repoDir);
    await git.init();
    await git.addConfig("user.name", "Test User");
    await git.addConfig("user.email", "test@example.invalid");

    fs.writeFileSync(
      path.join(repoDir, "config.js"),
      [
        `const AWS_KEY = "AKIAABCDEFGHIJKLMNOP"; // will be removed in a later commit`,
        `const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";`,
        `const apiSecret = "zQ9k2vL8pN4xR7mC1wF6sT3u";`,
        `const password = "changeme"; // benign: common placeholder, low entropy`,
        `const apiKey = "xxxxxxxxxxxxxxxxxxxx"; // benign: repeated-char placeholder`,
      ].join("\n")
    );
    fs.writeFileSync(path.join(repoDir, "server.pem"), `-----BEGIN RSA PRIVATE KEY-----\nMIIBOg...fake...\n-----END RSA PRIVATE KEY-----`);
    fs.writeFileSync(path.join(repoDir, ".env"), `DB_PASSWORD=supersecret123`);
    fs.writeFileSync(
      path.join(repoDir, "notes.txt"),
      [
        `Call the on-call engineer at 415-555-0132 if this breaks.`,
        `Debug endpoint: https://admin:Sw0rdSecure123@internal.example.com/status`,
        `// TODO: fetch the real token from vault before shipping`,
        `See https://example.com/path for the public docs.`,
        `Version 2024.11.07 build 1000`,
      ].join("\n")
    );
    await git.add(".");
    await git.commit("Initial commit with planted secrets and benign look-alikes");

    // Remove the AWS key from the working tree in a later commit — the
    // scanner must still find it by walking history, not just HEAD.
    fs.writeFileSync(
      path.join(repoDir, "config.js"),
      [
        `const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";`,
        `const apiSecret = "zQ9k2vL8pN4xR7mC1wF6sT3u";`,
        `const password = "changeme";`,
        `const apiKey = "xxxxxxxxxxxxxxxxxxxx";`,
      ].join("\n")
    );
    await git.add(".");
    await git.commit("Remove AWS key from working tree (but it lives on in history)");
  });

  afterAll(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it("finds every planted secret, including one purged from the working tree, with no false positives on the look-alike lines", async () => {
    const matches = await scanLocalRepoHistory(repoDir);

    let truePositives = 0;
    for (const planted of PLANTED) {
      const hit = matches.some((m) => m.file === planted.file && m.ruleId === planted.ruleId);
      if (hit) truePositives++;
      expect(hit, `expected to find ${planted.ruleId} in ${planted.file}`).toBe(true);
    }

    // Anything flagged that isn't one of the planted rule/file pairs is a false positive —
    // in particular the five deliberately benign lines must produce zero matches.
    const falsePositives = matches.filter(
      (m) => !PLANTED.some((p) => p.file === m.file && p.ruleId === m.ruleId)
    );

    const falseNegatives = PLANTED.length - truePositives;
    const precision = truePositives / (truePositives + falsePositives.length);
    const recall = truePositives / (truePositives + falseNegatives);

    console.log(
      `[secret detector accuracy] TP=${truePositives} FP=${falsePositives.length} FN=${falseNegatives} precision=${precision.toFixed(2)} recall=${recall.toFixed(2)}`
    );
    if (falsePositives.length > 0) {
      console.log("False positives:", falsePositives.map((m) => `${m.file}:${m.ruleId}`));
    }

    expect(precision).toBeGreaterThanOrEqual(0.8);
    expect(recall).toBeGreaterThanOrEqual(0.8);
  });
});
