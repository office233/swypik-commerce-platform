import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/security/seller-auth", () => ({
  getSellerSessionId: vi.fn(async () => "mock-seller-id-123"),
}));

vi.mock("@/lib/squad/engine", () => ({
  getSquadsForSeller: vi.fn(async (sellerId: string) => ({
    squads: [
      {
        id: "squad-1",
        product_id: "prod-1",
        creator_name: "Radu M.",
        current_members: 2,
        required_members: 2,
        squad_price_cents: 7000,
        regular_price_cents: 10000,
        status: "completed",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        created_at: new Date().toISOString(),
        product_title: "Aspirator Robot",
      },
    ],
    stats: {
      totalSquads: 1,
      activeSquads: 0,
      completedSquads: 1,
      viralOrdersCount: 2,
      extraRevenueCents: 14000,
    },
  })),
}));

import { GET } from "@/app/api/seller/squad/route";

describe("Seller ERP Squad API", () => {
  it("returns squads and metrics for authenticated seller", async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.squads.length).toBe(1);
    expect(data.stats.totalSquads).toBe(1);
    expect(data.stats.viralOrdersCount).toBe(2);
    expect(data.stats.extraRevenueCents).toBe(14000);
  });
});
