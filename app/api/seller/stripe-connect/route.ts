import { NextResponse } from "next/server";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { getStripe } from "@/lib/stripe/checkout";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isEnabled("stripeConnect")) return frozenResponse("stripeConnect");
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const sellerRes = await dbQuery(
      `SELECT email, name, stripe_account_id, metadata FROM sellers WHERE id = $1`,
      [sellerId],
    );

    if (sellerRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Seller not found" }, { status: 404 });
    }

    const seller = sellerRes.rows[0];
    const sellerMetadata = seller.metadata || {};
    const stripe = getStripe();
    let stripeAccountId = seller.stripe_account_id || sellerMetadata.stripe_account_id;

    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: seller.email,
        business_type: "company",
        metadata: {
          seller_id: sellerId,
          seller_name: seller.name || "",
        },
      });
      stripeAccountId = account.id;

      await dbQuery(
        `UPDATE sellers
         SET stripe_account_id = $1,
             metadata = metadata || $2::jsonb,
             updated_at = now()
         WHERE id = $3`,
        [stripeAccountId, JSON.stringify({ stripe_account_id: stripeAccountId }), sellerId],
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${appUrl}/seller`,
      return_url: `${appUrl}/seller`,
      type: "account_onboarding",
    });

    return NextResponse.json({ success: true, url: accountLink.url });
  } catch (error: any) {
    console.error("[Stripe Connect API] POST Error:", error);
    return NextResponse.json({ success: false, error: "Eroare la conectarea Stripe." }, { status: 500 });
  }
}
