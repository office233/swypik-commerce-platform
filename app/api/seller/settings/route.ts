import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { parseBody, SellerSettingsUpdateSchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("sellerSettings", sellerId);
    if (!rl.success) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const parsed = parseBody(SellerSettingsUpdateSchema, await req.json().catch(() => null));
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { name, bio, avatarUrl, cui, phone, iban, invoiceSeries } = parsed.data;

    // Validate username format (only lowercase letters, numbers, underscores, dashes)
    const cleanUsername = parsed.data.username
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");

    if (cleanUsername.length < 3) {
      return NextResponse.json({ error: "Handle-ul magazinului (@username) trebuie să aibă minim 3 caractere." }, { status: 400 });
    }

    // Get current seller to find linked user_id
    const { rows: sellerRows } = await dbQuery<{ user_id: string | null; business_details: Record<string, any> | null }>(
      "SELECT user_id, business_details FROM sellers WHERE id = $1",
      [sellerId]
    );

    if (sellerRows.length === 0) {
      return NextResponse.json({ error: "Comerciantul nu a fost găsit." }, { status: 404 });
    }

    const currentSeller = sellerRows[0];
    const userId = currentSeller.user_id;

    // Check if username is already taken by another user
    if (userId) {
      const { rows: existingUsers } = await dbQuery(
        "SELECT id FROM users WHERE lower(username) = $1 AND id != $2 LIMIT 1",
        [cleanUsername, userId]
      );
      if (existingUsers.length > 0) {
        return NextResponse.json({ error: `Handle-ul @${cleanUsername} este deja ocupat de alt utilizator.` }, { status: 409 });
      }
    }

    // Merge business details
    const updatedBusinessDetails = {
      ...(currentSeller.business_details || {}),
      description: bio || "",
      iban: iban || "",
      invoiceSeries: invoiceSeries || "FACT"
    };

    // Update sellers table
    await dbQuery(
      `UPDATE sellers
       SET name = $1, cui = $2, phone = $3, business_details = $4, updated_at = NOW()
       WHERE id = $5`,
      [name?.trim() || "Magazin", cui?.trim() || null, phone?.trim() || null, updatedBusinessDetails, sellerId]
    );

    // Update users table if linked
    if (userId) {
      await dbQuery(
        `UPDATE users
         SET username = $1, display_name = $2, bio = $3, avatar_url = COALESCE($4, avatar_url), updated_at = NOW()
         WHERE id = $5`,
        [cleanUsername, name?.trim() || "Magazin", bio?.trim() || "", avatarUrl?.trim() || null, userId]
      );
    }

    return NextResponse.json({
      ok: true,
      username: cleanUsername,
      profileUrl: `/u/${cleanUsername}`,
      message: "Setările magazinului au fost salvate cu succes!"
    });
  } catch (error) {
    logger.error({ err: error }, "[Seller Settings API] Error");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
