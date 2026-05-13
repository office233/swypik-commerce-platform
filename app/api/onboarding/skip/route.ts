import { NextResponse } from "next/server";

/**
 * POST /api/onboarding/skip
 *
 * Marchează utilizatorul ca având onboarding-ul finalizat fără a salva interese.
 * Folosit de butonul "Sari peste" pe pagina /onboarding.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set("swypik_onboarded", "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 730, // 2 years
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });

  return response;
}
