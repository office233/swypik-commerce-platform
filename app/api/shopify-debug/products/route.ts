/**
 * DEPRECATED — Shopify debug endpoint disabled
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "deprecated" }, { status: 410 });
}
