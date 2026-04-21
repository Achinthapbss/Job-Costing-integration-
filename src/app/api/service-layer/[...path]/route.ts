import { NextRequest, NextResponse } from "next/server";

import { requestSapServiceLayer } from "@/lib/sap-service-layer";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function proxyRequest(
  request: NextRequest,
  context: RouteContext,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
) {
  try {
    const params = await context.params;
    const path = params.path.join("/");
    const query = request.nextUrl.search;
    const serviceLayerPath = `/${path}${query}`;

    const bodyText = method === "GET" || method === "DELETE" ? undefined : await request.text();

    const sapResponse = await requestSapServiceLayer(serviceLayerPath, {
      method,
      body: bodyText,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const responseText = await sapResponse.text();

    return new NextResponse(responseText, {
      status: sapResponse.status,
      headers: {
        "Content-Type": sapResponse.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context, "GET");
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context, "POST");
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context, "PUT");
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context, "PATCH");
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context, "DELETE");
}
