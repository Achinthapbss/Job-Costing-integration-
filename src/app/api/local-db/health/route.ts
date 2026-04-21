import { NextResponse } from "next/server";

import { checkLocalDbHealth } from "@/lib/local-db";

export const runtime = "nodejs";

export async function GET() {
  const result = await checkLocalDbHealth();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
