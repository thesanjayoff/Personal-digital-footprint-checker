export type SecretCategory = "secret" | "pii" | "sensitive_file";

export interface SecretRule {
  id: string;
  description: string;
  category: SecretCategory;
  severity: "critical" | "high" | "medium" | "low";
  regex: RegExp;
  /** For generic high-entropy rules: minimum Shannon entropy (bits/char) the captured group must have. */
  minEntropy?: number;
}

export interface SecretMatch {
  ruleId: string;
  description: string;
  category: SecretCategory;
  severity: SecretRule["severity"];
  /** Fully redacted except first/last 4 chars, safe to log/display/store. */
  redacted: string;
  line: number;
  file: string;
}

function entropy(str: string): number {
  if (!str.length) return 0;
  const freq = new Map<string, number>();
  for (const ch of str) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function redact(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

/** Gitleaks/TruffleHog-style rules, reimplemented independently (regex patterns for public token formats are not copyrightable facts). */
export const SECRET_RULES: SecretRule[] = [
  {
    id: "aws_access_key_id",
    description: "AWS Access Key ID",
    category: "secret",
    severity: "critical",
    regex: /\b((?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[A-Z0-9]{16})\b/g,
  },
  {
    id: "aws_secret_key",
    description: "AWS Secret Access Key (heuristic: assigned to an aws-looking variable)",
    category: "secret",
    severity: "critical",
    regex: /aws(.{0,20})?(secret|private)?[_-]?(access)?[_-]?key(.{0,20})?['"]\s*[:=]\s*['"]([A-Za-z0-9/+=]{40})['"]/gi,
  },
  {
    id: "github_token",
    description: "GitHub access token",
    category: "secret",
    severity: "critical",
    regex: /\b((?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{36,255})\b/g,
  },
  {
    id: "slack_token",
    description: "Slack token",
    category: "secret",
    severity: "high",
    regex: /\b(xox[baprs]-[A-Za-z0-9-]{10,72})\b/g,
  },
  {
    id: "stripe_key",
    description: "Stripe API key",
    category: "secret",
    severity: "critical",
    regex: /\b((?:sk|rk)_live_[A-Za-z0-9]{24,99})\b/g,
  },
  {
    id: "google_api_key",
    description: "Google API key",
    category: "secret",
    severity: "high",
    regex: /\b(AIza[0-9A-Za-z\-_]{35})\b/g,
  },
  {
    id: "private_key_block",
    description: "Private key material",
    category: "secret",
    severity: "critical",
    regex: /-----BEGIN (RSA|EC|OPENSSH|DSA|PGP)?\s?PRIVATE KEY-----/g,
  },
  {
    id: "jwt",
    description: "JSON Web Token",
    category: "secret",
    severity: "medium",
    regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
  },
  {
    id: "basic_auth_url",
    description: "Credentials embedded in a URL",
    category: "secret",
    severity: "high",
    regex: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/'"]+:([^\s/@'"]{3,})@[^\s'"]+/gi,
  },
  {
    id: "generic_high_entropy_assignment",
    description: "High-entropy value assigned to a secret-like variable name",
    category: "secret",
    severity: "medium",
    regex:
      /(?:secret|token|api[_-]?key|apikey|access[_-]?key|auth|passwd|password|pwd|client[_-]?secret)\s*[:=]\s*['"]([A-Za-z0-9_\-+/=]{16,})['"]/gi,
    minEntropy: 3.2,
  },
  {
    id: "phone_number",
    description: "Phone number",
    category: "pii",
    severity: "low",
    regex: /(?<!\d)(\+?\d{1,3}[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?!\d)/g,
  },
  {
    id: "street_address",
    description: "Street address",
    category: "pii",
    severity: "low",
    regex: /\b\d{1,5}\s+([A-Za-z0-9.'-]+\s){1,4}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct)\b/gi,
  },
];

const SENSITIVE_FILENAME_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\..*)?$/,
  /(^|\/)id_rsa$/,
  /(^|\/)id_ed25519$/,
  /(^|\/)\.pem$/i,
  /(^|\/)\.pfx$/i,
  /(^|\/)\.p12$/i,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.git-credentials$/,
  /(^|\/)credentials(\.json)?$/i,
  /(^|\/)\.aws\/credentials$/,
  /(^|\/)secrets?\.ya?ml$/i,
  /(^|\/)\.pypirc$/,
];

export function isSensitiveFilename(filePath: string): boolean {
  return SENSITIVE_FILENAME_PATTERNS.some((re) => re.test(filePath));
}

/** Scans one file's full text, returning every rule match with its line number. */
export function scanContent(filePath: string, content: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const lines = content.split(/\r?\n/);

  if (isSensitiveFilename(filePath)) {
    matches.push({
      ruleId: "sensitive_filename",
      description: `Sensitive file committed: ${filePath}`,
      category: "sensitive_file",
      severity: "high",
      redacted: filePath,
      line: 0,
      file: filePath,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of SECRET_RULES) {
      const re = new RegExp(rule.regex.source, rule.regex.flags.includes("g") ? rule.regex.flags : rule.regex.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const captured = m[1] ?? m[0];
        if (rule.minEntropy !== undefined && entropy(captured) < rule.minEntropy) continue;
        matches.push({
          ruleId: rule.id,
          description: rule.description,
          category: rule.category,
          severity: rule.severity,
          redacted: redact(captured),
          line: i + 1,
          file: filePath,
        });
        if (m[0].length === 0) re.lastIndex++; // guard against zero-width infinite loop
      }
    }
  }
  return matches;
}

/** Scans a single added line (used for git-history diff scanning) without filename context. */
export function scanLine(line: string): Omit<SecretMatch, "file" | "line">[] {
  const results = scanContent("diff-line", line).filter((m) => m.ruleId !== "sensitive_filename");
  return results;
}
