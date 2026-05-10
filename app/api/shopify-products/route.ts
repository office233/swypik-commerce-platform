/** @deprecated Legacy Shopify products endpoint — No longer used. Data is in NeonDB. */
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ status: "deprecated", message: "Migrated to NeonDB. This endpoint is disabled." }, { status: 410 });
}
