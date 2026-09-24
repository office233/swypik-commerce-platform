import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import UploadClient from "./UploadClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Adaugă video | Swypik",
};

export default async function UploadPage() {
  const auth = await getAuthUser();

  if (auth.role === "guest" || !auth.userId) {
    redirect("/auth?next=/upload");
  }

  // Bug fix (i18n/UI audit 2026-09-24): this page used to silently run
  // `UPDATE users SET role='creator'` for any signed-in shopper who simply
  // opened /upload, bypassing the explicit creator opt-in at
  // /become-a-creator (POST /api/creator/apply). Never mutate roles on a
  // page GET — send non-creators to the explicit apply flow instead. The
  // upload API routes (app/api/creator/upload-session, etc.) already reject
  // non-creator/seller/admin roles server-side regardless of this gate.
  if (auth.role !== "creator" && auth.role !== "admin" && auth.role !== "seller") {
    redirect("/become-a-creator");
  }

  return <UploadClient />;
}
