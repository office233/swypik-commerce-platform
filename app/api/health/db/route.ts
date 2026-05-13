import { NextResponse } from "next/server";
import { checkDb } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkDb();
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}
