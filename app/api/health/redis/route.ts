import { NextResponse } from "next/server";
import { checkRedis } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkRedis();
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}
