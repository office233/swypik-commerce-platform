import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Recorder from "@/components/reels/Recorder";
import { getCreatorUserId } from "@/lib/creator/session";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Filmează un Reel | Swypik",
};

export default async function ReelsRecordPage() {
  const creatorId = await getCreatorUserId();
  if (!creatorId) {
    redirect("/auth/login?next=/reels/record");
  }
  const { rows } = await dbQuery<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [creatorId],
  );
  const role = rows[0]?.role;
  if (!role || !["creator", "admin"].includes(role)) {
    redirect("/become-a-creator");
  }
  return <Recorder />;
}
