import { NextRequest, NextResponse } from "next/server";

import { getSyncTransaction, getSyncTransactions } from "@/lib/sync-logger";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const transactionId = request.nextUrl.searchParams.get("transactionId");

  if (transactionId) {
    const item = getSyncTransaction(transactionId);

    if (!item) {
      return NextResponse.json({ ok: false, error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Number(limitParam ?? "20");
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 20;

  return NextResponse.json({
    ok: true,
    items: getSyncTransactions(safeLimit),
    count: getSyncTransactions(safeLimit).length,
  });
}
