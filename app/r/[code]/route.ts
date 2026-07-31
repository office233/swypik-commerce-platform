/**
 * GET /r/[code] — link scurt de invitație (QR-ul șoferilor + referral general).
 * Setează cookie 30 de zile și redirecționează la înregistrare cu codul
 * precompletat. Claim-ul efectiv se face la signup (sau post-signup).
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z0-9]{3,16}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = String(code ?? "").trim().toUpperCase();
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com";
  if (!CODE_RE.test(clean)) {
    return NextResponse.redirect(new URL("/", base), 302);
  }
  const res = NextResponse.redirect(new URL(`/auth?mode=register&ref=${encodeURIComponent(clean)}`, base), 302);
  res.cookies.set("swypik_ref", clean, {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
  });
  return res;
}
