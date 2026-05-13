import { dbQuery } from "@/lib/db";
import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "seller_session";

function hashToken(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function getSellerSessionId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { rows } = await dbQuery(
      `SELECT seller_id FROM seller_sessions WHERE token = $1 AND expires_at > now()`,
      [hashToken(token)]
    );

    if (rows.length === 0) return null;
    return rows[0].seller_id;
  } catch (error) {
    console.error("[Seller Auth] Error reading session:", error);
    return null;
  }
}
