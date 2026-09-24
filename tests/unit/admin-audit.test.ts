import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { sql: string; params: unknown[] }[] = [];
let failInsert = false;
let authUser: { isAdmin: boolean; userId: string | null } = { isAdmin: false, userId: null };

vi.mock("@/lib/db", () => ({
  dbQuery: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (failInsert) throw new Error("db down");
    calls.push({ sql, params });
    return { rows: [], rowCount: 1 };
  }),
}));
vi.mock("@/lib/auth/getAuthUser", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { logAdminAction } from "@/lib/security/admin-audit";

describe("logAdminAction", () => {
  beforeEach(() => {
    calls.length = 0;
    failInsert = false;
    authUser = { isAdmin: false, userId: null };
  });

  it("records an admin user as actor with target, details and client ip", async () => {
    authUser = { isAdmin: true, userId: "u-1" };
    const req = new Request("https://swypik.com/api/admin/x", { headers: { "cf-connecting-ip": "1.2.3.4" } });
    await logAdminAction({ action: "order.refund", targetType: "order", targetId: 42, details: { amount: 100 }, req });
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual(["u-1", "admin_user", "order.refund", "order", "42", '{"amount":100}', "1.2.3.4"]);
  });

  it("falls back to the shared-secret actor when there is no admin user", async () => {
    await logAdminAction({ action: "cron.run" });
    expect(calls[0].params.slice(0, 5)).toEqual([null, "admin_secret", "cron.run", null, null]);
  });

  it("never throws when the insert fails", async () => {
    failInsert = true;
    await expect(logAdminAction({ action: "user.ban", targetId: "u-2" })).resolves.toBeUndefined();
  });
});
