import { NextRequest, NextResponse } from "next/server";

import { legacyTransactionSequence } from "@/lib/transaction-map";
import { runLegacyFullTransactionJob } from "@/lib/sync-transactions";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    job: "legacy-full-transactions",
    sequence: legacyTransactionSequence,
    notes: "Matches old Form1 button34 sequence for transactional posting.",
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean;
    continueOnError?: boolean;
    usePendingFromLocalDb?: boolean;
    maxRecords?: number;
  };

  const dryRun = body.dryRun ?? true;
  const continueOnError = body.continueOnError ?? true;
  const usePendingFromLocalDb = body.usePendingFromLocalDb ?? true;

  const result = await runLegacyFullTransactionJob({
    dryRun,
    continueOnError,
    usePendingFromLocalDb,
    maxRecords: body.maxRecords,
  });

  return NextResponse.json(
    {
      ok: result.ok,
      job: "legacy-full-transactions",
      result,
    },
    { status: result.ok ? 200 : 207 }
  );
}
