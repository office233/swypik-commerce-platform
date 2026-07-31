import Link from "next/link";
import type { Metadata } from "next";
import { languagesForMetadata } from "@/lib/seo/hreflang";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { APP_URL } from "@/lib/app-url";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("aboutTitle"),
    description: t("aboutDescription"),
    alternates: {
      canonical: `${APP_URL}/about`,
      languages: languagesForMetadata("/about"),
    },
  };
}

export default function AboutPage() {
  const t = useTranslations("about");
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold mb-4">Despre Swypik</h1>
      <p className="text-zinc-700 mb-6">
        
        {t("swypikEstePlatformaRomaneasca")}
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">Ce facem diferit</h2>
      <ul className="list-disc pl-6 space-y-2 text-zinc-700">
        <li><strong>Curatare AI:</strong>  {t("fiecareProdusPrimesteUn")}</li>
        <li><strong>Video-first:</strong>  {t("veziProdusulInActiune")}</li>
        <li><strong>Creatori locali:</strong>  {t("sprijinimCreatoriiRomaniCare")}</li>
        <li><strong>Comunitate:</strong>  {t("voteazaMeritaSauNu")}</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 mb-3">{t("cumFunctioneaza")}</h2>
      <ol className="list-decimal pl-6 space-y-2 text-zinc-700">
        <li>{t("descoperiUnProdusIntrun")} <Link href="/explore" className="underline">/explore</Link>.</li>
        <li>{t("verificiScorulSwypikRecenziile")}</li>
        <li>{t("adaugiInCosSi")}</li>
        <li>{t("primestiProdusulIn514")}</li>
      </ol>

      <h2 className="text-xl font-semibold mt-8 mb-3">Contact</h2>
      <p className="text-zinc-700">
        Email: <a className="underline" href="mailto:hello@swypik.com">hello@swypik.com</a><br />
        Suport: <a className="underline" href="mailto:suport@swypik.com">suport@swypik.com</a>
      </p>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/help" className="underline">Ajutor</Link>
        <Link href="/terms" className="underline">Termeni</Link>
        <Link href="/privacy" className="underline">{t("confidentialitate")}</Link>
        <Link href="/become-a-creator" className="underline">Devino creator</Link>
        <Link href="/become-a-seller" className="underline">Devino seller</Link>
      </div>
    </main>
  );
}
