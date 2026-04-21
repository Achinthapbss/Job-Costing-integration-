import { NextRequest, NextResponse } from "next/server";

import { legacyCoreSequence, runLegacyCoreMasterJob } from "@/lib/legacy-master-job";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    job: "legacy-core",
    sequence: legacyCoreSequence,
    notes: "Matches old Form1 button35 flow: inventory, warehouse, item warehouses, UOM group.",
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean;
    continueOnError?: boolean;
  };

  const dryRun = body.dryRun ?? true;
  const continueOnError = body.continueOnError ?? true;

  const result = await runLegacyCoreMasterJob({
    dryRun,
    continueOnError,
  });

  return NextResponse.json(
    {
      ok: result.ok,
      job: "legacy-core",
      result,
    },
    { status: result.ok ? 200 : 207 }
  );
}
