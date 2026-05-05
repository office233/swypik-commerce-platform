/**
 * Shopify OAuth — Client Credentials Grant Flow
 * Generates access tokens automatically (tokens expire after 24h)
 */

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getShopifyAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID!;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET!;
  const store = process.env.SHOPIFY_STORE!;

  const response = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Shopify OAuth failed: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  const token = data.access_token;

  // Cache for 23 hours (tokens last 24h)
  cachedToken = {
    token,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  };

  console.log("[Shopify] Access token obtained successfully");
  return token;
}

export function getShopifyStoreUrl(): string {
  return `https://${process.env.SHOPIFY_STORE!}`;
}

export function getShopifyAdminUrl(): string {
  return `https://${process.env.SHOPIFY_STORE!}/admin/api/2026-04`;
}
