import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getProductDetail } from "@/lib/products/get-product-detail";
import { convert } from "@/lib/fx/convert";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const url = new URL(req.url);
    const localeParam = url.searchParams.get("locale");
    const localeCookie = cookieStore.get("swypik_locale")?.value;
    const locale = (localeParam || localeCookie || "ro").toLowerCase();

    const detail = await getProductDetail(id, locale);

    if (!detail) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const targetCurrency = (cookieStore.get("swypik_currency")?.value || "RON").toUpperCase();

    const d: any = detail;
    const prod = d.product || d;
    const priceRon = Number(prod.price ?? 0);
    const priceRonCents = Math.round(priceRon * 100);
    let converted = priceRon;
    if (targetCurrency !== "RON" && priceRonCents > 0) {
      try {
        const c = await convert(priceRonCents, "RON", targetCurrency);
        if (isFinite(c) && c > 0) converted = c / 100;
      } catch (e) {
        logger.warn({ err: e }, "[Product Detail API] fx convert failed");
      }
    }

    if (d.product) {
      return NextResponse.json({
        ...d,
        product: { ...prod, price: converted, priceRon },
        currency: targetCurrency,
      });
    }
    return NextResponse.json({
      ...d,
      currency: targetCurrency,
      price: converted,
      priceRon,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Product Detail API]");
    return NextResponse.json({ error: "A aparut o eroare la incarcarea produsului." }, { status: 500 });
  }
}
