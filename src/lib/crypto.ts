import crypto from "node:crypto";
import fs from "node:fs";
import { getKeyPath } from "./paths";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

let cachedKey: Buffer | null = null;

/**
 * Loads (or generates on first run) the 32-byte local encryption key.
 * The key file lives outside the repo (see paths.ts) and is never logged
 * or transmitted anywhere.
 */
export function loadOrCreateKey(): Buffer {
  if (cachedKey) return cachedKey;
  const keyPath = getKeyPath();
  if (fs.existsSync(keyPath)) {
    cachedKey = fs.readFileSync(keyPath);
    if (cachedKey.length !== 32) {
      throw new Error(`Encryption key at ${keyPath} is not 32 bytes; refusing to use it.`);
    }
    return cachedKey;
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  cachedKey = key;
  return key;
}

/** Encrypts plaintext for storage. Returns a self-contained base64 blob: iv || tag || ciphertext. */
export function encryptField(plaintext: string): string {
  const key = loadOrCreateKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypts a blob produced by encryptField. */
export function decryptField(blob: string): string {
  const key = loadOrCreateKey();
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + 16);
  const ciphertext = raw.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** One-way hash for codes/tokens we need to compare but never reveal (e.g. verification codes). */
export function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function randomCode(digits = 8): string {
  const max = 10 ** digits;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(digits, "0");
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** SHA-1 of a password, used only for the local HIBP k-anonymity range check (never sent in full). */
export function sha1Upper(value: string): string {
  return crypto.createHash("sha1").update(value, "utf8").digest("hex").toUpperCase();
}

/** Only for tests: forces the key to be re-read/re-generated from the (now test-pointed) key path. */
export function resetKeyCacheForTests(): void {
  cachedKey = null;
}
