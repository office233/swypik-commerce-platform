/**
 * Admin Moderation Queue — listă rapoarte
 */
import { dbQuery } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  spam: "Spam",
  harassment: "Hărțuire",
  hate: "Ură",
  violence: "Violență",
  sexual_content: "Conținut explicit",
  scam: "Fraudă",
  copyright: "Drepturi de autor",
  other: "Altul",
};

type SearchParams = { reason?: string; status?: string };

async function getReports(params: SearchParams) {
  const status = params.status || "open";
  const reason = params.reason || null;
  const where: string[] = ["mr.status = $1", "mr.target_video_id IS NOT NULL"];
  const args: any[] = [status];
  if (reason && REASONS[reason]) {
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
  const params = await searchParams;
  const reports = await getReports(params);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-black mb-4">Moderare conținut</h1>

      <form method="GET" className="flex flex-wrap gap-2 mb-6">
        <select
          name="status"
          defaultValue={params.status || "open"}
          className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
        >
          <option value="open">Deschise</option>
          <option value="triaged">În analiză</option>
          <option value="actioned">Rezolvate</option>
          <option value="dismissed">Respinse</option>
        </select>
        <select
          name="reason"
          defaultValue={params.reason || ""}
          className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
        >
          <option value="">Toate categoriile</option>
          {Object.entries(REASONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-black text-white px-4 py-2 text-sm font-bold">
          Filtrează
        </button>
      </form>

      {reports.length === 0 ? (
        <p className="text-black/60">Niciun raport.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/5">
              <tr className="text-left">
                <th className="px-3 py-2">Video</th>
                <th className="px-3 py-2">Creator</th>
                <th className="px-3 py-2">Categorie</th>
                <th className="px-3 py-2">Rapoarte</th>
                <th className="px-3 py-2">Primul</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r: any) => (
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
                        <div className="font-bold line-clamp-2">{r.title || "(fără titlu)"}</div>
                        {r.is_hidden && (
                          <span className="text-xs text-orange-600 font-bold">ASCUNS</span>
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
                    {new Date(r.first_reported_at).toLocaleDateString("ro-RO", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/moderation/${r.sample_report_id}`}
                      className="rounded-lg bg-black text-white px-3 py-1.5 text-xs font-bold"
                    >
                      Vezi
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
