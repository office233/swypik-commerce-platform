import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import UploadClient from "./UploadClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageMeta.upload");
  return {
    title: t("title") + " — Swypik",
    description: t("description"),
  };
}

export default async function UploadPage() {
  const auth = await getAuthUser();

  if (auth.role === "guest" || !auth.userId) {
    redirect("/auth?next=/upload");
  }

  // Pe Swypik orice utilizator autentificat este creator by default.
  // Dacă cineva încă mai are role='shopper' din vechea schemă, îl promovăm
  // automat la 'creator' la prima vizită pe /upload — fără ecran de apply.
  if (auth.role !== "creator" && auth.role !== "admin") {
    await dbQuery(`UPDATE users SET role = 'creator' WHERE id = $1 AND role = 'shopper'`, [auth.userId]);
  }

  return <UploadClient />;
}
