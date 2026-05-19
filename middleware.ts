import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ONBOARDING_PATH = "/onboarding";

const SHOPPER_COOKIE = "swypik_session";
const LEGACY_CREATOR_COOKIE = "creator_session";
const SELLER_COOKIE = "seller_session";
const ADMIN_COOKIE = "admin_token";
const ADMIN_SESSION_COOKIE = "admin_session";
const ONBOARDED_COOKIE = "swypik_onboarded";

// ---------- Hostname routing (Swypik 18+ on 18.swypik.com) ----------

const ADULT_HOST = (process.env.ADULT_HOST || "18.swypik.com").toLowerCase();
const MAIN_HOST = "swypik.com";
const WWW_HOST = "www.swypik.com";

// Paths that are valid on the adult host. Anything else served on
// 18.swypik.com gets bounced back to the main host so the two domains
// stay strictly separated (per project brief: "nici feed, nimic nu
// trebuie sa fie la fel").
const ADULT_HOST_ALLOWED_PREFIXES = [
  "/adult",
  "/welcome", // handoff landing
  "/api/adult",
  "/api/auth", // login + handoff consume
  "/api/health",
  "/api/webhooks/ccbill",
  "/api/webhooks/veriff",
  "/api/webhooks/paxum",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
];

function normaliseHost(raw: string | null): string {
  if (!raw) return "";
  return raw.toLowerCase().split(":")[0]!;
}

function isAdultHost(host: string): boolean {
  return host === ADULT_HOST;
}

function isAdultPath(pathname: string): boolean {
  return (
    pathname === "/adult" ||
    pathname.startsWith("/adult/") ||
    pathname.startsWith("/api/adult/") ||
    pathname.startsWith("/api/webhooks/ccbill") ||
    pathname.startsWith("/api/webhooks/veriff") ||
    pathname.startsWith("/api/webhooks/paxum")
  );
}

function adultHostAllows(pathname: string): boolean {
  if (pathname === "/") return true; // landing
  return ADULT_HOST_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p),
  );
}

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
  out.add(`https://${ADULT_HOST}`);
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

function crossHostRedirect(req: NextRequest, host: string, pathname: string, status = 308): NextResponse {
  const url = new URL(req.url);
  url.host = host;
  url.protocol = "https:";
  url.port = "";
  url.pathname = pathname;
  return NextResponse.redirect(url, status);
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
  const host = normaliseHost(request.headers.get("host"));

  // ---------- Hostname routing ----------
  // 1) On the adult host (18.swypik.com), reject anything that isn't part
  //    of the adult surface — the two sites must look totally separate.
  if (isAdultHost(host)) {
    if (!adultHostAllows(pathname)) {
      return crossHostRedirect(request, MAIN_HOST, pathname);
    }
    const res = NextResponse.next();
    res.headers.set("X-Swypik-Surface", "adult");
    return res;
  }

  // 2) On the main host, anything pointing at the adult surface goes to 18.*.
  if ((host === MAIN_HOST || host === WWW_HOST) && isAdultPath(pathname)) {
    return crossHostRedirect(request, ADULT_HOST, pathname);
  }

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

  // Only enforce shopper auth on the legacy gated paths.
  const gatedPrefixes = ["/collections", "/orders", "/checkout", "/creator"];
  const isGated = gatedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isGated && !isAuthed) {
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

// Wide matcher: hostname routing must fire on every request to either host.
// Static assets are excluded for performance.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
