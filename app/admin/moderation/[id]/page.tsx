/**
 * Admin Moderation — detail raport video
 */
import { dbQuery } from "@/lib/db";
import { getTranslations, getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import ModerationActions from "./ModerationActions";

export const dynamic = "force-dynamic";

async function getReportDetail(reportId: string) {
  const { rows } = await dbQuery(
    `
    SELECT mr.id, mr.reason, mr.status, mr.note, mr.created_at,
           mr.target_video_id,
           v.title, v.thumbnail_url, v.playback_url, v.is_hidden, v.status AS video_status,
           u.id AS creator_id, u.username AS creator_username,
           u.suspended_until,
           rep.username AS reporter_username
    FROM moderation_reports mr
    LEFT JOIN videos v ON v.id = mr.target_video_id
    LEFT JOIN users u ON u.id = v.creator_id
    LEFT JOIN users rep ON rep.id = mr.reporter_user_id
    WHERE mr.id = $1
    LIMIT 1
    `,
    [reportId]
  );
  return rows[0] || null;
}

type RelatedReport = {
  id: string;
  reason: string;
  status: string;
  note: string | null;
  created_at: string;
  reporter_username: string | null;
};

async function getRelatedReports(videoId: string): Promise<RelatedReport[]> {
  const { rows } = await dbQuery(
    `
    SELECT mr.id, mr.reason, mr.status, mr.note, mr.created_at,
           u.username AS reporter_username
    FROM moderation_reports mr
    LEFT JOIN users u ON u.id = mr.reporter_user_id
    WHERE mr.target_video_id = $1
    ORDER BY mr.created_at DESC
    LIMIT 50
    `,
    [videoId]
  );
  return rows;
}

export default async function ModerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();
  const r = await getReportDetail(id);
  if (!r) return notFound();
  const related = r.target_video_id ? await getRelatedReports(r.target_video_id) : [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/admin/moderation" className="text-sm text-[#FE2C55] hover:underline">
        ← {t("backToQueue")}
      </Link>
      <h1 className="text-2xl font-black mt-2 mb-4">{t("videoReportTitle")}</h1>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-black/10 p-4">
          <h2 className="font-bold mb-3">{t("reportedVideo")}</h2>
          <div className="flex gap-3">
            {r.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.thumbnail_url}
                alt=""
                className="w-32 h-44 object-cover rounded-lg bg-black/10"
              />
            ) : (
              <div className="w-32 h-44 bg-black/10 rounded-lg" />
            )}
            <div className="flex-1 text-sm">
              <div className="font-bold">{r.title || t("untitled")}</div>
              <div className="text-black/60 mt-1">
                {t("creatorLabel")}:{" "}
                {r.creator_username ? (
                  <Link href={`/u/${r.creator_username}`} className="text-[#FE2C55]">
                    @{r.creator_username}
                  </Link>
                ) : (
                  "—"
                )}
              </div>
              <div className="text-black/60">{t("statusLabel")}: {r.video_status}</div>
              {r.is_hidden && (
                <span className="inline-block mt-1 text-xs font-bold text-orange-600">
                  {t("hiddenBadge")}
                </span>
              )}
              {r.suspended_until && (
                <div className="mt-1 text-xs font-bold text-red-600">
                  {t("suspendedUntil")}{" "}
                  {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(r.suspended_until))}
                </div>
              )}
              {r.playback_url && (
                <a
                  href={r.playback_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 text-xs text-[#FE2C55] hover:underline"
                >
                  {t("openPlayback")} ↗
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/10 p-4">
          <h2 className="font-bold mb-3">{t("currentReport")}</h2>
          <dl className="text-sm space-y-1">
            <div>
              <dt className="inline font-bold">{t("categoryLabel")}: </dt>
              <dd className="inline">{REASONS[r.reason] || r.reason}</dd>
            </div>
            <div>
              <dt className="inline font-bold">{t("statusLabel")}: </dt>
              <dd className="inline">{r.status}</dd>
            </div>
            <div>
              <dt className="inline font-bold">{t("reporterLabel")}: </dt>
              <dd className="inline">
                {r.reporter_username ? `@${r.reporter_username}` : t("anonymous")}
              </dd>
            </div>
            <div>
              <dt className="inline font-bold">{t("dateLabel")}: </dt>
              <dd className="inline">
                {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(r.created_at))}
              </dd>
            </div>
            {r.note && (
              <div className="mt-2">
                <dt className="font-bold">{t("noteLabel")}</dt>
                <dd className="text-black/70 whitespace-pre-wrap">{r.note}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <ModerationActions reportId={r.id} videoId={r.target_video_id} creatorId={r.creator_id} />

      <div className="mt-6 bg-white rounded-2xl border border-black/10 p-4">
        <h2 className="font-bold mb-3">{t("allReportsOnVideo", { count: related.length })}</h2>
        <ul className="text-sm divide-y divide-black/5">
          {related.map((rr) => (
            <li key={rr.id} className="py-2">
              <span className="font-bold">{REASONS[rr.reason] || rr.reason}</span>
              <span className="text-black/60">
                {" "}
                · {rr.reporter_username ? `@${rr.reporter_username}` : t("anonymous")} ·{" "}
                {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(rr.created_at))} · {rr.status}
              </span>
              {rr.note && <div className="text-black/70 mt-1">{rr.note}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
