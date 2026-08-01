import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/feature-flags";
import GoClient from "./GoClient";
import PermissionsPrompt from "@/components/pwa/PermissionsPrompt";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("goTitle"), description: t("goDescription") };
}

export default function GoPage() {
  if (!isEnabled("go")) notFound();
  return (
    <>
      <GoClient />
      <PermissionsPrompt vertical="go" />
    </>
  );
}
