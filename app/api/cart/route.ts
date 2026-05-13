/**
 * DEPRECATED — Old cart API replaced by Stripe Checkout
 * Kept as 410 Gone for backwards compatibility
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { success: false, error: "Checkout-ul a fost migrat. Reîncarcă pagina." },
    { status: 410 }
  );
}
