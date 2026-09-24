import { getTranslations } from "next-intl/server";
import AppStoreClient from "./AppStoreClient";

export async function generateMetadata() {
  const t = await getTranslations("appStore");
  return { title: `${t("title")} — Swypik` };
}

export default function AppStorePage() {
  return <AppStoreClient />;
}
