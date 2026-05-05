/**
 * Shopify Storefront API Client
 * Creates carts and checkout URLs for customers
 * Uses GraphQL Storefront API (2026-04)
 */

const API_VERSION = "2026-04";

async function storefrontQuery(query: string, variables?: Record<string, unknown>) {
  const store = process.env.SHOPIFY_STORE!;
  const clientId = process.env.SHOPIFY_CLIENT_ID!;

  const res = await fetch(`https://${store}/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": clientId,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storefront API error: ${res.status} — ${err}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Storefront GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

export type CartItem = {
  merchandiseId: string; // Shopify variant GID
  quantity: number;
};

export async function createCart(items: CartItem[]) {
  const mutation = `
    mutation cartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount { amount currencyCode }
            subtotalAmount { amount currencyCode }
          }
          lines(first: 10) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price { amount currencyCode }
                    product {
                      title
                      images(first: 1) {
                        edges { node { url } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    input: {
      lines: items.map((item) => ({
        merchandiseId: item.merchandiseId,
        quantity: item.quantity,
      })),
    },
  };

  const data = await storefrontQuery(mutation, variables);

  if (data.cartCreate.userErrors?.length > 0) {
    throw new Error(`Cart creation failed: ${JSON.stringify(data.cartCreate.userErrors)}`);
  }

  return data.cartCreate.cart;
}

export async function addToCart(cartId: string, items: CartItem[]) {
  const mutation = `
    mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount { amount currencyCode }
          }
          lines(first: 20) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price { amount currencyCode }
                    product { title }
                  }
                }
              }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const data = await storefrontQuery(mutation, {
    cartId,
    lines: items.map((i) => ({ merchandiseId: i.merchandiseId, quantity: i.quantity })),
  });

  return data.cartLinesAdd.cart;
}

export async function getCart(cartId: string) {
  const query = `
    query getCart($cartId: ID!) {
      cart(id: $cartId) {
        id
        checkoutUrl
        totalQuantity
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
        }
        lines(first: 20) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  price { amount currencyCode }
                  product {
                    title
                    images(first: 1) {
                      edges { node { url } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await storefrontQuery(query, { cartId });
  return data.cart;
}

export async function removeFromCart(cartId: string, lineIds: string[]) {
  const mutation = `
    mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount { amount currencyCode }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const data = await storefrontQuery(mutation, { cartId, lineIds });
  return data.cartLinesRemove.cart;
}
