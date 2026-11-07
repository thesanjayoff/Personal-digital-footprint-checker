import { NextRequest, NextResponse } from "next/server";
import { listAccounts, deleteAllAccounts } from "@/lib/accountInventory";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") ?? "me";
  return NextResponse.json({ accounts: listAccounts(owner) });
}

export async function DELETE(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") ?? "me";
  deleteAllAccounts(owner);
  return NextResponse.json({ ok: true });
}
