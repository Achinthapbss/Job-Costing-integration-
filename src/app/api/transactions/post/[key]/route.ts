import { NextRequest, NextResponse } from "next/server";

import { getTransactionConfig } from "@/lib/transaction-map";
import { runTransactionPosting, TransactionExecutionError } from "@/lib/sync-transactions";
import { TransactionKey } from "@/types/transaction";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const config = getTransactionConfig(params.key);

  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid transaction key: ${params.key}`,
        hint: "Use GET /api/transactions/endpoints",
      },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean;
    continueOnError?: boolean;
    usePendingFromLocalDb?: boolean;
    maxRecords?: number;
    payloads?: unknown[];
  };

  try {
    const result = await runTransactionPosting({
      key: params.key as TransactionKey,
      dryRun: body.dryRun,
      continueOnError: body.continueOnError,
      usePendingFromLocalDb: body.usePendingFromLocalDb,
      maxRecords: body.maxRecords,
      payloads: body.payloads,
    });

    return NextResponse.json({
      ok: result.failedCount === 0,
      key: config.key,
      label: config.label,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        key: config.key,
        transactionId: error instanceof TransactionExecutionError ? error.transactionId : undefined,
        error: error instanceof Error ? error.message : "Unknown transaction post error",
      },
      { status: 500 }
    );
  }
}
