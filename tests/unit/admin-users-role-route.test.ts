import { describe, it, expect, vi, beforeEach } from "vitest";

let adminOk = true;
vi.mock("@/lib/security/admin-auth", () => ({
  hasAdminSession: async () => adminOk,
}));

const logAdminActionMock = vi.fn(async (_entry: Record<string, unknown>) => undefined);
vi.mock("@/lib/security/admin-audit", () => ({
  logAdminAction: (entry: Record<string, unknown>) => logAdminActionMock(entry),
}));

let authUser: { isAdmin: boolean; userId: string | null } = { isAdmin: true, userId: "actor-1" };
vi.mock("@/lib/auth/getAuthUser", () => ({
  getAuthUser: async () => authUser,
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// Queued responses consumed in order by successive client.query() calls.
let queryResponses: Array<{ rows: unknown[] }> = [];
const queryMock = vi.fn(async (_sql: string, _params?: unknown[]) => {
  const next = queryResponses.shift();
  return next ?? { rows: [] };
});
const releaseMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    connect: async () => ({ query: queryMock, release: releaseMock }),
  }),
}));

import { POST } from "@/app/api/admin/users/[id]/role/route";

const TARGET_ID = "11111111-1111-1111-1111-111111111111";

function req(role: string): Request {
  return new Request(`http://localhost/api/admin/users/${TARGET_ID}/role`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

function params() {
  return Promise.resolve({ id: TARGET_ID });
}

beforeEach(() => {
  adminOk = true;
  authUser = { isAdmin: true, userId: "actor-1" };
  queryResponses = [];
  queryMock.mockClear();
  releaseMock.mockClear();
  logAdminActionMock.mockClear();
});

describe("POST /api/admin/users/[id]/role", () => {
  it("blocks an admin from demoting their own account (self-lockout guard)", async () => {
    authUser = { isAdmin: true, userId: TARGET_ID };
    queryResponses = [{ rows: [{ id: TARGET_ID, role: "admin" }] }]; // SELECT id, role

    const res = await POST(req("user"), { params: params() });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("cannot_demote_self");
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it("blocks demoting the last remaining admin", async () => {
    authUser = { isAdmin: true, userId: "some-other-admin" };
    queryResponses = [
      { rows: [{ id: TARGET_ID, role: "admin" }] }, // SELECT id, role
      { rows: [{ c: 0 }] }, // COUNT other admins
    ];

    const res = await POST(req("user"), { params: params() });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("last_admin_lockout");
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it("allows demoting an admin when other admins remain, and logs the audit action", async () => {
    authUser = { isAdmin: true, userId: "some-other-admin" };
    queryResponses = [
      { rows: [{ id: TARGET_ID, role: "admin" }] }, // SELECT id, role
      { rows: [{ c: 1 }] }, // COUNT other admins — one remains
      { rows: [] }, // UPDATE users
      { rows: [] }, // UPDATE user_sessions
      { rows: [] }, // INSERT moderation_actions
      { rows: [] }, // COMMIT (no-op mock)
    ];

    const res = await POST(req("user"), { params: params() });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({
      action: "user.role_change",
      targetType: "user",
      targetId: TARGET_ID,
      details: { oldRole: "admin", newRole: "user" },
    });
  });

  it("rejects unauthenticated requests", async () => {
    adminOk = false;
    const res = await POST(req("admin"), { params: params() });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("forbidden");
  });
});
