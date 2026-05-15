import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, Video, TrendingUp, DollarSign } from "lucide-react";
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

  if (auth.role === "creator" || auth.role === "admin") {
    return <UploadClient />;
  }

  // Shopper / seller fără rol creator: ecran de upsell.
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-white to-[#FAFAFA] dark:from-black dark:to-[#0A0A0A] px-5 pt-10 pb-28">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#A855F7] shadow-lg mb-6">
          <Sparkles size={32} strokeWidth={2.2} className="text-white" />
        </div>

        <h1 className="text-3xl font-bold text-[#0D0D0D] dark:text-white tracking-tight mb-2">
          Devino creator pentru a încărca video
        </h1>
        <p className="text-[15px] text-[#6E6E80] dark:text-[#A1A1AA] leading-relaxed mb-8">
          Postează clipuri shoppable cu produsele tale preferate, construiește o comunitate și câștigă comisioane la fiecare vânzare.
        </p>

        <ul className="space-y-4 mb-10">
          <li className="flex gap-3 items-start">
            <span className="flex-shrink-0 mt-0.5 w-9 h-9 rounded-xl bg-[#F4F4F5] dark:bg-[#1F1F1F] flex items-center justify-center">
              <Video size={18} className="text-[#7C3AED]" />
            </span>
            <div>
              <p className="font-semibold text-[#0D0D0D] dark:text-white text-[15px]">Postează clipuri shoppable</p>
              <p className="text-[13px] text-[#6E6E80] dark:text-[#A1A1AA]">Filmează direct sau încarcă video și atașează produse.</p>
            </div>
          </li>
          <li className="flex gap-3 items-start">
            <span className="flex-shrink-0 mt-0.5 w-9 h-9 rounded-xl bg-[#F4F4F5] dark:bg-[#1F1F1F] flex items-center justify-center">
              <DollarSign size={18} className="text-[#A855F7]" />
            </span>
            <div>
              <p className="font-semibold text-[#0D0D0D] dark:text-white text-[15px]">Câștigă comisioane</p>
              <p className="text-[13px] text-[#6E6E80] dark:text-[#A1A1AA]">Primești un procent din fiecare comandă generată de clipurile tale.</p>
            </div>
          </li>
          <li className="flex gap-3 items-start">
            <span className="flex-shrink-0 mt-0.5 w-9 h-9 rounded-xl bg-[#F4F4F5] dark:bg-[#1F1F1F] flex items-center justify-center">
              <TrendingUp size={18} className="text-[#7C3AED]" />
            </span>
            <div>
              <p className="font-semibold text-[#0D0D0D] dark:text-white text-[15px]">Crește-ți audiența</p>
              <p className="text-[13px] text-[#6E6E80] dark:text-[#A1A1AA]">Profil dedicat, statistici și unelte AI pentru caption și hashtag-uri.</p>
            </div>
          </li>
        </ul>

        <Link
          href="/become-a-creator"
          className="flex items-center justify-center w-full h-12 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white font-semibold text-[15px] shadow-md active:scale-[0.98] transition-transform"
        >
          Aplică pentru cont de creator
        </Link>

        <Link
          href="/explore"
          className="flex items-center justify-center w-full h-12 mt-3 rounded-2xl text-[#6E6E80] dark:text-[#A1A1AA] font-medium text-[14px] hover:text-[#0D0D0D] dark:hover:text-white transition-colors"
        >
          Continuă explorarea
        </Link>
      </div>
    </main>
  );
}
