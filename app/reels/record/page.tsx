import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Recorder from "@/components/reels/Recorder";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Filmează un clip | Swypik",
};

export default async function ReelsRecordPage() {
  const auth = await getAuthUser();
  if (auth.role === "guest" || !auth.userId) {
    redirect("/auth/login?next=/reels/record");
  }
  if (auth.role !== "creator" && auth.role !== "admin") {
    // Shopperii (și sellerii fără rol creator) trec mai întâi prin promovare.
    redirect("/become-a-creator");
  }
  return <Recorder />;
}
