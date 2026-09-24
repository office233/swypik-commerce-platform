/**
 * Admin Moderation Queue — listă rapoarte
 */
import { dbQuery } from "@/lib/db";
import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = { reason?: string; status?: string };

type ReportRow = {
  video_id: string;
  reason: string;
  reports_count: number;
  first_reported_at: string;
  sample_report_id: string;
  title: string | null;
  thumbnail_url: string | null;
  is_hidden: boolean;
  creator_username: string | null;
  creator_id: string | null;
};

async function getReports(params: SearchParams, validReasons: string[]): Promise<ReportRow[]> {
  const status = params.status || "open";
  const reason = params.reason || null;
  const where: string[] = ["mr.status = $1", "mr.target_video_id IS NOT NULL"];
  const args: string[] = [status];
  if (reason && validReasons.includes(reason)) {
    args.push(reason);
    where.push(`mr.reason = $${args.length}`);
  }

  const { rows } = await dbQuery(
    `
    WITH grouped AS (
      SELECT
        mr.target_video_id,
        mr.reason,
        COUNT(*)::int AS reports_count,
        MIN(mr.created_at) AS first_reported_at,
        MAX(mr.id::text) AS sample_report_id
      FROM moderation_reports mr
      WHERE ${where.join(" AND ")}
      GROUP BY mr.target_video_id, mr.reason
    )
    SELECT
      g.target_video_id AS video_id,
      g.reason,
      g.reports_count,
      g.first_reported_at,
      g.sample_report_id,
      v.title,
      v.thumbnail_url,
      v.is_hidden,
      u.username AS creator_username,
      u.id AS creator_id
    FROM grouped g
    LEFT JOIN videos v ON v.id = g.target_video_id
    LEFT JOIN users u ON u.id = v.creator_id
    ORDER BY g.reports_count DESC, g.first_reported_at DESC
    LIMIT 100
    `,
    args
  );
  return rows;
}

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
    const t = await getTranslations("adminModeration");
  const locale = await getLocale();
  const REASONS: Record<string, string> = {
    spam: t("reasonSpam"),
    harassment: t("reasonHarassment"),
    hate: t("reasonHate"),
    violence: t("reasonViolence"),
    sexual_content: t("reasonSexualContent"),
    scam: t("reasonScam"),
    copyright: t("reasonCopyright"),
    other: t("reasonOther"),
  };
  const params = await searchParams;
  const reports = await getReports(params, Object.keys(REASONS));

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-black mb-4">{t("pageTitle")}</h1>

      <form method="GET" className="flex flex-wrap gap-2 mb-6">
        <select
          name="status"
          defaultValue={params.status || "open"}
          className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
        >
          <option value="open">{t("statusOpen")}</option>
          <option value="triaged">{t("statusTriaged")}</option>
          <option value="actioned">{t("statusActioned")}</option>
          <option value="dismissed">{t("statusDismissed")}</option>
        </select>
        <select
          name="reason"
          defaultValue={params.reason || ""}
          className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
        >
          <option value="">{t("allCategories")}</option>
          {Object.entries(REASONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-black text-white px-4 py-2 text-sm font-bold">
          {t("filter")}
        </button>
      </form>

      {reports.length === 0 ? (
        <p className="text-black/60">{t("noReports")}</p>
      ) : (
        <div className="bg-white rounded-2xl border border-black/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/5">
              <tr className="text-left">
                <th className="px-3 py-2">{t("thVideo")}</th>
                <th className="px-3 py-2">{t("thCreator")}</th>
                <th className="px-3 py-2">{t("thCategory")}</th>
                <th className="px-3 py-2">{t("thReports")}</th>
                <th className="px-3 py-2">{t("thFirst")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={`${r.video_id}-${r.reason}`} className="border-t border-black/5">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {r.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.thumbnail_url}
                          alt=""
                          className="w-16 h-20 object-cover rounded-md bg-black/10"
                        />
                      ) : (
                        <div className="w-16 h-20 bg-black/10 rounded-md" />
                      )}
                      <div className="max-w-[240px]">
                        <div className="font-bold line-clamp-2">{r.title || t("untitled")}</div>
                        {r.is_hidden && (
                          <span className="text-xs text-orange-600 font-bold">{t("hiddenBadge")}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.creator_username ? (
                      <Link
                        href={`/u/${r.creator_username}`}
                        className="text-[#FE2C55] hover:underline"
                      >
                        @{r.creator_username}
                      </Link>
                    ) : (
                      <span className="text-black/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{REASONS[r.reason] || r.reason}</td>
                  <td className="px-3 py-2 font-bold">{r.reports_count}</td>
                  <td className="px-3 py-2 text-black/60">
                    {new Intl.DateTimeFormat(locale, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(r.first_reported_at))}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/moderation/${r.sample_report_id}`}
                      className="rounded-lg bg-black text-white px-3 py-1.5 text-xs font-bold"
                    >
                      {t("view")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
