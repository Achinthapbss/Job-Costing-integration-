import { NextRequest, NextResponse } from "next/server";

import { getMasterDataConfig } from "@/lib/master-data-map";
import { SyncExecutionError, syncMasterData } from "@/lib/sync-master-data";
import { MasterDataKey } from "@/types/master-data";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const config = getMasterDataConfig(params.key);

  if (!config) {
    return NextResponse.json(
      {
        error: `Invalid key: ${params.key}`,
        hint: "Use GET /api/master/endpoints to list valid keys.",
      },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    query?: string;
    dryRun?: boolean;
    targetOverridePath?: string;
  };

  try {
    const result = await syncMasterData({
      key: params.key as MasterDataKey,
      query: body.query,
      dryRun: body.dryRun,
      targetOverridePath: body.targetOverridePath,
    });

    return NextResponse.json({
      ok: true,
      key: config.key,
      label: config.label,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        key: config.key,
        transactionId: error instanceof SyncExecutionError ? error.transactionId : undefined,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
