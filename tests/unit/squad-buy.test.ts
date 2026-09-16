import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockRows: any[] = [];
vi.mock("@/lib/db", () => ({
    dbQuery: vi.fn(async (query: string, params: any[]) => {
        if (query.includes("FROM squad_groups s") && query.includes("JOIN marketplace_products")) {
            return {
                rows: [
                    {
                        id: "squad-123",
                        product_id: "prod-456",
                        creator_name: "Andrei Popescu",
                        required_members: 2,
                        current_members: 1,
                        squad_price_cents: 7000,
                        regular_price_cents: 10000,
                        currency: "RON",
                        status: "active",
                        expires_at: new Date(Date.now() + 86400000).toISOString(),
                        created_at: new Date().toISOString(),
                        product_title: "Căști Wireless Noise Cancelling",
                        product_images: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e"],
                    },
                ],
                rowCount: 1,
            };
        }
        if (query.includes("FROM squad_members")) {
            return {
                rows: [
                    {
                        id: "mem-1",
                        squad_id: "squad-123",
                        user_name: "Andrei Popescu",
                        user_avatar: null,
                        joined_at: new Date().toISOString(),
                        status: "confirmed",
                    },
                ],
                rowCount: 1,
            };
        }
        if (query.includes("marketplace_products WHERE id = $1")) {
            return {
                rows: [
                    {
                        id: "prod-456",
                        title: "Căști Wireless Noise Cancelling",
                        price_cents: 10000,
                        images: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e"],
                    },
                ],
                rowCount: 1,
            };
        }
        return { rows: [], rowCount: 0 };
    }),
    withTransaction: vi.fn(async (cb: (q: any) => Promise<any>) => {
        const mockQ = vi.fn(async (query: string, params: any[]) => {
            if (query.includes("INSERT INTO squad_groups")) {
                return {
                    rows: [
                        {
                            id: "squad-new",
                            product_id: params[0],
                            creator_name: params[2],
                            required_members: 2,
                            current_members: 1,
                            squad_price_cents: params[4],
                            regular_price_cents: params[5],
                            status: "active",
                            expires_at: new Date(Date.now() + 86400000).toISOString(),
                        },
                    ],
                };
            }
            if (query.includes("INSERT INTO squad_members")) {
                return { rows: [{ id: "mem-new" }] };
            }
            if (query.includes("UPDATE squad_groups")) {
                return {
                    rows: [
                        {
                            id: "squad-123",
                            current_members: 2,
                            status: "completed",
                        },
                    ],
                };
            }
            return { rows: [] };
        });
        return cb(mockQ);
    }),
}));

import { createSquadGroup, getSquadDetails, joinSquadGroup, getActiveSquadsForProduct, getSquadsForSeller } from "@/lib/squad/engine";

describe("Swypik Squad Buy Engine", () => {
    it("creates a squad with 30% discount for 2 members", async () => {
        const result = await createSquadGroup({
            productId: "prod-456",
            userName: "Elena Ionescu",
        });

        expect(result).not.toBeNull();
        expect(result?.squad.required_members).toBe(2);
        expect(result?.squad.current_members).toBe(1);
        expect(result?.squad.regular_price_cents).toBe(10000);
        // 30% discount -> 7000 cents
        expect(result?.squad.squad_price_cents).toBe(7000);
        expect(result?.shareUrl).toContain("/squad/");
    });

    it("fetches squad details with product and member list", async () => {
        const details = await getSquadDetails("squad-123");
        expect(details).not.toBeNull();
        expect(details?.squad.creator_name).toBe("Andrei Popescu");
        expect(details?.product.title).toBe("Căști Wireless Noise Cancelling");
        expect(details?.members.length).toBe(1);
    });

    it("joins a squad and transitions status to completed when target reached", async () => {
        const joinResult = await joinSquadGroup({
            squadId: "squad-123",
            userName: "Mihai Radu",
        });

        expect(joinResult.success).toBe(true);
        expect(joinResult.squad?.current_members).toBe(2);
        expect(joinResult.squad?.status).toBe("completed");
    });

    it("fetches active squads for a specific product", async () => {
        const productSquads = await getActiveSquadsForProduct("prod-456", 5);
        expect(Array.isArray(productSquads)).toBe(true);
        expect(productSquads.length).toBeGreaterThan(0);
        expect(productSquads[0].product_id).toBe("prod-456");
    });

    it("aggregates seller squad stats correctly", async () => {
        const sellerData = await getSquadsForSeller("seller-789");
        expect(sellerData).toHaveProperty("squads");
        expect(sellerData).toHaveProperty("stats");
        expect(sellerData.stats.totalSquads).toBeGreaterThanOrEqual(0);
        expect(sellerData.stats.viralOrdersCount).toBeGreaterThanOrEqual(0);
    });
});
