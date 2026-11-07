import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach } from "vitest";
import { resetDbForTests } from "@/lib/db";
import { resetKeyCacheForTests } from "@/lib/crypto";

/**
 * Points every DFC_* path at a fresh temp directory before each test, so
 * tests never touch the real local data store and never leak state
 * between tests. Call this once per test file.
 */
export function setupIsolatedDataDir(): void {
  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dfc-test-"));
    process.env.DFC_DATA_DIR = dir;
    process.env.DFC_DB_PATH = path.join(dir, "test.sqlite");
    process.env.DFC_KEY_PATH = path.join(dir, "key.bin");
    resetDbForTests();
    resetKeyCacheForTests();
  });
}
