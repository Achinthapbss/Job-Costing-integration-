import { NextResponse } from "next/server";

import { listTransactionConfigs, legacyTransactionSequence } from "@/lib/transaction-map";

export const runtime = "nodejs";

export async function GET() {
  const items = listTransactionConfigs();
  return NextResponse.json({
    ok: true,
    items,
    count: items.length,
    legacySequence: legacyTransactionSequence,
  });
}
