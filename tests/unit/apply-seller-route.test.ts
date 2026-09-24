import { describe, it, expect, vi, beforeEach } from "vitest";

let insertRows: { id: string }[] = [];
const sendEmailMock = vi.fn(async (_msg: { to: string; subject: string; html: string }) => {});

vi.mock("@/lib/db", () => ({
  dbQuery: vi.fn(async () => ({ rows: insertRows, rowCount: insertRows.length })),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ success: true })),
  getClientIP: () => "1.2.3.4",
}));
vi.mock("@/lib/email/service", () => ({ sendEmail: (msg: { to: string; subject: string; html: string }) => sendEmailMock(msg) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/app-url", () => ({ APP_URL: "https://swypik.com" }));

import { POST } from "@/app/api/apply-seller/route";

const body = {
  companyName: "Acme <script>alert(1)</script>",
  cui: "RO123\r\nBcc: x@evil.com",
  email: "Owner@Acme.ro",
  phone: "0712345678",
  productType: "Fashion",
};
const req = () =>
  new Request("https://swypik.com/api/apply-seller", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/apply-seller", () => {
  beforeEach(() => {
    sendEmailMock.mockClear();
    process.env.OPS_ALERT_EMAIL = "ops@swypik.com";
  });

  it("notifies ops with escaped HTML and a single-line subject for a new application", async () => {
    insertRows = [{ id: "s-1" }];
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: "received" });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const msg = sendEmailMock.mock.calls[0][0];
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("&lt;script&gt;");
    expect(msg.subject).not.toMatch(/[\r\n]/);
  });

  it("answers identically but does not notify ops when an existing non-pending seller is left untouched", async () => {
    insertRows = [];
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: "received" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
