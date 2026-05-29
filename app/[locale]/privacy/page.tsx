import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default function PrivacyPage() {
  const t = useTranslations("privacy");
  // Sections 1-7 + 9 are regular title/body. Section 8 (DPO contact) has inline mailto.
  const regularSections = [1, 2, 3, 4, 5, 6, 7, 9].map((n) => ({
    title: t(`section${n}Title`),
    body: t(`section${n}Body`),
  }));

  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <div className="mx-auto max-w-2xl px-5 py-10 md:px-6 md:py-16 leading-relaxed">
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          📄 {t("draftNotice")}
        </div>

        <h1 className="mb-2 text-3xl font-black tracking-tight md:text-4xl">
          {t("h1")}
        </h1>
        <p className="mb-10 text-sm text-[#6E6E80]">{t("lastUpdated")}</p>

        {regularSections.slice(0, 7).map((s, idx) => (
          <section key={`pre-${idx}`} className="mb-8">
            <h2 className="mb-3 text-xl font-bold">{s.title}</h2>
            <p className="text-[15px] text-[#3C3C43] whitespace-pre-line">{s.body}</p>
          </section>
        ))}

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">{t("section8Title")}</h2>
          <p className="text-[15px] text-[#3C3C43] whitespace-pre-line">
            {t("section8BodyPrefix")}{" "}
            <a
              className="font-semibold text-[#10A37F] underline"
              href="mailto:privacy@swypik.com"
            >
              privacy@swypik.com
            </a>
            {t("section8BodySuffix")}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">{regularSections[7].title}</h2>
          <p className="text-[15px] text-[#3C3C43] whitespace-pre-line">{regularSections[7].body}</p>
        </section>
      </div>
    </main>
  );
}
