import withPWAInit from "@ducanh2912/next-pwa";

const isDev = process.env.NODE_ENV === "development";
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  media-src 'self' blob: https://media.swypik.com https://*.aliexpress-media.com https://video.aliexpress-media.com;
  connect-src 'self' https://swypik.com https://www.swypik.com https://api.swypik.com https://media.swypik.com https://api.stripe.com https://*.stripe.com;
  frame-src https://js.stripe.com https://hooks.stripe.com;
  font-src 'self' data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://checkout.stripe.com;
  frame-ancestors 'none';
  upgrade-insecure-requests;
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
  async headers() {
    return [
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
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: cspHeader },
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

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
});

export default withPWA(nextConfig);
