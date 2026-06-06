import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import CheckoutForm from "@/components/CheckoutForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageMeta.checkout");
  return {
    title: t("title") + " — Swypik",
    description: t("description"),
  };
}

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-white text-[#0D0D0D]">
      <CheckoutForm />
    </div>
  );
}
