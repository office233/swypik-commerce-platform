import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Video, DollarSign, Users, TrendingUp, ArrowRight } from "lucide-react";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import BecomeCreatorButton from "./BecomeCreatorButton";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("becomeacreator");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

type Benefit = {
  icon: typeof Video;
  title: string;
  body: string;
};

export default async function BecomeACreatorPage() {
  const t = await getTranslations("becomeacreator");
  const BENEFITS: Benefit[] = [
    { icon: Video, title: t("benefit1Title"), body: t("benefit1Body") },
    { icon: DollarSign, title: t("benefit2Title"), body: t("benefit2Body") },
    { icon: TrendingUp, title: t("benefit3Title"), body: t("benefit3Body") },
    { icon: Users, title: t("benefit4Title"), body: t("benefit4Body") },
  ];
  const auth = await getAuthUser();

  if (auth.role === "creator" || auth.role === "admin") {
    redirect("/upload");
  }

  const isLoggedIn = auth.role === "shopper" || auth.role === "seller";

  return (
    <div className="min-h-screen bg-black text-white">
      <section className="px-6 pt-16 pb-10 max-w-2xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
          
          {t("devinoCreatorPeSwypik")}
        </h1>
        <p className="text-base sm:text-lg text-white/70 max-w-xl mx-auto">
          
          {t("transformatiPasiuneaPentruShopping")}
        </p>
      </section>

      <section className="px-6 pb-10 max-w-2xl mx-auto">
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BENEFITS.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#FF6B47] flex items-center justify-center">
                <Icon size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="text-xs text-white/60 mt-1 leading-relaxed">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-6 pb-16 max-w-2xl mx-auto">
        {isLoggedIn ? (
          <BecomeCreatorButton />
        ) : (
          <Link
            href="/auth/login?next=/become-a-creator"
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#FF6B47] text-white font-bold text-base shadow-lg active:scale-[0.98] transition"
          >
            
            {t("logheazateCaSaContinui")} <ArrowRight size={18} />
          </Link>
        )}
        <p className="mt-4 text-center text-xs text-white/40">
          
          {t("tePotiIntoarceOricand")}
        </p>
      </section>
    </div>
  );
}
