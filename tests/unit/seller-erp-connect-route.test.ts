import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/security/seller-auth", () => ({ getSellerSessionId: async () => "seller-1" }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: async () => ({ success: true, remaining: 1 }) }));
const dbQuery = vi.hoisted(() => vi.fn(async () => ({ rows: [], rowCount: 0 })));
vi.mock("@/lib/db", () => ({ dbQuery }));

import { POST } from "@/app/api/seller/erp/connect/route";

const KEY = "msk_0123456789abcdef";
function req(url: string): Request {
  return new Request("http://localhost/api/seller/erp/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ erp_api_url: url, erp_api_key: KEY }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/seller/erp/connect", () => {
  it.each([
    "http://erp.example.com",
    "https://127.0.0.1",
    "https://169.254.169.254",
    "https://web-next",
    "https://localhost:3000",
  ])("rejects %s without fetching or saving", async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(url));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("rejects a missing/short key with 400", async () => {
    const res = await POST(
      new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ erp_api_url: "https://erp.example.com", erp_api_key: "x" }) }),
    );
    expect(res.status).toBe(400);
  });
});
