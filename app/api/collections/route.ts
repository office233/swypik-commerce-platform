/** @deprecated Legacy collections endpoint — No longer used. Categories now served from /api/products?hierarchy=true */
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ status: "deprecated", message: "Use /api/products?hierarchy=true instead." }, { status: 410 });
}
