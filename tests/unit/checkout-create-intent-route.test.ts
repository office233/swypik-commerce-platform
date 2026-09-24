import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test (SWYP hybrid-payment removal): /api/checkout/create-intent
// must charge the exact same Stripe amount for a cart whether or not legacy
// SWYP fields (`swypCents`/`useSwyp`) are present in the request body — the
// server no longer reads them, card covers 100% of the total in every case.

const PRODUCT = {
  productId: "11111111-1111-1111-1111-111111111111",
  aeProductId: "ae-1",
  sellerId: "seller-1",
  title: "Test product",
  price: 49.99, // RON
  quantity: 1,
};

vi.mock("@/lib/db/product-queries", () => ({
  getCheckoutProductById: vi.fn(async () => ({
    productId: PRODUCT.productId,
    aeProductId: PRODUCT.aeProductId,
    sellerId: PRODUCT.sellerId,
    title: PRODUCT.title,
    price: PRODUCT.price,
  })),
}));

vi.mock("@/lib/checkout/attribution", () => ({
  resolveCheckoutAttribution: vi.fn(async () => ({ creatorId: null, videoId: null, creatorProductLinkId: null })),
}));

vi.mock("@/lib/social/session", () => ({
  getOptionalSocialUserId: vi.fn(async () => null),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ success: true, remaining: 10 })),
  getClientIP: () => "127.0.0.1",
}));

vi.mock("@/lib/risk/user-block", () => ({
  isUserFraudBlocked: vi.fn(async () => false),
}));

const paymentIntentsCreate = vi.fn(async (params: { amount: number }) => ({
  id: "pi_test_1",
  client_secret: "secret_test_1",
  amount: params.amount,
}));

vi.mock("@/lib/stripe/checkout", () => ({
  getStripe: () => ({
    paymentIntents: { create: paymentIntentsCreate },
  }),
}));

vi.mock("@/lib/db", () => {
  const dbQuery = vi.fn(async (sql: string) => {
    if (sql.includes("INSERT INTO commerce_orders")) {
      return { rows: [{ id: "order-1" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return {
    dbQuery,
    withTransaction: async <T,>(fn: (q: typeof dbQuery) => Promise<T>) => fn(dbQuery),
  };
});

import { POST } from "@/app/api/checkout/create-intent/route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/checkout/create-intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  paymentIntentsCreate.mockClear();
});

describe("POST /api/checkout/create-intent — SWYP removal regression", () => {
  it("charges the full cart total when no SWYP fields are present", async () => {
    const res = await POST(req({ products: [{ productId: PRODUCT.productId, quantity: 1 }] }) as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
    const args = paymentIntentsCreate.mock.calls[0][0];
    expect(args.amount).toBe(Math.round(PRODUCT.price * 100));
    expect(json.cardAmountCents).toBe(Math.round(PRODUCT.price * 100));
    expect(json.swypPaidCents).toBeUndefined();
  });

  it("charges the exact same amount when legacy swypCents/useSwyp fields are sent", async () => {
    const res = await POST(
      req({
        products: [{ productId: PRODUCT.productId, quantity: 1 }],
        // Legacy client fields — must be ignored, never reduce the card amount.
        swypCents: 5000,
        useSwyp: true,
      }) as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
    const args = paymentIntentsCreate.mock.calls[0][0];
    expect(args.amount).toBe(Math.round(PRODUCT.price * 100));
    expect(json.cardAmountCents).toBe(Math.round(PRODUCT.price * 100));
  });
});
