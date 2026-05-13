import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ONBOARDING_PATH = "/onboarding";

const SHOPPER_COOKIE = "swypik_session";
const LEGACY_CREATOR_COOKIE = "creator_session";
const SELLER_COOKIE = "seller_session";
const ADMIN_COOKIE = "admin_token";
const ONBOARDED_COOKIE = "swypik_onboarded";

function redirectTo(req: NextRequest, target: string, withRedirect = true) {
  const url = new URL(target, req.url);
  if (withRedirect) {
    url.searchParams.set("redirect", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  }
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookies = request.cookies;

  const hasShopper = Boolean(cookies.get(SHOPPER_COOKIE)?.value);
  const hasLegacyCreator = Boolean(cookies.get(LEGACY_CREATOR_COOKIE)?.value);
  const hasSeller = Boolean(cookies.get(SELLER_COOKIE)?.value);
  const hasAdmin = Boolean(cookies.get(ADMIN_COOKIE)?.value);
  const isAuthed = hasShopper || hasLegacyCreator;

  // /admin login page itself is public
  if (pathname === "/admin" || pathname === "/admin/") {
    return NextResponse.next();
  }

  // /admin/* — only admin cookie
  if (pathname.startsWith("/admin/")) {
    if (!hasAdmin) {
      return redirectTo(request, "/admin", false);
    }
    return NextResponse.next();
  }

  // /seller and /seller/login are public (marketing + login pages)
  if (pathname === "/seller" || pathname === "/seller/" || pathname === "/seller/login" || pathname.startsWith("/seller/login/")) {
    return NextResponse.next();
  }

  // /seller/* — only seller cookie
  if (pathname.startsWith("/seller/")) {
    if (!hasSeller) {
      return redirectTo(request, "/seller/login", false);
    }
    return NextResponse.next();
  }

  // Onboarding accessible without onboarded cookie
  if (pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`)) {
    return NextResponse.next();
  }

  // Default: shopper/creator gating for matched paths
  if (!isAuthed) {
    return redirectTo(request, "/account");
  }

  const isOnboarded = Boolean(cookies.get(ONBOARDED_COOKIE)?.value);
  if (!isOnboarded) {
    return redirectTo(request, ONBOARDING_PATH);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/explore/:path*",
    "/collections/:path*",
    "/orders/:path*",
    "/creator/:path*",
    "/onboarding",
    "/admin/:path*",
    "/seller/:path*",
  ],
};
