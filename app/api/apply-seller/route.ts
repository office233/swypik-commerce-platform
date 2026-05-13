import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { companyName, cui, email, phone, productType } = data;

    if (!companyName || !cui || !email || !phone || !productType) {
      return NextResponse.json(
        { success: false, error: "Toate campurile sunt obligatorii." },
        { status: 400 },
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
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
    console.error("[Apply Seller API] Error:", error);
    return NextResponse.json(
      { success: false, error: "A aparut o eroare la salvarea aplicatiei." },
      { status: 500 },
    );
  }
}
