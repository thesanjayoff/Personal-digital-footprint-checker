import { getDb } from "./db";

const DEFAULTS: Record<string, string> = {
  "module_enabled:breach": "true",
  "module_enabled:username_footprint": "true",
  "module_enabled:code_leak": "true",
  "module_enabled:data_broker": "true",
  "module_enabled:metadata": "true",
  "module_enabled:domain_exposure": "true",
  "module_enabled:account_inventory": "true",
};

export function getSetting(key: string): string {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value ?? DEFAULTS[key] ?? "false";
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function isModuleEnabled(moduleId: string): boolean {
  return getSetting(`module_enabled:${moduleId}`) === "true";
}

export function getAllModuleToggles(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(DEFAULTS)) {
    const moduleId = key.split(":")[1];
    out[moduleId] = isModuleEnabled(moduleId);
  }
  return out;
}
