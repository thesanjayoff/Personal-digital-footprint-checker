import type { DfcModule, FindingInput } from "./types";
import { fetchBreaches, classifyBreachSeverity, isHibpConfigured } from "../hibp";
import { recordAudit } from "../audit";

export const breachModule: DfcModule = {
  id: "breach",
  name: "Breach check",
  description: "Checks your email against known data breaches via the official Have I Been Pwned API.",
  dataSource: "Have I Been Pwned (haveibeenpwned.com) — official breach API",
  termsUrl: "https://haveibeenpwned.com/API/v3#AcceptableUse",
  supportedTypes: ["email"],

  async run(ctx): Promise<FindingInput[]> {
    recordAudit({ identifierId: ctx.identifier.id, module: "breach", action: "lookup_started" });

    if (!isHibpConfigured()) {
      return [
        {
          module: "breach",
          severity: "info",
          title: "Breach check is not configured",
          description:
            "Set HIBP_API_KEY in your environment to enable breach lookups via the official Have I Been Pwned API (a paid API key is required by HIBP).",
          recommendation: "Get a key at https://haveibeenpwned.com/API/Key and set HIBP_API_KEY, then re-run.",
          links: [{ label: "Get an HIBP API key", url: "https://haveibeenpwned.com/API/Key" }],
          dedupeKey: "breach:not-configured",
        },
      ];
    }

    const breaches = await fetchBreaches(ctx.identifier.value);
    recordAudit({
      identifierId: ctx.identifier.id,
      module: "breach",
      action: "lookup_completed",
      details: { breachCount: breaches.length },
    });

    return breaches.map((b) => ({
      module: "breach",
      severity: classifyBreachSeverity(b),
      title: `Exposed in the "${b.Title}" breach`,
      description: `${b.Description.replace(/<[^>]+>/g, "")} Data exposed: ${b.DataClasses.join(", ")}.`,
      evidence: { breachName: b.Name, breachDate: b.BreachDate, dataClasses: b.DataClasses },
      recommendation: b.DataClasses.map((c) => c.toLowerCase()).includes("passwords")
        ? `Change your password for ${b.Title} if you haven't already, enable multi-factor authentication, and change this password anywhere else you reused it.`
        : `Review what was exposed in the ${b.Title} breach and enable multi-factor authentication on that account.`,
      links: b.Domain
        ? [
            { label: `Visit ${b.Title}`, url: `https://${b.Domain}` },
            { label: "Breach details on HIBP", url: "https://haveibeenpwned.com/" },
          ]
        : [{ label: "Breach details on HIBP", url: "https://haveibeenpwned.com/" }],
      effort: "low",
      impactScore: b.DataClasses.map((c) => c.toLowerCase()).includes("passwords") ? 8 : 5,
      dedupeKey: `breach:${b.Name}`,
    }));
  },
};
