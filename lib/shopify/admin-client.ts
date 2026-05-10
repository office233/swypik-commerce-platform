/**
 * Shopify Admin API Client
 * Creates products, manages orders, inventory
 * Uses GraphQL Admin API (2026-04)
 */

import { getShopifyAccessToken, getShopifyStoreUrl } from "./auth";

const API_VERSION = "2026-04";

async function shopifyAdmin(query: string, variables?: Record<string, unknown>) {
  const token = await getShopifyAccessToken();
  const store = process.env.SHOPIFY_STORE!;

  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify Admin API error: ${res.status} — ${err}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

export type CreateProductInput = {
  title: string;
  descriptionHtml: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  images?: { src: string; altText?: string }[];
  variants?: {
    price: string;
    compareAtPrice?: string;
    sku?: string;
    inventoryQuantity?: number;
  }[];
};

export async function createProduct(input: CreateProductInput) {
  const mutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          handle
          onlineStoreUrl
          variants(first: 5) {
            edges {
              node {
                id
                price
                compareAtPrice
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      title: input.title,
      descriptionHtml: input.descriptionHtml,
      productType: input.productType || "General",
      vendor: input.vendor || "Swypik",
      tags: input.tags || [],
      images: input.images?.map((img) => ({
        src: img.src,
        altText: img.altText || input.title,
      })),
      variants: input.variants?.map((v) => ({
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        sku: v.sku,
      })) || [{ price: "0.00" }],
    },
  };

  const data = await shopifyAdmin(mutation, variables);

  if (data.productCreate.userErrors?.length > 0) {
    throw new Error(`Product creation failed: ${JSON.stringify(data.productCreate.userErrors)}`);
  }

  return data.productCreate.product;
}

export async function getProducts(first = 20) {
  const query = `
    query getProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            status
            totalInventory
            priceRangeV2 {
              minVariantPrice { amount currencyCode }
              maxVariantPrice { amount currencyCode }
            }
            images(first: 1) {
              edges { node { url altText } }
            }
            createdAt
          }
        }
      }
    }
  `;

  const data = await shopifyAdmin(query, { first });
  return data.products.edges.map((e: any) => e.node);
}

export async function getProduct(id: string) {
  const query = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        descriptionHtml
        status
        variants(first: 10) {
          edges {
            node {
              id
              title
              price
              compareAtPrice
              sku
              inventoryQuantity
            }
          }
        }
        images(first: 10) {
          edges { node { url altText } }
        }
      }
    }
  `;

  const data = await shopifyAdmin(query, { id });
  return data.product;
}

export async function deleteProduct(id: string) {
  const mutation = `
    mutation productDelete($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors { field message }
      }
    }
  `;

  return shopifyAdmin(mutation, { input: { id } });
}

export { shopifyAdmin };
