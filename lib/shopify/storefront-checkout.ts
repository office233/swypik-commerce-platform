type CartLineInput = {
  variantId: string;
  quantity: number;
};

type BuyerIdentityInput = {
  email?: string;
  phone?: string;
  countryCode?: string;
};

const API_VERSION = process.env.SHOPIFY_STOREFRONT_API_VERSION || process.env.SHOPIFY_API_VERSION || "2026-04";

function requireStorefrontConfig() {
  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!store) throw new Error("SHOPIFY_STORE is missing");
  if (!token) throw new Error("SHOPIFY_STOREFRONT_ACCESS_TOKEN is missing");

  return { store, token };
}

function toVariantGid(variantId: string) {
  if (!variantId) return "";
  if (variantId.startsWith("gid://shopify/ProductVariant/")) return variantId;
  if (/^\d+$/.test(variantId)) return `gid://shopify/ProductVariant/${variantId}`;
  return variantId;
}

async function storefrontGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const { store, token } = requireStorefrontConfig();
  const res = await fetch(`https://${store}/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`Shopify Storefront ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }

  if (json?.errors?.length) {
    throw new Error(json.errors.map((err: any) => err.message).join("; "));
  }

  return json.data as T;
}

export async function createNativeCheckout(
  lineItems: CartLineInput[],
  buyer?: BuyerIdentityInput
): Promise<{ checkoutUrl: string | null; cartId: string | null; errors: string[] }> {
  const lines = lineItems
    .filter((item) => item.variantId && item.quantity > 0)
    .map((item) => ({ merchandiseId: toVariantGid(item.variantId), quantity: item.quantity }));

  if (lines.length === 0) {
    return { checkoutUrl: null, cartId: null, errors: ["Nu există produse valide pentru checkout."] };
  }

  const mutation = `
    mutation CartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const buyerIdentity: BuyerIdentityInput = {
    countryCode: "RO",
  };

  if (buyer?.email) buyerIdentity.email = buyer.email;
  if (buyer?.phone) buyerIdentity.phone = buyer.phone;

  const data = await storefrontGraphQL<{
    cartCreate: {
      cart: { id: string; checkoutUrl: string } | null;
      userErrors: { field?: string[]; message: string }[];
    };
  }>(mutation, {
    input: {
      lines,
      buyerIdentity,
    },
  });

  const errors = data.cartCreate.userErrors.map((err) => err.message);

  return {
    checkoutUrl: data.cartCreate.cart?.checkoutUrl || null,
    cartId: data.cartCreate.cart?.id || null,
    errors,
  };
}
