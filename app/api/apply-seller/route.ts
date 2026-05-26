import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { SellerApplicationSchema, parseBody } from "@/lib/validation/schemas";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const rl = await rateLimit("applySeller", getClientIP(req));
    if (!rl.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

    const rawBody = await req.json().catch(() => null);
    const parsed = parseBody(SellerApplicationSchema, rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { companyName, cui, email, phone, productType } = parsed.data;

    const normalizedEmail = email.toLowerCase();
    const businessDetails = {
      cui,
      phone,
      product_type: productType,
    };

    await dbQuery(
      `
      INSERT INTO sellers (name, cui, email, phone, product_type, status, business_details)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        cui = EXCLUDED.cui,
        phone = EXCLUDED.phone,
        product_type = EXCLUDED.product_type,
        status = 'pending',
        business_details = EXCLUDED.business_details,
        updated_at = now()
      `,
      [companyName, cui, normalizedEmail, phone, productType, JSON.stringify(businessDetails)],
    );

    return NextResponse.json({
      success: true,
      message: "Aplicatia ta a fost primita. O vom analiza in 24h.",
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Apply Seller API] Error:");
    return NextResponse.json(
      { success: false, error: "A aparut o eroare la salvarea aplicatiei." },
      { status: 500 },
    );
  }
}
