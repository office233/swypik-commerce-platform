import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n/routing";
import { LOCALES } from "@/lib/i18n/config";

const ONBOARDING_PATH = "/onboarding";

const SHOPPER_COOKIE = "swypik_session";
const LEGACY_CREATOR_COOKIE = "creator_session";
const SELLER_COOKIE = "seller_session";
const ADMIN_COOKIE = "admin_token";
const ADMIN_SESSION_COOKIE = "admin_session";
const ONBOARDED_COOKIE = "swypik_onboarded";

// Rute care NU primesc niciodată prefix de limbă (API, back-office, auth, sitemap-uri).
const NON_LOCALIZED_PREFIXES = [
  "/api/",
  "/admin",
  "/seller",
  "/auth",
  "/onboarding",
  "/creator",
  "/feed.xml",
  "/sitemap.xml",
  "/static-sitemap.xml",
  "/products/sitemap",
  "/videos/sitemap.xml",
  "/robots.txt",
  "/unsubscribe",
  "/r",
  "/courier",
];

function isNonLocalized(pathname: string): boolean {
  return NON_LOCALIZED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}

const LOCALE_PREFIX_RE = new RegExp(`^/(?:${LOCALES.join("|")})(?=/|$)`);
function stripLocale(pathname: string): string {
  const stripped = pathname.replace(LOCALE_PREFIX_RE, "");
  return stripped === "" ? "/" : stripped;
}
function currentLocalePrefix(pathname: string): string {
  const m = pathname.match(LOCALE_PREFIX_RE);
  return m ? m[0] : "";
}

// ---------- CSRF / Origin guard ----------

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_PREFIXES = [
  "/api/webhooks/",
  "/api/cron/",
  "/api/health",
  "/api/internal/",
];

function allowedOrigins(req: NextRequest): string[] {
  const out = new Set<string>();
  const envSite = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envSite) out.add(envSite.replace(/\/$/, ""));
  out.add("https://swypik.com");
  out.add("https://www.swypik.com");
  out.add("https://18.swypik.com");
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
  if (!candidate) return true;

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

const intlMiddleware = createIntlMiddleware(routing);

// Verifică dacă pathname-ul canonical (fără prefix locale) declanșează un redirect
// din regulile gated. Returnează ținta de redirect sau `null` dacă request-ul e OK.
function gatedRedirectTarget(
  pathname: string,
  hasShopper: boolean,
  hasLegacyCreator: boolean,
  hasSeller: boolean,
  hasAdmin: boolean,
  localePrefix: string,
): string | null {
  const localized = (path: string) =>
    `${localePrefix}${path.startsWith("/") ? path : `/${path}`}`;

  if (pathname.startsWith("/admin/") && pathname !== "/admin/") {
    if (!hasAdmin) return "/admin";
  }
  if (
    pathname.startsWith("/seller/") &&
    pathname !== "/seller/" &&
    pathname !== "/seller/login" &&
    !pathname.startsWith("/seller/login/")
  ) {
    if (!hasSeller) return "/seller/login";
  }
  const gatedPrefixes = ["/collections", "/orders", "/checkout", "/creator"];
  const isGated = gatedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthed = hasShopper || hasLegacyCreator;
  if (isGated && !isAuthed) {
    return localized("/account");
  }
  return null;
}

export function middleware(request: NextRequest) {
  // 1) CSRF check.
  if (csrfBlocked(request)) {
    return new NextResponse(JSON.stringify({ error: "csrf" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const { pathname } = request.nextUrl;

  // 2) Rute non-localizate: aplicăm DOAR auth gating, fără next-intl.
  if (isNonLocalized(pathname)) {
    const cookies = request.cookies;
    const hasShopper = Boolean(cookies.get(SHOPPER_COOKIE)?.value);
    const hasLegacyCreator = Boolean(cookies.get(LEGACY_CREATOR_COOKIE)?.value);
    const hasSeller = Boolean(cookies.get(SELLER_COOKIE)?.value);
    const hasAdmin = Boolean(cookies.get(ADMIN_COOKIE)?.value);

    if (pathname.startsWith("/api/")) return NextResponse.next();
    const target = gatedRedirectTarget(
      pathname,
      hasShopper,
      hasLegacyCreator,
      hasSeller,
      hasAdmin,
      "",
    );
    if (target) return redirectTo(request, target, target === "/account");
    return NextResponse.next();
  }

  // 3) Verificăm gating ÎNAINTE de next-intl (pentru rute localizate),
  //    folosind forma canonică (fără prefix).
  const cookies = request.cookies;
  const hasShopper = Boolean(cookies.get(SHOPPER_COOKIE)?.value);
  const hasLegacyCreator = Boolean(cookies.get(LEGACY_CREATOR_COOKIE)?.value);
  const hasSeller = Boolean(cookies.get(SELLER_COOKIE)?.value);
  const hasAdmin = Boolean(cookies.get(ADMIN_COOKIE)?.value);

  const prefix = currentLocalePrefix(pathname);
  const canonical = stripLocale(pathname);

  const gatedTarget = gatedRedirectTarget(
    canonical,
    hasShopper,
    hasLegacyCreator,
    hasSeller,
    hasAdmin,
    prefix,
  );
  if (gatedTarget) {
    return redirectTo(request, gatedTarget, gatedTarget.endsWith("/account"));
  }

  // 4) Delegăm restul (locale resolution, rewrite, cookie set) către next-intl.
  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Exclude TOATE fișierele statice cu extensie (favicon.svg, icoane PWA,
    // manifest, imagini, video) — altfel middleware-ul i18n le prefixează
    // cu locale și Next.js returnează 404 pentru ele.
    "/((?!_next/static|_next/image|.*\\.[\\w]+$).*)",
  ],
};
