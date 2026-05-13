import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const locale = url.searchParams.get("locale") || "ro";
    const { getCategoryHierarchy } = await import("@/lib/db/product-queries");
    const hierarchy = await getCategoryHierarchy(locale);
    return NextResponse.json({ hierarchy });
  } catch (e: any) {
    console.error("[Categories API]", e);
    return NextResponse.json({ error: "err", hierarchy: [] }, { status: 500 });
  }
}
