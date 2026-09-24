import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import RideClient from "./RideClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "go" });
  return { title: t("rideMetaTitle"), robots: { index: false } };
}

export default async function RidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RideClient rideId={id} />;
}
