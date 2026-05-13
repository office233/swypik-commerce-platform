import { NextResponse } from "next/server";
import { checkQueue } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkQueue();
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}
