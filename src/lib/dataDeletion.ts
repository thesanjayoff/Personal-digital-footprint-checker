import { getDb } from "./db";
import { listIdentifiers, deleteIdentifier } from "./identifiers";
import { deleteAllAccounts } from "./accountInventory";
import { recordAudit } from "./audit";

/**
 * The "delete all my data" button. Removes every identifier (cascading to
 * verifications and findings), every imported account-inventory row, and
 * every run, for the given owner. The audit log itself is kept (it is the
 * record of what was ever looked up) but scrubbed of the identifier link.
 */
export function deleteAllDataFor(owner: string): void {
  const db = getDb();
  for (const identifier of listIdentifiers(owner)) {
    deleteIdentifier(identifier.id);
  }
  deleteAllAccounts(owner);
  db.prepare(`DELETE FROM runs WHERE owner = ?`).run(owner);
  db.prepare(`UPDATE audit_log SET identifier_id = NULL WHERE identifier_id NOT IN (SELECT id FROM identifiers)`).run();
  recordAudit({ module: "privacy", action: "delete_all_data", details: { owner } });
}
