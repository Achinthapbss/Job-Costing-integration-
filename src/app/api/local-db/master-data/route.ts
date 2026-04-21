import { NextRequest, NextResponse } from "next/server";

import { getMasterDataRawFromDb, isLocalDbEnabled } from "@/lib/local-db";

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

  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing query parameter: key",
      },
      { status: 400 }
    );
  }

  const transactionId = request.nextUrl.searchParams.get("transactionId") ?? undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Number(limitParam ?? "50");
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 50;

  const rows = await getMasterDataRawFromDb({
    key,
    limit: safeLimit,
    transactionId,
  });

  return NextResponse.json({
    ok: true,
    key,
    count: rows.length,
    items: rows,
  });
}
