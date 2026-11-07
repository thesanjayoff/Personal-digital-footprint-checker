import dns from "node:dns/promises";
import net from "node:net";
import type { DfcModule, FindingInput, Severity } from "./types";
import { recordAudit } from "../audit";

const COMMON_DKIM_SELECTORS = ["google", "selector1", "selector2", "k1", "dkim", "mail", "default", "smtp", "mandrill", "sendgrid"];

const SUSPICIOUS_SUBDOMAIN_HINTS = ["dev", "staging", "stage", "test", "uat", "old", "backup", "admin", "internal", "demo", "preprod", "beta", "qa", "legacy"];

const PORT_SEVERITY: Record<number, Severity> = {
  21: "medium",
  22: "info",
  23: "high",
  25: "info",
  110: "medium",
  143: "medium",
  445: "high",
  1433: "high",
  3306: "high",
  3389: "critical",
  5432: "high",
  5900: "high",
  6379: "critical",
  8080: "info",
  8443: "info",
  9200: "high",
  27017: "high",
};

async function checkSpf(domain: string): Promise<FindingInput[]> {
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map((r) => r.join(""));
    const spf = flat.find((r) => r.toLowerCase().startsWith("v=spf1"));
    if (!spf) {
      return [
        {
          module: "domain_exposure",
          severity: "medium",
          title: `No SPF record for ${domain}`,
          description: "Without SPF, receiving mail servers have no way to verify mail claiming to be from your domain, making it easier to spoof.",
          recommendation: `Add a TXT record at ${domain} like "v=spf1 include:_spf.<your-provider>.com -all".`,
          links: [{ label: "SPF record guide", url: "https://www.dmarcanalyzer.com/spf/" }],
          effort: "low",
          impactScore: 5,
          dedupeKey: `domain_exposure:spf_missing:${domain}`,
        },
      ];
    }
    if (/[+~?]all\s*$/.test(spf) && !/-all\s*$/.test(spf)) {
      return [
        {
          module: "domain_exposure",
          severity: "low",
          title: `SPF record for ${domain} is not strict`,
          description: `Your SPF record ("${spf}") doesn't end in "-all", so it doesn't hard-fail unauthorized senders.`,
          recommendation: 'Change the record to end in "-all" once you\'ve confirmed all legitimate senders are listed.',
          evidence: { record: spf },
          links: [{ label: "SPF record guide", url: "https://www.dmarcanalyzer.com/spf/" }],
          effort: "low",
          impactScore: 3,
          dedupeKey: `domain_exposure:spf_weak:${domain}`,
        },
      ];
    }
    return [];
  } catch {
    return [
      {
        module: "domain_exposure",
        severity: "medium",
        title: `No SPF record for ${domain}`,
        description: "No TXT records resolved for this domain, or SPF could not be found.",
        recommendation: `Add a TXT record at ${domain} like "v=spf1 include:_spf.<your-provider>.com -all".`,
        links: [{ label: "SPF record guide", url: "https://www.dmarcanalyzer.com/spf/" }],
        effort: "low",
        impactScore: 5,
        dedupeKey: `domain_exposure:spf_missing:${domain}`,
      },
    ];
  }
}

async function checkDmarc(domain: string): Promise<FindingInput[]> {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const flat = records.map((r) => r.join(""));
    const dmarc = flat.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    if (!dmarc) throw new Error("not found");
    const policyMatch = dmarc.match(/p=(\w+)/i);
    const policy = policyMatch?.[1]?.toLowerCase();
    if (policy === "none" || !policy) {
      return [
        {
          module: "domain_exposure",
          severity: "medium",
          title: `DMARC policy for ${domain} is monitor-only`,
          description: `Your DMARC record has p=${policy ?? "none"}, so spoofed mail is reported but not rejected or quarantined.`,
          recommendation: "Once you've reviewed DMARC reports and confirmed legitimate senders, move the policy to p=quarantine then p=reject.",
          evidence: { record: dmarc },
          links: [{ label: "DMARC guide", url: "https://dmarc.org/overview/" }],
          effort: "medium",
          impactScore: 5,
          dedupeKey: `domain_exposure:dmarc_none:${domain}`,
        },
      ];
    }
    return [];
  } catch {
    return [
      {
        module: "domain_exposure",
        severity: "high",
        title: `No DMARC record for ${domain}`,
        description: "Without DMARC, there's no policy telling mail receivers what to do with mail that fails SPF/DKIM — making domain spoofing (phishing as you) easier.",
        recommendation: `Add a TXT record at _dmarc.${domain} like "v=DMARC1; p=quarantine; rua=mailto:you@${domain}".`,
        links: [{ label: "DMARC guide", url: "https://dmarc.org/overview/" }],
        effort: "medium",
        impactScore: 7,
        dedupeKey: `domain_exposure:dmarc_missing:${domain}`,
      },
    ];
  }
}

