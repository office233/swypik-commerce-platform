import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ONBOARDING_PATH = "/onboarding";

const SHOPPER_COOKIE = "swypik_session";
const LEGACY_CREATOR_COOKIE = "creator_session";
const SELLER_COOKIE = "seller_session";
const ADMIN_COOKIE = "admin_token";
const ADMIN_SESSION_COOKIE = "admin_session";
const ONBOARDED_COOKIE = "swypik_onboarded";

// ---------- CSRF / Origin guard ----------

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Paths that legitimately receive cross-origin POSTs (no auth cookie semantics).
const CSRF_EXEMPT_PREFIXES = [
  "/api/webhooks/",
  "/api/cron/",
  "/api/health",
  "/api/internal/", // server-to-server (if any)
];

function allowedOrigins(req: NextRequest): string[] {
  const out = new Set<string>();
  const envSite = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envSite) out.add(envSite.replace(/\/$/, ""));
  // Always trust our canonical hosts.
  out.add("https://swypik.com");
  out.add("https://www.swypik.com");
  // Same-origin as the request itself (covers preview/staging hosts).
  try {
    out.add(`${req.nextUrl.protocol}//${req.nextUrl.host}`);
  } catch {
    /* noop */
  }
  return Array.from(out);
}

function hostFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function csrfBlocked(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method)) return false;
  const { pathname } = req.nextUrl;

  // Only enforce when an auth cookie is present — otherwise the request can't
  // do harm in someone else's name via CSRF.
  const hasAuthCookie =
    Boolean(req.cookies.get(SHOPPER_COOKIE)?.value) ||
    Boolean(req.cookies.get(SELLER_COOKIE)?.value) ||
    Boolean(req.cookies.get(ADMIN_COOKIE)?.value) ||
    Boolean(req.cookies.get(ADMIN_SESSION_COOKIE)?.value) ||
    Boolean(req.cookies.get(LEGACY_CREATOR_COOKIE)?.value);
  if (!hasAuthCookie) return false;

  if (CSRF_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return false;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const candidate = origin || hostFromUrl(referer);
  if (!candidate) return true; // no Origin and no Referer → block

  const allowed = allowedOrigins(req);
  return !allowed.includes(candidate.replace(/\/$/, ""));
}

function redirectTo(req: NextRequest, target: string, withRedirect = true) {
  const url = new URL(target, req.url);
  if (withRedirect) {
    url.searchParams.set("redirect", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  }
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  // CSRF / Origin check runs first for any mutating request that carries auth cookies.
  if (csrfBlocked(request)) {
    return new NextResponse(JSON.stringify({ error: "csrf" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const { pathname } = request.nextUrl;

  // For /api/* (and any other non-gated path) we only enforce CSRF — no redirects.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

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

  // NOTE: onboarding is enforced by the in-app <OnboardingGate /> modal
  // (server component reading users.onboarding_completed_at). We intentionally
  // do NOT redirect here on missing `swypik_onboarded` cookie because:
  //   1) OAuth (Google/Apple) login never sets this cookie → every gated nav
  //      would bounce to /onboarding, looking like the user got logged out.
  //   2) The cookie can drift from DB truth (completed onboarding in another
  //      browser/device). The DB is the source of truth; the modal handles it.

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/collections/:path*",
    "/orders/:path*",
    "/checkout/:path*",
    "/creator/:path*",
    "/onboarding",
    "/admin/:path*",
    "/seller/:path*",
    // CSRF guard scope:
    "/api/:path*",
  ],
};
