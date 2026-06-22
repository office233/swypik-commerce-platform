import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const isDev = process.env.NODE_ENV === "development";
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://sdk.minepi.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  media-src 'self' blob: https://media.swypik.com https://*.aliexpress-media.com https://video.aliexpress-media.com;
  connect-src 'self' https://swypik.com https://www.swypik.com https://api.swypik.com https://media.swypik.com https://api.stripe.com https://*.stripe.com https://api.minepi.com https://sdk.minepi.com;
  frame-src https://js.stripe.com https://hooks.stripe.com https://www.youtube.com https://www.youtube-nocookie.com;
  font-src 'self' data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://checkout.stripe.com;
  frame-ancestors 'self' https://*.minepi.com https://*.pi;
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, " ").trim();
const cspReportOnly = `
  default-src 'self';
  script-src 'self' https://js.stripe.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  media-src 'self' blob: https://media.swypik.com https://*.aliexpress-media.com https://video.aliexpress-media.com;
  connect-src 'self' https://swypik.com https://www.swypik.com https://api.swypik.com https://media.swypik.com https://api.stripe.com https://*.stripe.com https://api.minepi.com https://sdk.minepi.com;
  frame-src https://js.stripe.com https://hooks.stripe.com https://www.youtube.com https://www.youtube-nocookie.com;
  font-src 'self' data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://checkout.stripe.com;
  frame-ancestors 'self' https://*.minepi.com https://*.pi;
`.replace(/\s{2,}/g, " ").trim();


/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
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
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.alicdn.com' },
      { protocol: 'https', hostname: 'ae01.alicdn.com' },
      { protocol: 'https', hostname: 'ae04.alicdn.com' },
      { protocol: 'https', hostname: 'cf.cjdropshipping.com' },
      { protocol: 'https', hostname: '*.cjdropshipping.com' },
      { protocol: 'https', hostname: 'cdn.swypik.com' },
      { protocol: 'https', hostname: 'media.swypik.com' },
      { protocol: 'https', hostname: '*.aliexpress-media.com' },
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
      { source: "/products", destination: "/explore", permanent: true },
      { source: "/videos", destination: "/explore", permanent: true },
      { source: "/visual-search", destination: "/explore", permanent: true },
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
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: cspHeader },
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
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

export default withNextIntl(nextConfig);