async function checkDkim(domain: string): Promise<FindingInput[]> {
  const found: string[] = [];
  for (const selector of COMMON_DKIM_SELECTORS) {
    try {
      const records = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
      if (records.flat().join("").toLowerCase().includes("v=dkim1")) found.push(selector);
    } catch {
      // selector not present; expected for most
    }
  }
  if (found.length === 0) {
    return [
      {
        module: "domain_exposure",
        severity: "low",
        title: `No DKIM record found among common selectors for ${domain}`,
        description: `Checked common selectors (${COMMON_DKIM_SELECTORS.join(", ")}) and found none. This is inconclusive — you may use a custom selector — but if you have no DKIM at all, outgoing mail is easier to spoof or tamper with in transit.`,
        recommendation: "Confirm with your mail provider whether DKIM signing is enabled, and what selector it uses.",
        links: [{ label: "DKIM guide", url: "https://dkim.org/" }],
        effort: "medium",
        impactScore: 4,
        dedupeKey: `domain_exposure:dkim_missing:${domain}`,
      },
    ];
  }
  return [];
}

async function checkSubdomains(domain: string): Promise<FindingInput[]> {
  const res = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, {
    headers: { "User-Agent": "digital-footprint-checker-local" },
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json().catch(() => [])) as Array<{ name_value: string }>;
  const names = new Set<string>();
  for (const entry of data) {
    for (const line of entry.name_value.split("\n")) {
      const name = line.trim().toLowerCase().replace(/^\*\./, "");
      if (name.endsWith(domain.toLowerCase())) names.add(name);
    }
  }

  const findings: FindingInput[] = [];
  const suspicious = [...names].filter((n) => SUSPICIOUS_SUBDOMAIN_HINTS.some((hint) => n.includes(hint)));
  for (const sub of suspicious) {
    findings.push({
      module: "domain_exposure",
      severity: "medium",
      title: `Possibly forgotten subdomain exposed: ${sub}`,
      description: `Certificate Transparency logs show a certificate was issued for "${sub}", which looks like a dev/staging/admin host. If it's no longer needed, it's an easy target.`,
      evidence: { subdomain: sub },
      recommendation: "Confirm whether this host is still in use; if not, decommission it and revoke its certificate. If it must stay, put it behind authentication/VPN.",
      links: [{ label: "View in crt.sh", url: `https://crt.sh/?q=${encodeURIComponent(sub)}` }],
      effort: "medium",
      impactScore: 6,
      dedupeKey: `domain_exposure:subdomain:${sub}`,
    });
  }
  if (names.size > 0) {
    findings.push({
      module: "domain_exposure",
      severity: "info",
      title: `${names.size} subdomains visible via Certificate Transparency`,
      description: "This is the full set of hostnames found in public CT logs for your domain — useful for spotting anything you forgot about.",
      evidence: { subdomains: [...names].slice(0, 200) },
      recommendation: "Skim the list for anything you no longer recognize or use.",
      links: [{ label: "View in crt.sh", url: `https://crt.sh/?q=%25.${encodeURIComponent(domain)}` }],
      effort: "low",
      impactScore: 1,
      dedupeKey: `domain_exposure:subdomain_summary:${domain}`,
    });
  }
  return findings;
}

function probePort(host: string, port: number, timeoutMs = 900): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (open: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function checkOpenPorts(domain: string): Promise<FindingInput[]> {
  let ip: string;
  try {
    const addrs = await dns.resolve4(domain);
    ip = addrs[0];
  } catch {
    return [];
  }
  const ports = Object.keys(PORT_SEVERITY).map(Number);
  const results = await Promise.all(ports.map(async (p) => ({ port: p, open: await probePort(ip, p) })));
  return results
    .filter((r) => r.open)
    .map(({ port }) => ({
      module: "domain_exposure",
      severity: PORT_SEVERITY[port],
      title: `Port ${port} is open on ${domain}`,
      description: `A TCP connection to ${domain} (${ip}) on port ${port} succeeded. This port is reachable from the internet.`,
      evidence: { ip, port },
      recommendation:
        port === 22 || port === 25 || port === 8080 || port === 8443
          ? "Confirm this is intentionally exposed and kept patched; restrict access with a firewall/allowlist if it doesn't need to be public."
          : `This service is not normally meant to face the public internet. Put it behind a firewall/VPN, or bind it to a private interface.`,
      effort: "medium",
      impactScore: PORT_SEVERITY[port] === "critical" ? 9 : PORT_SEVERITY[port] === "high" ? 7 : 3,
      dedupeKey: `domain_exposure:port:${domain}:${port}`,
    }));
}

export const domainExposureModule: DfcModule = {
  id: "domain_exposure",
  name: "Domain exposure",
  description: "Checks SPF/DKIM/DMARC, subdomains seen in Certificate Transparency logs, and open ports on your own verified host.",
  dataSource: "DNS (SPF/DKIM/DMARC), crt.sh public Certificate Transparency search, and a direct TCP probe of your verified domain's own IP.",
  termsUrl: "https://crt.sh/",
  supportedTypes: ["domain"],

  async run(ctx): Promise<FindingInput[]> {
    const domain = ctx.identifier.value;
    recordAudit({ identifierId: ctx.identifier.id, module: "domain_exposure", action: "scan_started", details: { domain } });
    const [spf, dmarc, dkim, subdomains, ports] = await Promise.all([
      checkSpf(domain),
      checkDmarc(domain),
      checkDkim(domain),
      checkSubdomains(domain),
      checkOpenPorts(domain),
    ]);
    recordAudit({ identifierId: ctx.identifier.id, module: "domain_exposure", action: "scan_completed" });
    return [...spf, ...dmarc, ...dkim, ...subdomains, ...ports];
  },
};
