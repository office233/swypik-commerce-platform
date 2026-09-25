import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const isDev = process.env.NODE_ENV === "development";
// Sentry trimite evenimentele prin XHR către `https://<org>.ingest.sentry.io`.
// Fără intrarea asta în `connect-src`, browserul le blochează chiar dacă DSN-ul
// e corect — iar eșecul e tăcut: Sentry pare configurat, dar nu ajunge nimic.
// Ținut într-o constantă fiindcă CSP-ul e definit în TREI locuri (aici de două
// ori + `middleware.ts`); a fost deja o sursă de divergență.
const SENTRY_CONNECT_SRC = "https://*.ingest.sentry.io";
// LiveKit (Swypik Messenger calls) needs its own websocket host in connect-src
// when configured. Built from NEXT_PUBLIC_LIVEKIT_URL (e.g. wss://foo.livekit.cloud)
// so it stays in sync with the value the client SDK actually connects to.
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
let LIVEKIT_CONNECT_SRC = "";
try {
  if (LIVEKIT_URL) {
    const u = new URL(LIVEKIT_URL.replace(/^ws/, "http"));
    LIVEKIT_CONNECT_SRC = `wss://${u.host} https://${u.host}`;
  }
} catch {
  LIVEKIT_CONNECT_SRC = "";
}
// Explicit allowlist — do NOT widen back to `https:` (open connect-src let any
// page/script exfiltrate to arbitrary hosts). New modules (Movies, Music, News,
// Gaming, Messenger) call third-party APIs (Audius,
// Jamendo, Radio-Browser, CheapShark, OpenTDB, Azure AI) ONLY from
// server code (lib/**), never from the browser — see app/api/* proxies — so
// none of those hosts need to be here.
const CONNECT_SRC = `'self' https://swypik.com https://www.swypik.com https://api.swypik.com https://media.swypik.com https://cdn.swypik.com https://api.stripe.com https://*.stripe.com ${SENTRY_CONNECT_SRC}${LIVEKIT_CONNECT_SRC ? ` ${LIVEKIT_CONNECT_SRC}` : ""}`;
// media-src stays broad (`https:`) on purpose: Swypik Music plays internet
// radio streams (lib/audio/radio-browser.ts) whose stream URLs come from
// arbitrary stations' own hosts picked at request time — there is no fixed
// allowlist possible. img-src also stays `https:` for the same class of
// arbitrary-host cover art / thumbnails.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  media-src 'self' blob: data: https:;
    connect-src ${CONNECT_SRC};
  frame-src https://js.stripe.com https://hooks.stripe.com;
  font-src 'self' data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://checkout.stripe.com;
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, " ").trim();
const cspReportOnly = `
  default-src 'self';
  script-src 'self' https://js.stripe.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  media-src 'self' blob: data: https:;
  connect-src ${CONNECT_SRC};
  frame-src https://js.stripe.com https://hooks.stripe.com;
  font-src 'self' data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://checkout.stripe.com;
  frame-ancestors 'none';
`.replace(/\s{2,}/g, " ").trim();


/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },
  images: {
    // Explicit allowlist — `hostname: '**'` for http AND https was an open
    // image proxy (any URL could be requested through /_next/image). Arbitrary-
    // host images from the new modules (radio station favicons, Audius/Jamendo
    // cover art, podcast artwork, gaming deal thumbnails) are rendered with
    // plain <img> in those components (not next/image), so they don't need an
    // entry here — see components/music/*, app/[locale]/gaming/page.tsx.
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'commons.wikimedia.org' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'cdn.swypik.com' },
      { protocol: 'https', hostname: 'media.swypik.com' },
    ],
  },
  // ─── Cloudflare + Performance Headers ───
  async redirects() {
    return [
      { source: "/login", destination: "/auth/login", permanent: true },
      { source: "/register", destination: "/auth/signup", permanent: true },
      { source: "/signup", destination: "/auth/signup", permanent: true },
      { source: "/categorii", destination: "/categories", permanent: true },
      { source: "/categorii/:slug*", destination: "/categories/:slug*", permanent: true },
      { source: "/reels", destination: "/explore", permanent: true },
      { source: "/sellers", destination: "/seller", permanent: true },
      { source: "/audio", destination: "/voice", permanent: true },
      { source: "/legal", destination: "/legal/terms", permanent: true },
      { source: "/feed", destination: "/explore", permanent: true },
      { source: "/trending", destination: "/explore?sort=trending", permanent: true },
      { source: "/wishlist", destination: "/account/saved", permanent: true },
      { source: "/settings", destination: "/account/settings", permanent: true },
      { source: "/returns", destination: "/account/returns", permanent: true },
      { source: "/auth/register", destination: "/auth/signup", permanent: true },
      { source: "/auth/forgot-password", destination: "/auth/forgot", permanent: true },
      { source: "/sell", destination: "/seller", permanent: true },
      { source: "/contact", destination: "/help", permanent: true },
      { source: "/favorites", destination: "/account/saved", permanent: true },
      { source: "/manifest.webmanifest", destination: "/manifest.json", permanent: true },
    ];
  },
  async headers() {
    if (isDev) return [];
    return [
      {
        // Public folder static assets (icons, favicons, images) — 1 year immutable
        source: '/:path*.:ext(ico|png|jpg|jpeg|webp|avif|gif|svg|woff2|woff|mp4|m3u8|ts)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'CDN-Cache-Control', value: 'public, max-age=31536000' },
        ],
      },
      {
        // Static assets: cache 1 year (Cloudflare + browser)
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'CDN-Cache-Control', value: 'public, max-age=31536000' },
        ],
      },
      {
        // All pages: security + performance headers
        // 2026-08-11 (audit): CSP-ul global NU se aplică pe dashboard-urile
        // sensibile (admin/seller/creator/courier) — acolo middleware-ul
        // setează CSP nonce-based per request, iar regula de aici l-ar
        // suprascrie (next.config headers se aplică peste cele din middleware).
        source: '/((?!admin|seller|creator|courier).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: cspHeader },
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
        ],
      },
      {
        // Dashboard-urile sensibile: aceleași security headers, DAR fără CSP
        // (vine din middleware, nonce-based).
        source: '/(admin|seller|creator|courier)(/.*)?',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        ],
      },
      {
        // Homepage + product pages: cache at edge 2 min
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=30, s-maxage=120, stale-while-revalidate=300' },
          { key: 'CDN-Cache-Control', value: 'public, max-age=120' },
        ],
      },
      {
        source: '/product/:id*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
          { key: 'CDN-Cache-Control', value: 'public, max-age=300' },
        ],
      },
    ];
  },
};

// 2026-08-24 (audit perf): SDK-ul Sentry stă în chunk-ul partajat (~26-44% din
// First Load JS) fără să treacă prin plugin-ul lui de build. Am MĂSURAT varianta
// `withSentryConfig(..., { webpack: { treeshake: { removeDebugLogging: true } } })`:
// bundle-ul partajat a crescut 185 kB → 188 kB, pentru că plugin-ul adaugă mai
// mult decât scoate atâta timp cât tracing-ul rămâne activ. Câștigul real
// (~22-49 kB) cere `removeTracing: true`, care dezactivează complet performance
// monitoring-ul — decizie de produs, nu optimizare gratuită. Lăsat neschimbat
// intenționat; vezi RAPORT.md.
export default withNextIntl(nextConfig);
