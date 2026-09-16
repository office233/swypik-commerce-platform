import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const { rows } = await dbQuery(
      `SELECT
         id,
         name,
         cui,
         reg_com,
         phone,
         email,
         address,
         city,
         county,
         notes,
         created_at
       FROM seller_clients
       WHERE seller_id = $1
       ORDER BY name ASC
       LIMIT 100`,
      [sellerId]
    );

    return NextResponse.json({ success: true, clients: rows });
  } catch (error: any) {
    console.error("[Clients API] GET error:", error);
    return NextResponse.json({ success: false, error: "Eroare la preluarea clienților." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const body = await req.json();
    const { name, cui, regCom, phone, email, address, city, county, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "Numele clientului este obligatoriu." }, { status: 400 });
    }

    const { rows } = await dbQuery(
      `INSERT INTO seller_clients (
         seller_id, name, cui, reg_com, phone, email, address, city, county, notes
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       ) RETURNING id, name, created_at`,
      [
        sellerId,
        name.trim(),
        cui?.trim() || null,
        regCom?.trim() || null,
        phone?.trim() || null,
        email?.trim() || null,
        address?.trim() || null,
        city?.trim() || null,
        county?.trim() || null,
        notes?.trim() || null,
      ]
    );

    return NextResponse.json({
      success: true,
      client: rows[0],
      message: "Clientul a fost adăugat cu succes!",
    });
  } catch (error: any) {
    console.error("[Clients API] POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "Eroare la adăugarea clientului." }, { status: 500 });
  }
}
