import { NextResponse } from "next/server";
import { getProductDetail } from "@/lib/products/get-product-detail";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const detail = await getProductDetail(id);

    if (!detail) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error: any) {
    logger.error({ err: error }, "[Product Detail API]");
    return NextResponse.json({ error: "A aparut o eroare la incarcarea produsului." }, { status: 500 });
  }
}
