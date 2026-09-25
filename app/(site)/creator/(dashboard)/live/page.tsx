import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import LiveStudioClient from "./LiveStudioClient";

export const dynamic = "force-dynamic";

type LiveStream = Parameters<typeof LiveStudioClient>[0]["streams"][number];

export default async function CreatorLivePage() {
  const session = await getAuthSession();
  if (!session) redirect("/auth?next=/creator/live");
  if (session.role !== "creator" && session.role !== "admin" && session.role !== "seller") {
    redirect("/become-a-creator");
  }
  const { rows } = await dbQuery<LiveStream>(
    `SELECT id, title, status, stream_key, rtmp_url, hls_url, viewer_count, peak_viewers,
            scheduled_at, started_at, ended_at, created_at
       FROM live_streams WHERE creator_id = $1
       ORDER BY created_at DESC LIMIT 50`,
    [session.userId],
  );
  return <LiveStudioClient streams={rows} />;
}
