import { NextRequest, NextResponse } from "next/server";
import { BROKERS, listOptOuts } from "@/lib/brokerOptOuts";

export async function GET(req: NextRequest) {
  const identifierId = req.nextUrl.searchParams.get("identifierId");
  const optOuts = identifierId ? listOptOuts(identifierId) : [];
  const byBroker = new Map(optOuts.map((o) => [o.broker_id, o]));
  return NextResponse.json({
    brokers: BROKERS.map((b) => ({ ...b, optOut: byBroker.get(b.id) ?? { status: "not_started" } })),
  });
}
