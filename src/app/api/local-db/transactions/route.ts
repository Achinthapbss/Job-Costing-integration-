import { NextRequest, NextResponse } from "next/server";

import { getRecentSyncTransactionsFromDb, isLocalDbEnabled } from "@/lib/local-db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isLocalDbEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "LOCAL_DB_ENABLED is false",
      },
      { status: 400 }
    );
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Number(limitParam ?? "20");
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 20;

  const items = await getRecentSyncTransactionsFromDb(safeLimit);

  return NextResponse.json({
    ok: true,
    items,
    count: items.length,
  });
}
