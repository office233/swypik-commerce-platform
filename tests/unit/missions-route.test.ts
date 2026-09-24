import { describe, it, expect, vi } from "vitest";

let capturedSql = "";
let capturedParams: unknown[] = [];

vi.mock("@/lib/db", () => ({
  dbQuery: vi.fn(async (sql: string, params: unknown[] = []) => {
    capturedSql = sql;
    capturedParams = params;
    return { rows: [] };
  }),
}));

import { GET } from "@/app/api/missions/route";

describe("GET /api/missions", () => {
  it("excludes SWYP-prize missions from the query (crypto/SWYP removal)", async () => {
    const res = await GET(new Request("http://localhost/api/missions"));
    expect(res.status).toBe(200);
    expect(capturedSql).toContain("m.prize_currency <> 'SWYP'");
    expect(Array.isArray(capturedParams)).toBe(true);
  });

  it("returns an empty list when the DB has none (no SWYP missions to fall back to)", async () => {
    const res = await GET(new Request("http://localhost/api/missions"));
    const json = await res.json();
    expect(json.missions).toEqual([]);
  });
});
