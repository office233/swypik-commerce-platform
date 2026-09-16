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
         series,
         number,
         invoice_number,
         client_name,
         client_cui,
         subtotal_cents,
         vat_cents,
         total_cents,
         status,
         efactura_status,
         created_at
       FROM seller_invoices
       WHERE seller_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [sellerId]
    );

    return NextResponse.json({ success: true, invoices: rows });
  } catch (error: any) {
    console.error("[Invoices API] GET error:", error);
    return NextResponse.json({ success: false, error: "Eroare la preluarea facturilor." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const body = await req.json();
    const {
      clientName,
      clientCui,
      clientAddress,
      items,
      series = "FACT",
      status = "paid",
    } = body;

    if (!clientName?.trim()) {
      return NextResponse.json({ success: false, error: "Numele clientului este obligatoriu." }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "Factura trebuie să aibă cel puțin un produs." }, { status: 400 });
    }

    // Get next invoice number for this seller & series
    const { rows: maxRows } = await dbQuery<{ max_num: number | null }>(
      `SELECT COALESCE(MAX(number), 0) as max_num
       FROM seller_invoices
       WHERE seller_id = $1 AND series = $2`,
      [sellerId, series.trim()]
    );

    const nextNumber = (maxRows[0]?.max_num ?? 0) + 1;
    const formattedNumber = String(nextNumber).padStart(4, "0");
    const invoiceNumber = `${series.trim()}-${formattedNumber}`;

    // Calculate totals
    let totalCents = 0;
    for (const item of items) {
      const priceCents = Math.round((Number(item.price) || 0) * 100);
      const qty = Number(item.quantity) || 1;
      totalCents += priceCents * qty;
    }

    const vatRate = body.vatRate !== undefined ? Number(body.vatRate) : 21;
    const subtotalCents = vatRate > 0 ? Math.round(totalCents / (1 + vatRate / 100)) : totalCents;
    const vatCents = totalCents - subtotalCents;

    const { rows } = await dbQuery(
      `INSERT INTO seller_invoices (
         seller_id, series, number, invoice_number,
         client_name, client_cui, client_address,
         items, subtotal_cents, vat_cents, total_cents,
         status, efactura_status
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7,
         $8::jsonb, $9, $10, $11,
         $12, 'pending'
       ) RETURNING id, invoice_number, created_at`,
      [
        sellerId,
        series.trim(),
        nextNumber,
        invoiceNumber,
        clientName.trim(),
        clientCui?.trim() || null,
        clientAddress?.trim() || null,
        JSON.stringify(items),
        subtotalCents,
        vatCents,
        totalCents,
        status,
      ]
    );

    return NextResponse.json({
      success: true,
      invoice: rows[0],
      message: `Factura ${invoiceNumber} a fost emisă cu succes!`,
    });
  } catch (error: any) {
    console.error("[Invoices API] POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "Eroare la emiterea facturii." }, { status: 500 });
  }
}
