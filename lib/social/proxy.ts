export function getSocialApiBaseUrl() {
  const raw =
    process.env.SOCIAL_API_URL ||
    process.env.GO_API_URL ||
    process.env.NEXT_PUBLIC_SOCIAL_API_URL;

  if (!raw) return null;
  const base = raw
    .replace(/\/api\/v1\/videos\/upload\/?$/, "")
    .replace(/\/v1\/videos\/upload\/?$/, "");
  return base.endsWith("/") ? base : `${base}/`;
}

export async function proxyToSocialApi(req: Request, path: string) {
  const baseUrl = getSocialApiBaseUrl();
  if (!baseUrl) return null;

  const incomingUrl = new URL(req.url);
  const upstreamUrl = new URL(path.replace(/^\//, ""), baseUrl);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  if (process.env.PLATFORM_API_SECRET) {
    headers.set("X-Swypik-Internal-Secret", process.env.PLATFORM_API_SECRET);
  }

  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set("x-Swypik-upstream", "go-social-api");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
