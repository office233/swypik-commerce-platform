import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Recorder from "@/components/reels/Recorder";
import { getCreatorUserId } from "@/lib/creator/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Filmează un clip | Swypik",
};

export default async function ReelsRecordPage() {
  const userId = await getCreatorUserId();
  if (!userId) {
    redirect("/auth/login?next=/reels/record");
  }
  // Toți userii logați pot posta clipuri. Monetizarea (comisioane) se activează
  // separat când userul devine creator afiliat (Stripe Connect + role=creator).
  return <Recorder />;
}
