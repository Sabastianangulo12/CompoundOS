import { NextResponse } from "next/server";
import { createOpsRequestContext, getDurationMs } from "@/lib/observability";

export const runtime = "nodejs";

export async function GET() {
  const context = createOpsRequestContext("ops-health");

  return NextResponse.json({
    status: "ok",
    service: "compound-os-web",
    requestId: context.requestId,
    now: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    responseTimeMs: getDurationMs(context)
  });
}
