# Digital Footprint Checker

A personal, local-only tool that checks what personal information you (or
teammates who've explicitly consented) have exposed publicly, scores the
exposure, and gives a prioritized cleanup checklist.

## ⚠️ Ethics notice — read this first

**This tool is for you, and for people who have explicitly consented and
verified their own identifiers. It must never be used to look up, check,
or investigate anyone else.**

- Every identifier (email, username, domain, GitHub account) can be
  **stored** as soon as you add it, but it is **never queried** by any
  module until it passes ownership verification:
  - **Email** — a one-time code sent to that address (or shown locally if
    you haven't configured SMTP — see below).
  - **Domain** — a DNS TXT record you publish at `_dfc-verify.<domain>`.
  - **Username / GitHub account** — a token placed in a public profile
    bio you control.
- Team members go through **consent mode**: they verify their own
  identifiers, see a plain-English explanation of what's checked, and can
  revoke consent or delete all their data at any time. The admin only ever
  sees anonymized, aggregate stats (a score band, nothing identifying)
  unless a member explicitly opts to share more.
- No module scrapes a site that disallows it. Every external fetch goes
  through a single guarded path that checks `robots.txt` and rate-limits
  itself (see `src/lib/fetchGuard.ts`). Nothing probes login or
  password-reset flows to test whether an account exists.
- Every lookup — identifier, module, timestamp — is written to an
  append-only audit log, visible in the app under **Settings & audit
  log**.
- Each module's data source and terms of use are listed in the same
  Settings page, and every module can be individually toggled off.

## What it checks

| Module | What it does | Data source |
|---|---|---|
| Breach check | Looks up an email in known breaches | [Have I Been Pwned](https://haveibeenpwned.com/API/v3) official API (requires your own `HIBP_API_KEY`) |
| Username footprint | Checks a curated, editable list of sites' **official public APIs** for a public profile under your username, and flags when the same handle links several accounts together | `src/data/sites.json` (GitHub, GitLab, Hacker News, DEV, Keybase, Docker Hub, Codeberg, Mastodon) |
| Code leak check | Clones your own public GitHub repos and scans their **full git history** (not just HEAD) for secrets, API keys, personal data, and sensitive filenames | GitHub public REST API + a local, from-scratch gitleaks-style scanner (`src/lib/secretScanner.ts`) |
| Data broker check | A maintained list of people-search sites with direct search/opt-out links and a status tracker — **never scraped automatically** | `src/data/brokers.json` |
| Metadata cleaner | Upload a photo/PDF/Office file before you publish it; see hidden GPS/author/device/software/timestamp metadata and download a clean copy | Fully local file parsing, no upload leaves your machine |
| Domain exposure | SPF/DKIM/DMARC, subdomains seen in public Certificate Transparency logs, and a direct TCP probe of common ports — **only on the domain you verified ownership of** | DNS + [crt.sh](https://crt.sh/) public CT search |
| Account inventory | Import a password-manager/Takeout CSV export; flags weak/reused/breached passwords (checked locally via k-anonymity) and missing MFA, with "delete this account" links | Local CSV parsing — passwords are used in memory for one pass and never written to disk |
| Pwned Passwords | k-anonymity password check used by Account inventory | [Pwned Passwords range API](https://haveibeenpwned.com/API/v3#PwnedPasswords) — only a 5-character hash prefix ever leaves your machine |

Every module implements the same `DfcModule` interface
(`src/lib/modules/types.ts`) and returns normalized `Finding`s, so adding a
new one is a matter of dropping in another file and registering it in
`src/lib/modules/registry.ts`.

## Scoring

Findings combine into a single 0–100 exposure score
(`src/lib/scoring.ts`): each open finding's severity contributes a
penalty, with each severity tier capped so a pile of "low" findings can't
drown out a single "critical" one. The cleanup checklist
(`src/lib/checklist.ts`) ranks open findings by impact-per-effort, so the
highest-leverage fix is always at the top. Re-running checks compares
against the last run and flags brand-new exposure.

## Privacy & security

- Everything is stored **locally** in a SQLite database
  (`node:sqlite`) at `~/.dfc/dfc.sqlite` by default — override with
  `DFC_DATA_DIR`.
- Sensitive fields (identifier values, finding evidence, imported
  usernames) are encrypted at rest with AES-256-GCM. The key lives at
  `~/.dfc/key.bin`, **outside the repo**, generated on first run.
- Passwords are **never stored** — not plaintext, not hashed. They're only
  used in-memory, once, to check Pwned Passwords (k-anonymity: only a
  5-character hash prefix ever leaves your machine) and to detect reuse
  within the same CSV import.
- The app binds to `127.0.0.1` only (`next dev -H 127.0.0.1` /
  `next start -H 127.0.0.1`) — it is never exposed on your network.
- Uploaded files for the metadata cleaner are validated by **content**
  (magic bytes), not by filename or declared MIME type, capped at 25MB,
  and processed entirely in memory — nothing is written to disk.
- There's a **"Delete all my data"** button in Settings, and team members
  have their own **"delete my data"** control.

## Getting started

```bash
npm install
npm run dev     # http://127.0.0.1:3000, bound to localhost only
```

Optional environment variables (put them in `.env.local`):

```bash
# Enables the breach-check module (HIBP requires a paid API key).
HIBP_API_KEY=...

# Optional: deliver real verification-code emails via SMTP. Without this,
# the app shows the code directly in the UI (since it only ever runs for
# you, locally — see the ethics notice above).
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=you@yourdomain.com
```

## Testing

```bash
npm run test
```

Covers (with synthetic data only — never real people's information):

- **Ownership verification** — unverified identifiers are refused by every
  module; email/domain/username verification each only succeed with the
  correct code/DNS record/profile token.
- **Consent flow** — a team member stays unverified until they confirm
  their own code; the admin aggregate view hides identity/detail unless
  the member opts in; a member can delete all their data at any time.
- **Scoring** — the 0–100 formula, severity caps, and band thresholds.
- **Secret detection** — a synthetic local git repo with planted secrets
  (AWS key, GitHub token, private key, high-entropy generic secret,
  sensitive filename, phone number, credentials-in-a-URL), including one
  secret removed from the working tree in a later commit to prove history
  scanning (not just HEAD) catches it, plus several deliberate look-alike
  lines that must **not** trigger a match (e.g. `password = "changeme"`).
  On that sample: **precision 1.00, recall 1.00** (see
  `tests/secretDetectorAccuracy.test.ts` — run `npx vitest run
  tests/secretDetectorAccuracy.test.ts --reporter=verbose` to see it
  measured live).
- **Metadata stripping** — JPEG (APP1/APP13/COM segments removed, scan
  data byte-identical), PNG (ancillary text/time chunks removed, pixel
  chunks untouched), PDF (title/author/subject/producer/XMP cleared), and
  OOXML (Office) core/app/custom properties cleared.

## Project structure

```
src/lib/                 Core logic: db, crypto, verification, modules, scoring
src/lib/modules/         Pluggable DfcModule implementations + registry
src/lib/metadata/        Per-file-type metadata extraction/stripping
src/data/                Editable site/broker/delete-link lists
src/app/api/             Next.js route handlers (one per resource)
src/app/*/page.tsx       Dashboard UI pages
tests/                   Vitest suite (synthetic data only)
```

## What's intentionally out of scope

- No accounts, no multi-tenant auth, no cloud deployment — this is a
  single-operator local tool by design.
- The username-footprint and domain-exposure modules only use official
  public APIs / DNS / Certificate Transparency — there is no general-purpose
  scraper, and the data-broker module never queries broker sites
  automatically.
