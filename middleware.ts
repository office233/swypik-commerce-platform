import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Căi care necesită doar autentificare (NU și onboarding).
const ONBOARDING_PATH = "/onboarding";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // În "Addictive MVP", un utilizator este și creator. Sesiunea e unificată.
  const hasCustomerSession = Boolean(request.cookies.get("swypik_session")?.value);
  const hasCreatorSession = Boolean(request.cookies.get("creator_session")?.value);
  const isAuthed = hasCustomerSession || hasCreatorSession;

  // Permite accesul la /onboarding chiar dacă nu e încă autentificat
  // (utilizatorul ajunge aici imediat după verify_otp).
  if (pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`)) {
    return NextResponse.next();
  }

  // Dacă nu are niciun fel de sesiune, trimite la Login Wall
  if (!isAuthed) {
    const loginUrl = new URL("/account", request.url);
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Gate de onboarding: dacă nu are cookie-ul `swypik_onboarded`, trimite la /onboarding.
  const isOnboarded = Boolean(request.cookies.get("swypik_onboarded")?.value);
  if (!isOnboarded) {
    const onboardingUrl = new URL(ONBOARDING_PATH, request.url);
    onboardingUrl.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(onboardingUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/explore/:path*",
    "/collections/:path*",
    "/orders/:path*",
    "/creator/:path*", // Creator e accesibil cu swypik_session acum!
    "/onboarding",
  ],
};
