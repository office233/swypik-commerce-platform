import Link from "next/link";
import type { Metadata } from "next";
import { languagesForMetadata } from "@/lib/seo/hreflang";
import { useTranslations } from "next-intl";

export const metadata: Metadata = {
  title: "Ajutor — Swypik",
  description: "Întrebări frecvente și sprijin pentru cumpărători și creatori Swypik.",
  alternates: {
    canonical: "https://swypik.com/help",
    languages: languagesForMetadata("/help"),
  },
};

const FAQ = [
  {
    q: "Cum cumpăr un produs?",
    a: "Deschide un clip, apasă pe produsul recomandat și parcurge checkout-ul. Plata se face securizat prin Stripe.",
  },
  {
    q: "Cât durează livrarea?",
    a: "Între 5 și 14 zile lucrătoare în România, în funcție de furnizor. Detaliile apar pe pagina produsului.",
  },
  {
    q: "Pot returna produsul?",
    a: "Da, în 14 zile de la primire. Mergi în Contul tău → Comenzi → alege comanda și apasă „Cere retur”.",
  },
  {
    q: "Cum devin creator/seller?",
    a: "Mergi pe pagina Devino Creator sau Devino Seller și completează formularul. Echipa noastră răspunde în 48h.",
  },
  {
    q: "Plățile sunt sigure?",
    a: "Toate plățile trec prin Stripe (PCI-DSS Level 1). Swypik nu stochează datele cardului tău.",
  },
];

export default function HelpPage() {
  const t = useTranslations("help");
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">{t("ajutorIntrebariFrecvente")}</h1>
      <p className="text-zinc-600 mb-8">{t("nuGasestiCeAi")} <a className="underline" href="mailto:suport@swypik.com">suport@swypik.com</a>.</p>
      <div className="space-y-4">
        {FAQ.map((item) => (
          <details key={item.q} className="rounded-lg border border-zinc-200 bg-white p-4">
            <summary className="cursor-pointer font-medium">{item.q}</summary>
            <p className="mt-2 text-zinc-700">{item.a}</p>
          </details>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/terms" className="underline">Termeni</Link>
        <Link href="/privacy" className="underline">{t("confidentialitate")}</Link>
        <Link href="/account/returns" className="underline">Retururi</Link>
        <Link href="/about" className="underline">Despre Swypik</Link>
      </div>
    </main>
  );
}
