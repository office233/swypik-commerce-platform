import { NextResponse } from "next/server";
import { checkR2 } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkR2();
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}
