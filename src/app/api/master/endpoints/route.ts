import { NextResponse } from "next/server";

import { listMasterDataConfigs } from "@/lib/master-data-map";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    items: listMasterDataConfigs(),
    count: listMasterDataConfigs().length,
  });
}
