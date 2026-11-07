import type { DfcModule, FindingInput } from "./types";
import { BROKERS, getOptOutStatus } from "../brokerOptOuts";
import { recordAudit } from "../audit";

/**
 * This module never scrapes or queries broker sites automatically — most
 * prohibit automated lookups in their terms, and a name-based search
 * can't be done safely from an email/username/domain/github identifier
 * anyway. Instead it surfaces the maintained broker list as an actionable
 * checklist: a direct search link to check by hand, and an opt-out link
 * with a tracker you update yourself as requests move through their process.
 */
export const dataBrokerModule: DfcModule = {
  id: "data_broker",
  name: "Data broker check",
  description: "Maintained list of people-search/data-broker sites to check manually, with opt-out tracking.",
  dataSource: "Manually curated list of public broker sites (src/data/brokers.json) — no automated scraping.",
  termsUrl: "https://www.privacyrights.org/data-broker-opt-out-list",
  supportedTypes: ["email"],

  async run(ctx): Promise<FindingInput[]> {
    recordAudit({ identifierId: ctx.identifier.id, module: "data_broker", action: "checklist_generated", details: { brokerCount: BROKERS.length } });

    return BROKERS.map((broker) => {
      const optOut = getOptOutStatus(ctx.identifier.id, broker.id);
      const status = optOut?.status ?? "not_started";
      const severity = status === "relisted" ? "high" : status === "confirmed" ? "info" : "medium";

      return {
        module: "data_broker",
        severity,
        title: `Check ${broker.name} for your listing`,
        description:
          status === "confirmed"
            ? `You previously confirmed your opt-out from ${broker.name} was processed.`
            : status === "relisted"
              ? `${broker.name} re-listed you after a prior opt-out — this happens periodically and needs another request.`
              : `${broker.name} is a people-search / data broker site. Search it by name to see if you're listed, and opt out if so.`,
        evidence: { brokerId: broker.id, optOutStatus: status },
        recommendation:
          status === "confirmed"
            ? "Re-check periodically — brokers sometimes re-list people after re-scraping public records."
            : `Search ${broker.name} for yourself, then follow their opt-out process (difficulty: ${broker.difficulty}).`,
        links: [
          { label: `Search ${broker.name}`, url: broker.searchUrl },
          { label: `Opt out of ${broker.name}`, url: broker.optOutUrl },
        ],
        effort: broker.difficulty,
        impactScore: broker.difficulty === "high" ? 7 : 5,
        dedupeKey: `data_broker:${broker.id}`,
      } satisfies FindingInput;
    });
  },
};
