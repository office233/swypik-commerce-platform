import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Recorder from "@/components/reels/Recorder";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageMeta.reels");
  return {
    title: t("title") + " — Swypik",
    description: t("description"),
  };
}

export default async function ReelsRecordPage() {
  const auth = await getAuthUser();
  if (auth.role === "guest" || !auth.userId) {
    redirect("/auth/login?next=/reels/record");
  }
  // Pe Swypik orice utilizator autentificat poate filma — auto-promote la creator.
  if (auth.role !== "creator" && auth.role !== "admin") {
    await dbQuery(`UPDATE users SET role = 'creator' WHERE id = $1 AND role = 'shopper'`, [auth.userId]);
  }
  return <Recorder />;
}
