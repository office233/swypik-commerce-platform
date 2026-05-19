/* eslint-disable react/no-unescaped-entities */
/**
 * Cross-subdomain auth handoff consumer (lives at https://18.swypik.com/welcome).
 *
 * Flow:
 *   1) User on swypik.com clicks "Open After Dark" in /account
 *      → POST /api/auth/adult-handoff (on swypik.com)
 *      → 200 { url: "https://18.swypik.com/welcome?h=<token>" }
 *      → browser navigates to that URL.
 *   2) This page runs on 18.swypik.com:
 *      - Reads ?h=<token>, atomically consumes it via Redis (GETDEL).
 *      - Issues a NEW session row in public.user_sessions for the same user.
 *      - Sets the swypik_session cookie HOST-ONLY on 18.swypik.com.
 *      - Redirects to /adult (or to ?next=).
 *   3) If no token / invalid token, shows a "click here to sign in" CTA.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { consumeHandoffToken } from "@/lib/adult/handoff";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "swypik_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ALLOWED_NEXT_PREFIX = "/adult";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function safeNext(raw: string | undefined | string[]): string {
  if (!raw) return "/adult";
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (typeof val !== "string") return "/adult";
  if (!val.startsWith(ALLOWED_NEXT_PREFIX)) return "/adult";
  return val;
}

async function exchangeToken(token: string, next: string): Promise<void> {
  const userId = await consumeHandoffToken(token);
  if (!userId) return;

  // Mint a fresh session row in public.user_sessions (same table the
  // marketplace uses; same shape as /api/auth verify_otp creates).
  const sessionToken = crypto.randomBytes(48).toString("hex");
  const tokenHash = sha256(sessionToken);

  try {
    await dbQuery(
      `INSERT INTO user_sessions (user_id, session_token_hash, expires_at, metadata, created_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval, $4::jsonb, now())`,
      [
        userId,
        tokenHash,
        String(SESSION_MAX_AGE_SECONDS),
        JSON.stringify({ type: "session", source: "adult_handoff" }),
      ],
    );
  } catch (err) {
    console.error("[adult-handoff] session insert failed:", (err as Error).message);
    return;
  }

  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    // Host-only on 18.swypik.com: NO domain attribute.
  });

  redirect(next);
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  if (params.h && /^[a-f0-9]{64}$/i.test(params.h)) {
    // Will redirect on success; falls through on failure to render the manual login CTA.
    await exchangeToken(params.h, next);
  }

  return (
    <main style={{
      minHeight: "100vh", background: "#0a0a0b", color: "#ededed",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    }}>
      <div style={{
        maxWidth: 480, background: "#111114", border: "1px solid #1f1f23",
        borderRadius: 14, padding: 28, textAlign: "center",
      }}>
        <h1 style={{ fontSize: 28, margin: "0 0 8px", color: "#f43f5e" }}>Swypik After Dark</h1>
        <p style={{ color: "#a1a1aa", margin: "0 0 22px" }}>
          18+ only. Sign in to your Swypik account, then come back.
        </p>
        <a
          href={`https://swypik.com/account?next=${encodeURIComponent("/settings#adult")}`}
          style={{
            display: "inline-block", background: "#f43f5e", color: "#fff",
            textDecoration: "none", padding: "12px 22px", borderRadius: 999,
            fontWeight: 600, fontSize: 14,
          }}
        >
          Sign in on swypik.com
        </a>
        <p style={{ color: "#6b7280", margin: "20px 0 0", fontSize: 12 }}>
          Already signed in?{" "}
          <Link href="/adult" style={{ color: "#fda4af" }}>
            Continue to After Dark
          </Link>
        </p>
      </div>
    </main>
  );
}
