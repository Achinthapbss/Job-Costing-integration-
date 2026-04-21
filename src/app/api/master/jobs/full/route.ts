import { NextRequest, NextResponse } from "next/server";

import { legacyFullMasterSequence, runLegacyFullMasterJob } from "@/lib/legacy-master-job";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    job: "full-master",
    sequence: legacyFullMasterSequence,
    notes: "Runs the full master sync sequence: legacy core steps followed by currency steps.",
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean;
    continueOnError?: boolean;
  };

  const dryRun = body.dryRun ?? true;
  const continueOnError = body.continueOnError ?? true;

  const result = await runLegacyFullMasterJob({
    dryRun,
    continueOnError,
  });

  return NextResponse.json(
    {
      ok: result.ok,
      job: "full-master",
      result,
    },
    { status: result.ok ? 200 : 207 }
  );
}