import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Recorder from "@/components/reels/Recorder";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "recorder" });
  return { title: t("recordPageTitle") };
}

export default async function ReelsRecordPage() {
  const auth = await getAuthUser();
  if (auth.role === "guest" || !auth.userId) {
    redirect("/auth/login?next=/reels/record");
  }
  // Bug fix (i18n/UI audit 2026-09-24): same issue as app/[locale]/upload/page.tsx
  // — never silently promote a shopper to creator on a page GET. Send them to
  // the explicit apply flow at /become-a-creator instead.
  if (auth.role !== "creator" && auth.role !== "admin" && auth.role !== "seller") {
    redirect("/become-a-creator");
  }
  return <Recorder />;
}
