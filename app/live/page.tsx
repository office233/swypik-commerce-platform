import { dbQuery } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const { rows } = await dbQuery<any>(
    `SELECT ls.id, ls.title, ls.creator_id, ls.viewer_count, ls.started_at, u.username, u.avatar_url
       FROM live_streams ls
       LEFT JOIN users u ON u.id::text = ls.creator_id
      WHERE ls.status='live'
      ORDER BY ls.viewer_count DESC
      LIMIT 24`
  ).catch(() => ({ rows: [] as any[] }));
  return (
    <main className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">🔴 Live acum</h1>
      {rows.length === 0 ? (
        <p className="text-gray-500">Niciun stream activ.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {rows.map((s: any) => (
            <Link
              key={s.id}
              href={`/live/${s.id}`}
              className="aspect-[9/16] bg-gray-900 rounded-xl overflow-hidden relative block"
            >
              {s.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={s.avatar_url} alt="" className="w-full h-full object-cover opacity-60" />
              ) : null}
              <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-1 rounded font-bold">LIVE</div>
              <div className="absolute bottom-2 left-2 right-2 text-white">
                <p className="text-sm font-medium line-clamp-2">{s.title || "Live stream"}</p>
                <p className="text-xs opacity-80">👁 {s.viewer_count ?? 0}{s.username ? ` · @${s.username}` : ""}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
