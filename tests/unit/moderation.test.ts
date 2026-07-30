import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks ────────────────────────────────────────────────────────────────
const dbQuery = vi.fn();
vi.mock("@/lib/db", () => ({ dbQuery: (...a: unknown[]) => dbQuery(...a) }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

const SECRET = "test-internal-secret-value";
process.env.INTERNAL_SECRET = SECRET;

import { GET as pendingGET } from "@/app/api/internal/moderation/pending/route";
import { POST as decidePOST } from "@/app/api/internal/moderation/decide/route";

function pendingReq(query = "", secret: string | null = SECRET) {
  const headers: Record<string, string> = {};
  if (secret !== null) headers["x-internal"] = secret;
  return new Request(`http://localhost/api/internal/moderation/pending${query}`, { headers });
}

function decideReq(body: unknown, secret: string | null = SECRET) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-internal"] = secret;
  return new Request("http://localhost/api/internal/moderation/decide", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  dbQuery.mockReset();
});

// ── pending ──────────────────────────────────────────────────────────────
describe("GET /api/internal/moderation/pending", () => {
  it("returns 403 without x-internal header", async () => {
    const res = await pendingGET(pendingReq("", null));
    expect(res.status).toBe(403);
  });

  it("returns 403 with a wrong secret", async () => {
    const res = await pendingGET(pendingReq("", "x".repeat(SECRET.length)));
    expect(res.status).toBe(403);
  });

  it("maps seller rows into normalized pending items", async () => {
    dbQuery.mockResolvedValue({
      rows: [
        {
          id: 42, name: "ACME SRL", email: "a@b.ro", cui: "RO123", phone: "0722",
          product_type: "food", status: "pending", created_at: "2026-01-01T00:00:00Z",
          business_details: { x: 1 }, erp_connected: false,
        },
      ],
      rowCount: 1,
    });
    const res = await pendingGET(pendingReq("?type=seller"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.count).toBe(1);
    expect(json.items[0]).toMatchObject({ type: "seller", id: "42", name: "ACME SRL", status: "pending" });
    expect(json.items[0].detail.cui).toBe("RO123");
  });

  it("queries only one table when type is scoped", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await pendingGET(pendingReq("?type=courier"));
    expect(dbQuery).toHaveBeenCalledTimes(1);
    expect(String(dbQuery.mock.calls[0][0])).toContain("couriers");
  });

  it("queries all four tables for type=all", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await pendingGET(pendingReq("?type=all"));
    expect(dbQuery).toHaveBeenCalledTimes(4);
  });

  it("caps limit at 500", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await pendingGET(pendingReq("?type=seller&limit=9999"));
    expect(dbQuery.mock.calls[0][1]).toEqual([500]);
  });

  it("falls back to a default name for sellers without one", async () => {
    dbQuery.mockResolvedValue({
      rows: [{ id: 1, name: null, status: "pending", created_at: "2026-01-01" }],
      rowCount: 1,
    });
    const json = await (await pendingGET(pendingReq("?type=seller"))).json();
    expect(json.items[0].name).toBe("(fara nume)");
  });

  it("returns 500 when the query fails", async () => {
    dbQuery.mockRejectedValue(new Error("db down"));
    const res = await pendingGET(pendingReq("?type=seller"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("query_failed");
  });
});

// ── decide ───────────────────────────────────────────────────────────────
describe("POST /api/internal/moderation/decide", () => {
  it("returns 403 without the internal secret", async () => {
    const res = await decidePOST(decideReq({ type: "seller", id: "1", decision: "approve" }, null));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await decidePOST(decideReq("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });

  it("returns 400 on an unknown type", async () => {
    const res = await decidePOST(decideReq({ type: "alien", id: "1", decision: "approve" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation");
  });

  it("returns 400 on an unknown decision", async () => {
    const res = await decidePOST(decideReq({ type: "seller", id: "1", decision: "maybe" }));
    expect(res.status).toBe(400);
  });

  it("approves a seller and persists the ERP api key", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const res = await decidePOST(
      decideReq({ type: "seller", id: "7", decision: "approve", erp_api_key: "k".repeat(20) }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, type: "seller", id: "7", decision: "approve" });
    expect(String(dbQuery.mock.calls[0][0])).toContain("status = 'approved'");
    expect(dbQuery.mock.calls[0][1]).toEqual(["7", "k".repeat(20)]);
  });

  it("rejects a seller and stores the rejection reason", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const res = await decidePOST(decideReq({ type: "seller", id: "8", decision: "reject", reason: "acte lipsa" }));
    expect(res.status).toBe(200);
    expect(String(dbQuery.mock.calls[0][0])).toContain("rejected");
    expect(dbQuery.mock.calls[0][1]).toEqual(["8", "acte lipsa"]);
  });

  it("sets merchant to active on approve and closed on reject", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await decidePOST(decideReq({ type: "merchant", id: "m1", decision: "approve" }));
    expect(dbQuery.mock.calls[0][1]).toEqual(["m1", "active"]);
    dbQuery.mockClear();
    await decidePOST(decideReq({ type: "merchant", id: "m1", decision: "reject" }));
    expect(dbQuery.mock.calls[0][1]).toEqual(["m1", "closed"]);
  });

  it("verifies a courier on approve", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await decidePOST(decideReq({ type: "courier", id: "c1", decision: "approve" }));
    expect(String(dbQuery.mock.calls[0][0])).toContain("couriers");
    expect(dbQuery.mock.calls[0][1]).toEqual(["c1", "verified"]);
  });

  it("verifies a cause on approve", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await decidePOST(decideReq({ type: "cause", id: "d1", decision: "approve" }));
    expect(String(dbQuery.mock.calls[0][0])).toContain("donation_causes");
    expect(dbQuery.mock.calls[0][1]).toEqual(["d1", "verified"]);
  });

  it("returns 404 when nothing was updated (already decided)", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await decidePOST(decideReq({ type: "seller", id: "9", decision: "approve" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found_or_already_decided");
  });

  it("returns 500 when the update throws", async () => {
    dbQuery.mockRejectedValue(new Error("db down"));
    const res = await decidePOST(decideReq({ type: "seller", id: "9", decision: "approve" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("update_failed");
  });

  it("rejects an erp_api_key shorter than 16 chars", async () => {
    const res = await decidePOST(decideReq({ type: "seller", id: "1", decision: "approve", erp_api_key: "short" }));
    expect(res.status).toBe(400);
  });
});
