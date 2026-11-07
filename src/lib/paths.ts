import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/**
 * All local, private state lives outside the repo by default (in the user's
 * home directory), so cloning/sharing the code never leaks the encryption
 * key or the database. Both can be overridden via env vars for advanced use.
 */
function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function getDataDir(): string {
  const dir = process.env.DFC_DATA_DIR ?? path.join(os.homedir(), ".dfc");
  return ensureDir(dir);
}

export function getDbPath(): string {
  return process.env.DFC_DB_PATH ?? path.join(getDataDir(), "dfc.sqlite");
}

export function getKeyPath(): string {
  return process.env.DFC_KEY_PATH ?? path.join(getDataDir(), "key.bin");
}

export function getUploadTmpDir(): string {
  return ensureDir(process.env.DFC_UPLOAD_DIR ?? path.join(getDataDir(), "uploads-tmp"));
}
