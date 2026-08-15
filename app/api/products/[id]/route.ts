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
    // 2026-08-15 (CRITIC): dacă rata lipsește, `convert()` întoarce NaN și
    // `converted` rămânea suma în RON — dar răspunsul o eticheta drept
    // EUR/USD. Un produs de 500 RON apărea ca „500 EUR" (~5x preț real),
    // încălcare directă de conformitate (preț afișat ≠ preț real).
    // Acum: dacă nu putem converti, raportăm ONEST moneda RON.
    let effectiveCurrency = targetCurrency;
    if (targetCurrency !== "RON" && priceRonCents > 0) {
      let ok = false;
      try {
        const c = await convert(priceRonCents, "RON", targetCurrency);
        if (isFinite(c) && c > 0) {
          converted = c / 100;
          ok = true;
        }
      } catch (e) {
        logger.warn({ err: e }, "[Product Detail API] fx convert failed");
      }
      if (!ok) {
        logger.warn(
          { targetCurrency, productId: id },
          "[Product Detail API] rata FX indisponibila — servim pretul in RON",
        );
        effectiveCurrency = "RON";
        converted = priceRon;
      }
    }

    if (d.product) {
      return NextResponse.json({
        ...d,
        product: { ...prod, price: converted, priceRon },
        currency: effectiveCurrency,
      });
    }
    return NextResponse.json({
      ...d,
      currency: effectiveCurrency,
      price: converted,
      priceRon,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Product Detail API]");
    return NextResponse.json({ error: "A aparut o eroare la incarcarea produsului." }, { status: 500 });
  }
}
