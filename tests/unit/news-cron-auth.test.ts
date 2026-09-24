import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.CRON_SECRET = "test-cron-secret-value";

const pipelineMock = vi.fn(async (_category?: string) => ({ ingested: 2, categoriesProcessed: ["tech-ai"], capped: false }));

vi.mock("@/lib/news/rss-ingester", () => ({
  runNewsIngestionPipeline: (category?: string) => pipelineMock(category),
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: () => true,
  frozenResponse: () => new Response(JSON.stringify({ ok: false }), { status: 410 }),
}));

let adminOk = false;
vi.mock("@/lib/security/admin-auth", () => ({
  isAdminRequest: async () => adminOk,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: async () => ({ success: true, remaining: 10 }),
  getClientIP: () => "127.0.0.1",
}));

import { POST } from "@/app/api/cron/news-pipeline/route";

function req(headers: Record<string, string> = {}, body: unknown = {}): Request {
  return new Request("http://localhost/api/cron/news-pipeline", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  adminOk = false;
  pipelineMock.mockClear();
});

describe("POST /api/cron/news-pipeline auth", () => {
  it("rejects a request with no secret and no admin session", async () => {
    const res = await POST(req() as any);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it("rejects a request with a wrong secret", async () => {
    const res = await POST(req({ "x-cron-secret": "wrong-secret" }) as any);
    expect(res.status).toBe(401);
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it("accepts a request with the correct CRON_SECRET header", async () => {
    const res = await POST(req({ "x-cron-secret": "test-cron-secret-value" }) as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.triggeredBy).toBe("cron");
    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a request with the correct Bearer CRON_SECRET", async () => {
    const res = await POST(req({ authorization: "Bearer test-cron-secret-value" }) as any);
    expect(res.status).toBe(200);
    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it("accepts an authenticated admin request even without the cron secret", async () => {
    adminOk = true;
    const res = await POST(req() as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.triggeredBy).toBe("admin");
    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });
});
