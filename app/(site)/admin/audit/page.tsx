/**
 * Admin Audit Log — read-only, paginated, newest-first view of `admin_audit_log`
 * (written by lib/security/admin-audit.ts after every admin mutation).
 */
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { dbQuery } from "@/lib/db";
import { requireAdminSession } from "@/lib/security/admin-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_kind: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
  actor_username: string | null;
};

const PAGE_SIZE = 50;

function fmtDate(d: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(d));
  } catch {
    return d;
  }
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  await requireAdminSession();
  const t = await getTranslations("adminAudit");
  const locale = await getLocale();
  const sp = await searchParams;
  const actionPrefix = (sp.action || "").trim();
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let rows: AuditRow[] = [];
  let totalCount = 0;
  let loadError: string | null = null;
  let actionPrefixes: string[] = [];

  try {
    const whereSql = actionPrefix ? "WHERE a.action ILIKE $1 || '%'" : "";
    const params: (string | number)[] = actionPrefix
      ? [actionPrefix, PAGE_SIZE, offset]
      : [PAGE_SIZE, offset];
    const limitIdx = actionPrefix ? "$2" : "$1";
    const offsetIdx = actionPrefix ? "$3" : "$2";

    const { rows: r } = await dbQuery<AuditRow>(
      `SELECT a.id::text, a.actor_user_id::text, a.actor_kind, a.action, a.target_type,
              a.target_id, a.details, a.ip, a.created_at::text,
              u.username AS actor_username
         FROM admin_audit_log a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ${whereSql}
        ORDER BY a.created_at DESC
        LIMIT ${limitIdx} OFFSET ${offsetIdx}`,
      params,
    );
    rows = r;

    const countParams = actionPrefix ? [actionPrefix] : [];
    const { rows: cRows } = await dbQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM admin_audit_log a ${actionPrefix ? "WHERE a.action ILIKE $1 || '%'" : ""}`,
      countParams,
    );
    totalCount = cRows[0]?.c || 0;

    const { rows: distinctActions } = await dbQuery<{ prefix: string }>(
      `SELECT DISTINCT split_part(action, '.', 1) AS prefix FROM admin_audit_log ORDER BY 1`,
    );
    actionPrefixes = distinctActions.map((d) => d.prefix);
  } catch (err) {
    logger.error({ err }, "[admin/audit] failed to load audit log");
    loadError = t("loadError");
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function pageHref(p: number) {
    const u = new URLSearchParams();
    if (actionPrefix) u.set("action", actionPrefix);
    if (p > 1) u.set("page", String(p));
    return `/admin/audit${u.toString() ? "?" + u.toString() : ""}`;
  }

  function filterHref(prefix: string) {
    const u = new URLSearchParams();
    if (prefix) u.set("action", prefix);
    return `/admin/audit${u.toString() ? "?" + u.toString() : ""}`;
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-3xl font-black text-[#0D0D0D] mb-2">{t("pageTitle")}</h1>
      <p className="text-sm text-[#6E6E80] mb-6">{t("pageSubtitle")}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={filterHref("")}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
            !actionPrefix ? "bg-[#0D0D0D] text-white" : "bg-black/5 text-[#0D0D0D] hover:bg-black/10"
          }`}
        >
          {t("allActions")}
        </Link>
        {actionPrefixes.map((prefix) => (
          <Link
            key={prefix}
            href={filterHref(prefix)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              actionPrefix === prefix ? "bg-[#0D0D0D] text-white" : "bg-black/5 text-[#0D0D0D] hover:bg-black/10"
            }`}
          >
            {prefix}
          </Link>
        ))}
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {loadError}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-b border-black/10 text-[11px] uppercase tracking-wide text-[#6E6E80]">
                <tr>
                  <th className="px-4 py-3">{t("thTime")}</th>
                  <th className="px-4 py-3">{t("thAction")}</th>
                  <th className="px-4 py-3">{t("thTarget")}</th>
                  <th className="px-4 py-3">{t("thActor")}</th>
                  <th className="px-4 py-3">{t("thIp")}</th>
                  <th className="px-4 py-3">{t("thDetails")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-black/5 last:border-0 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-[#0D0D0D]/70">{fmtDate(r.created_at, locale)}</td>
                    <td className="px-4 py-3 font-bold">{r.action}</td>
                    <td className="px-4 py-3">
                      {r.target_type ? (
                        <>
                          <span className="text-[#0D0D0D]/70">{r.target_type}</span>
                          {r.target_id && (
                            <span className="block font-mono text-[10px] text-[#A1A1AA] break-all">{r.target_id}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-[#A1A1AA]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.actor_username ? (
                        <span className="font-medium">{r.actor_username}</span>
                      ) : (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          {t(r.actor_kind === "admin_secret" ? "actorSharedSecret" : "actorUnknown")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#0D0D0D]/70">{r.ip || "—"}</td>
                    <td className="px-4 py-3 max-w-[320px]">
                      <code className="block whitespace-pre-wrap break-all font-mono text-[10px] text-[#0D0D0D]/60">
                        {Object.keys(r.details || {}).length > 0 ? JSON.stringify(r.details) : "—"}
                      </code>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[#A1A1AA]">
                      {t("empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#6E6E80]">{t("pageOf", { page, totalPages, total: totalCount })}</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={pageHref(Math.max(1, page - 1))}
                  aria-disabled={page <= 1}
                  className={`rounded-lg border border-black/10 px-3 py-1.5 text-xs font-bold ${
                    page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-black/5"
                  }`}
                >
                  {t("previousPage")}
                </Link>
                <Link
                  href={pageHref(Math.min(totalPages, page + 1))}
                  aria-disabled={page >= totalPages}
                  className={`rounded-lg border border-black/10 px-3 py-1.5 text-xs font-bold ${
                    page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-black/5"
                  }`}
                >
                  {t("nextPage")}
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
