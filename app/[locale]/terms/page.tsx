import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default function TermsPage() {
  const t = useTranslations("terms");
  const sectionCount = 8;
  const sections = Array.from({ length: sectionCount }, (_, i) => i + 1).map((n) => ({
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

        {sections.map((s, idx) => (
          <section key={idx} className="mb-8">
            <h2 className="mb-3 text-xl font-bold">{s.title}</h2>
            <p className="text-[15px] text-[#3C3C43] whitespace-pre-line">{s.body}</p>
          </section>
        ))}

        <section className="mb-8">
          <p className="text-[15px] text-[#3C3C43]">
            {t("contactPrefix")}{" "}
            <a
              className="font-semibold text-[#10A37F] underline"
              href="mailto:legal@swypik.com"
            >
              legal@swypik.com
            </a>
            {t("contactSuffix")}
          </p>
        </section>
      </div>
    </main>
  );
}
