import { NextRequest, NextResponse } from "next/server";

import { legacyCurrencySequence, runLegacyCurrencyMasterJob } from "@/lib/legacy-master-job";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    job: "currency",
    sequence: legacyCurrencySequence,
    notes: "Matches old Form1 button2 flow: currency, currency rates, customer currencies.",
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean;
    continueOnError?: boolean;
  };

  const dryRun = body.dryRun ?? true;
  const continueOnError = body.continueOnError ?? true;

  const result = await runLegacyCurrencyMasterJob({
    dryRun,
    continueOnError,
  });

  return NextResponse.json(
    {
      ok: result.ok,
      job: "currency",
      result,
    },
    { status: result.ok ? 200 : 207 }
  );
}