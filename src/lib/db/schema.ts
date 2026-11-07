export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS identifiers (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',       -- 'me' or a team member id
  type TEXT NOT NULL CHECK(type IN ('email','username','domain','github')),
  value_encrypted TEXT NOT NULL,
  value_fingerprint TEXT NOT NULL,        -- sha256(lowercased value), used for lookups w/o decrypting
  verified_at TEXT,
  verification_method TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identifiers_fingerprint ON identifiers(value_fingerprint);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  identifier_id TEXT NOT NULL REFERENCES identifiers(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK(method IN ('email_code','dns_txt','profile_token','oauth_github')),
  code_hash TEXT,
  token TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','verified','failed','expired')) DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email_encrypted TEXT NOT NULL,
  email_fingerprint TEXT NOT NULL,
  consent_status TEXT NOT NULL CHECK(consent_status IN ('invited','consented','revoked')) DEFAULT 'invited',
  share_with_admin INTEGER NOT NULL DEFAULT 0, -- 0 = admin sees aggregate-only, 1 = member opted to share detail
  invited_at TEXT NOT NULL,
  consented_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  score INTEGER,
  previous_score INTEGER,
  trigger TEXT NOT NULL DEFAULT 'manual' CHECK(trigger IN ('manual','scheduled'))
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  identifier_id TEXT NOT NULL REFERENCES identifiers(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low','info')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_encrypted TEXT,
  recommendation TEXT NOT NULL,
  links_json TEXT NOT NULL DEFAULT '[]',
  effort TEXT NOT NULL DEFAULT 'medium' CHECK(effort IN ('low','medium','high')),
  impact_score INTEGER NOT NULL DEFAULT 5,
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','done','dismissed')) DEFAULT 'open',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_findings_run ON findings(run_id);
CREATE INDEX IF NOT EXISTS idx_findings_dedupe ON findings(dedupe_key);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  identifier_id TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT
);

CREATE TABLE IF NOT EXISTS broker_opt_outs (
  id TEXT PRIMARY KEY,
  identifier_id TEXT NOT NULL REFERENCES identifiers(id) ON DELETE CASCADE,
  broker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('not_started','requested','confirmed','relisted')) DEFAULT 'not_started',
  requested_at TEXT,
  confirmed_at TEXT,
  notes TEXT,
  UNIQUE(identifier_id, broker_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_inventory (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  service_name TEXT NOT NULL,
  username_encrypted TEXT,
  email_encrypted TEXT,
  last_used_at TEXT,
  has_mfa INTEGER,
  password_strength TEXT CHECK(password_strength IN ('weak','reused','ok','unknown')) DEFAULT 'unknown',
  breached INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('active','to_delete','deleted')) DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL
);
`;
