import { getTranslations } from "next-intl/server";
import StaysCalendarClient from "./StaysCalendarClient";

export async function generateMetadata() {
  const t = await getTranslations("sellerStaysCalendar");
  return { title: t("pageTitle") };
}

export default function StaysCalendarPage() {
  return <StaysCalendarClient />;
}
