import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import crypto from "crypto";
import { sendMagicLink } from "@/lib/email/service";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "seller_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const isProd = process.env.NODE_ENV === "production";
const SECURE_FLAG = isProd ? "; Secure" : "";

function hashToken(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, email, token } = body;

    if (action === "login") {
      if (!email || !String(email).includes("@")) {
        return NextResponse.json({ success: false, error: "Email invalid." }, { status: 400 });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const { rows } = await dbQuery(`SELECT id, status FROM sellers WHERE email = $1`, [normalizedEmail]);

      if (rows.length === 0) {
        return NextResponse.json({ success: false, error: "Cont inexistent. Te rugam sa aplici prin portalul B2B." }, { status: 403 });
      }

      if (rows[0].status !== "active" && rows[0].status !== "approved") {
        return NextResponse.json({ success: false, error: "Contul tau nu este aprobat inca. Vei fi contactat in curand." }, { status: 403 });
      }

      const sellerId = rows[0].id;
      const otp = crypto.randomInt(100000, 1000000).toString();
      const otpToken = `otp:${otp}`;
      const otpHash = hashToken(otpToken);

      await dbQuery(
        `INSERT INTO seller_sessions (seller_id, token, expires_at, created_at)
         VALUES ($1, $2, now() + interval '15 minutes', now())`,
        [sellerId, otpHash],
      );

      if (!isProd) {
        console.log(`[SELLER OTP] Code for ${normalizedEmail}: ${otp}`);
      }
      const sent = await sendMagicLink(normalizedEmail, otp);
      if (!sent) {
        return NextResponse.json(
          { success: false, error: "Nu am putut trimite codul de autentificare." },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, requiresVerification: true });
    }

    if (action === "verify_otp") {
      if (!email || !token) {
        return NextResponse.json({ success: false, error: "Email si codul sunt obligatorii." }, { status: 400 });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const otpToken = `otp:${String(token).trim()}`;
      const otpHash = hashToken(otpToken);

      const { rows } = await dbQuery(
        `SELECT ss.seller_id, ss.token
         FROM seller_sessions ss
         JOIN sellers s ON s.id = ss.seller_id
          WHERE s.email = $1 AND ss.token = $2 AND ss.expires_at > now()`,
        [normalizedEmail, otpHash],
      );

      if (rows.length === 0) {
        return NextResponse.json({ success: false, error: "Cod invalid sau expirat." }, { status: 400 });
      }

      const sellerId = rows[0].seller_id;
      await dbQuery(`DELETE FROM seller_sessions WHERE token = $1`, [otpHash]);

      const sessionToken = crypto.randomBytes(32).toString("hex");
      const sessionHash = hashToken(sessionToken);
      await dbQuery(
        `INSERT INTO seller_sessions (seller_id, token, expires_at, created_at)
         VALUES ($1, $2, now() + interval '30 days', now())`,
        [sellerId, sessionHash],
      );

      const response = NextResponse.json({ success: true, sellerId });
      response.headers.set(
        "Set-Cookie",
        `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}${SECURE_FLAG}`,
      );
      return response;
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("[Seller Auth API] Error:", error);
    return NextResponse.json({ success: false, error: "Eroare interna la autentificare." }, { status: 500 });
  }
}
