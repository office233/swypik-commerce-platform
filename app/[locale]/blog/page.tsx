import { getTranslations } from "next-intl/server";
import { translateBlogCategory } from "@/lib/blog/categoryLabel";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { listBlogArticles } from "@/lib/db/blog-queries";

export const dynamic = "force-dynamic";
export const revalidate = 300; // ISR \u2014 refresh every 5 min

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";

type Props = { params: Promise<{ locale: string }> };


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blogIndex" });
  const tt = {
    metaTitle: t("metaTitle"), metaDesc: t("metaDesc"), keywords: t("keywords"),
    ogDesc: t("ogDesc"), breadcrumb: t("breadcrumb"), h1: t("h1"), subtitle: t("subtitle"),
    empty: t("empty"), read: t("read"), products: t("products"),
    collectionName: t("collectionName"), collectionDesc: t("collectionDesc"),
  };
  const localePrefix = locale && locale !== "ro" ? `/${locale}` : "";
  return {
    title: tt.metaTitle,
    description: tt.metaDesc,
    keywords: tt.keywords,
    alternates: {
      canonical: `${BASE_URL}${localePrefix}/blog`,
      languages: {
        ro: `${BASE_URL}/blog`,
        en: `${BASE_URL}/en/blog`,
        es: `${BASE_URL}/es/blog`,
        fr: `${BASE_URL}/fr/blog`,
        de: `${BASE_URL}/de/blog`,
        pt: `${BASE_URL}/pt/blog`,
        it: `${BASE_URL}/it/blog`,
        "x-default": `${BASE_URL}/blog`,
      },
      types: {
        "application/rss+xml": locale === "en"
          ? `${BASE_URL}/blog/rss.xml?locale=en`
          : `${BASE_URL}/blog/rss.xml`,
      },
    },
    openGraph: {
      title: tt.metaTitle,
      description: tt.ogDesc,
      url: `${BASE_URL}${localePrefix}/blog`,
      type: "website",
      images: [{ url: `${BASE_URL}/og-preview.webp`, width: 1200, height: 630 }],
    },
  };
}

export default async function BlogIndexPage({ params }: Props) {
  const tCat = await getTranslations("blogCategory");
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blogIndex" });
  const tt = {
    metaTitle: t("metaTitle"), metaDesc: t("metaDesc"), keywords: t("keywords"),
    ogDesc: t("ogDesc"), breadcrumb: t("breadcrumb"), h1: t("h1"), subtitle: t("subtitle"),
    empty: t("empty"), read: t("read"), products: t("products"),
    collectionName: t("collectionName"), collectionDesc: t("collectionDesc"),
  };
  const localePrefix = locale && locale !== "ro" ? `/${locale}` : "";
  const articles = await listBlogArticles({ limit: 24, locale });

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      {/* JSON-LD: CollectionPage + BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: tt.collectionName,
            url: `${BASE_URL}${localePrefix}/blog`,
            description: tt.collectionDesc,
            isPartOf: { "@type": "WebSite", name: "Swypik", url: BASE_URL },
            breadcrumb: {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Swypik", item: BASE_URL },
                { "@type": "ListItem", position: 2, name: tt.breadcrumb, item: `${BASE_URL}${localePrefix}/blog` },
              ],
            },
          }),
        }}
      />

      {/* Header */}
      <header className="relative overflow-hidden border-b border-zinc-200 bg-white">
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            background: `
              radial-gradient(at 20% 30%, rgba(124,58,237,.5) 0px, transparent 50%),
              radial-gradient(at 80% 70%, rgba(236,72,153,.4) 0px, transparent 50%)
            `,
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <nav className="text-sm text-zinc-500 mb-4">
            <Link href="/" className="hover:text-[#7C3AED]">Swypik</Link>
            <span className="mx-2">\u2014</span>
            <span className="text-zinc-900">{tt.breadcrumb}</span>
          </nav>
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight">
            <span
              style={{
                background: "linear-gradient(135deg,#7C3AED,#EC4899)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {tt.h1}
            </span>
          </h1>
          <p className="mt-3 text-base sm:text-lg text-zinc-600 max-w-2xl">
            {tt.subtitle}
          </p>
        </div>
      </header>

      {/* Articles grid */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {articles.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">\ud83d\udceb</div>
            <p className="text-zinc-600">{tt.empty}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((a) => (
              <Link
                key={a.id}
                href={`${localePrefix}/blog/${a.slug}`}
                className="group block rounded-2xl overflow-hidden border border-zinc-200 bg-white hover:-translate-y-1 hover:shadow-lg transition"
              >
                <div className="relative aspect-[16/10] bg-zinc-100 overflow-hidden">
                  {a.heroImageUrl ? (
                    <Image
                      src={a.heroImageUrl}
                      alt={a.heroImageAlt || a.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : null}
                </div>
                <div className="p-5">
                  <div className="text-xs text-zinc-500 mb-2 flex items-center gap-2">
                    {a.category ? <span className="font-bold uppercase tracking-wider text-[#7C3AED]">{translateBlogCategory(a.category, tCat)}</span> : null}
                    <span>\u2014</span>
                    <span>{a.readTimeMin} {tt.read}</span>
                  </div>
                  <h2 className="font-bold text-lg leading-snug text-[#0D0D0D] line-clamp-2">{a.title}</h2>
                  {a.excerpt ? (
                    <p className="mt-2 text-sm text-zinc-600 line-clamp-2">{a.excerpt}</p>
                  ) : null}
                  <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                    {a.authorAvatar ? (
                      <span className="w-6 h-6 rounded-full bg-zinc-200 overflow-hidden">
                        <Image src={a.authorAvatar} alt={a.authorName} width={24} height={24} className="object-cover" />
                      </span>
                    ) : (
                      <span
                        className="w-6 h-6 rounded-full"
                        style={{ background: "linear-gradient(135deg,#7C3AED,#EC4899)" }}
                      />
                    )}
                    <span className="font-semibold text-zinc-700">{a.authorName}</span>
                    {a.linkedProductCount > 0 ? (
                      <>
                        <span>\u2014</span>
                        <span>\ud83d\uded2 {a.linkedProductCount} {tt.products}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}