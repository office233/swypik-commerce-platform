import Link from "next/link";
import { Radio } from "lucide-react";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export default async function LiveBadge() {
  const session = await getAuthSession();
  let rows: { id: string; title: string; display_name: string | null; username: string | null; avatar_url: string | null }[] = [];
  try {
    if (session) {
      const q = await dbQuery<any>(
        `SELECT ls.id, ls.title, u.display_name, u.username, u.avatar_url
           FROM live_streams ls
           JOIN follows f ON f.following_user_id::text = ls.creator_id
           LEFT JOIN users u ON u.id::text = ls.creator_id
          WHERE ls.status = 'live' AND f.follower_user_id = $1::uuid
          ORDER BY ls.started_at DESC LIMIT 6`,
        [session.userId],
      );
      rows = q.rows;
    } else {
      const q = await dbQuery<any>(
        `SELECT ls.id, ls.title, u.display_name, u.username, u.avatar_url
           FROM live_streams ls
           LEFT JOIN users u ON u.id::text = ls.creator_id
          WHERE ls.status = 'live'
          ORDER BY ls.viewer_count DESC, ls.started_at DESC LIMIT 6`,
      );
      rows = q.rows;
    }
  } catch {
    rows = [];
  }
  if (!rows.length) return null;
  return (
    <div className="absolute top-14 left-0 right-0 z-30 px-3 overflow-x-auto pointer-events-auto">
      <div className="flex gap-2">
        {rows.map((s) => (
          <Link key={s.id} href={`/live/${s.id}`} className="flex items-center gap-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full shadow-lg whitespace-nowrap">
            <Radio className="w-3 h-3 animate-pulse" />
            <span className="font-bold">LIVE</span>
            <span className="truncate max-w-[140px]">{s.display_name || s.username || "Creator"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
