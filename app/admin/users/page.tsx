import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { requireAdminSession } from "@/lib/security/admin-auth";
import UserActions from "./UserActions";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  is_verified: boolean;
  suspended_until: string | null;
  suspension_reason: string | null;
  created_at: string;
  active_sessions: string;
  videos_count: string;
  followers_count: string;
};

const PAGE_SIZE = 50;

function fmtDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "-";
  }
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireAdminSession();
  const sp = await searchParams;
  const q = (sp.q || "").trim() || null;
  const status = ["active", "suspended", "admin"].includes(sp.status || "") ? sp.status! : "all";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let users: UserRow[] = [];
  let totalCount = 0;
  let loadError: string | null = null;

  try {
    const filterSql =
      status === "active"
        ? "(suspended_until IS NULL OR suspended_until < now())"
        : status === "suspended"
        ? "(suspended_until IS NOT NULL AND suspended_until > now())"
        : status === "admin"
        ? "(role = 'admin')"
        : "TRUE";

    const searchSql = q
      ? "AND (username ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%' OR display_name ILIKE '%'||$1||'%')"
      : "";

    const params: any[] = q ? [q, PAGE_SIZE, offset] : [PAGE_SIZE, offset];
    const limitIdx = q ? "$2" : "$1";
    const offsetIdx = q ? "$3" : "$2";

    const sql = `
      SELECT id, username, email, display_name, avatar_url, role, is_verified,
             suspended_until, suspension_reason, created_at,
             (SELECT COUNT(*) FROM user_sessions WHERE user_id = u.id AND expires_at > now() AND revoked_at IS NULL) AS active_sessions,
             (SELECT COUNT(*) FROM videos WHERE creator_id = u.id) AS videos_count,
             (SELECT COUNT(*) FROM follows WHERE following_user_id = u.id) AS followers_count
      FROM users u
      WHERE ${filterSql} ${searchSql}
      ORDER BY created_at DESC
      LIMIT ${limitIdx} OFFSET ${offsetIdx}
    `;
    const res = await dbQuery(sql, params);
    users = res.rows as UserRow[];

    const countSql = `SELECT COUNT(*)::int AS c FROM users u WHERE ${filterSql} ${searchSql}`;
    const countParams = q ? [q] : [];
    const cRes = await dbQuery(countSql, countParams);
    totalCount = cRes.rows[0]?.c || 0;
  } catch (err: any) {
    console.error("Error fetching users:", err);
    loadError = err.message || "Eroare la incarcarea utilizatorilor.";
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const statusTabs: { id: "all" | "active" | "suspended" | "admin"; label: string }[] = [
    { id: "all", label: "Toți" },
    { id: "active", label: "Activi" },
    { id: "suspended", label: "Suspendați" },
    { id: "admin", label: "Admini" },
  ];

  function tabHref(s: string) {
    const u = new URLSearchParams();
    if (s !== "all") u.set("status", s);
    if (q) u.set("q", q);
    return `/admin/users${u.toString() ? "?" + u.toString() : ""}`;
  }

  function pageHref(p: number) {
    const u = new URLSearchParams();
    if (status !== "all") u.set("status", status);
    if (q) u.set("q", q);
    if (p > 1) u.set("page", String(p));
    return `/admin/users${u.toString() ? "?" + u.toString() : ""}`;
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-3xl font-black text-[#0D0D0D] mb-6">Users</h1>

      <form method="get" action="/admin/users" className="mb-4 flex gap-2 max-w-xl">
        <input
          type="text"
          name="q"
          defaultValue={q || ""}
          placeholder="Caută după username, email sau nume..."
          className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
        />
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <button type="submit" className="rounded-lg bg-black text-white px-4 py-2 text-sm font-bold">
          Caută
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {statusTabs.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            className={`inline-flex items-center rounded-full px-4 py-2.5 text-sm font-bold border min-h-[40px] ${
              status === t.id ? "bg-[#0D0D0D] text-white border-[#0D0D0D]" : "bg-white text-[#0D0D0D] border-black/15"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {loadError}
        </div>
      )}

      <div className="mb-3 text-sm text-gray-600">
        {totalCount} utilizatori · pagina {page} din {totalPages}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E5E5E5] overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5] font-bold text-[#0D0D0D]">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Followers</th>
              <th className="px-4 py-3 text-right">Videos</th>
              <th className="px-4 py-3 text-right">Sesiuni</th>
              <th className="px-4 py-3">Inregistrat</th>
              <th className="px-4 py-3">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E5]">
            {users.map((u) => {
              const isSuspended = u.suspended_until && new Date(u.suspended_until) > new Date();
              return (
                <tr key={u.id} className="hover:bg-[#F7F7F8]/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/u/${u.username}`}
                          className="font-bold text-[#0D0D0D] hover:underline"
                          target="_blank"
                        >
                          @{u.username}
                        </Link>
                        {u.display_name && <div className="text-xs text-gray-500 truncate max-w-[160px]">{u.display_name}</div>}
                      </div>
                      {u.is_verified && <span title="Verified" className="text-blue-500 text-xs">✓</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{u.email || "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                        u.role === "admin"
                          ? "bg-purple-100 text-purple-700"
                          : u.role === "creator" || u.role === "seller"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isSuspended ? (
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700"
                        title={u.suspension_reason || ""}
                      >
                        Suspendat
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                        Activ
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.followers_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.videos_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.active_sessions}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <UserActions
                      userId={u.id}
                      username={u.username}
                      role={u.role}
                      isSuspended={!!isSuspended}
                    />
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && !loadError && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  Niciun utilizator gasit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-bold">
              ← Anterior
            </Link>
          )}
          <span className="text-sm text-gray-600 px-2">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-bold">
              Următor →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
