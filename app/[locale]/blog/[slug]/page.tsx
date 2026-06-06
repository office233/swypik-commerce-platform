import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { translateBlogCategory } from "@/lib/blog/categoryLabel";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getBlogArticleBySlug } from "@/lib/db/blog-queries";
import { getCheckoutProductById } from "@/lib/db/product-queries";
import BlogArticleBody from "@/components/blog/BlogArticleBody";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";

type Props = { params: Promise<{ slug: string; locale: string }> };

const T = {
  ro: { notFound: "Articol negăsit | Swypik", fallbackDesc: "Ghid Swypik", guides: "Ghiduri", read: "min citire", backHub: "← Vezi toate ghidurile" },
  en: { notFound: "Article not found | Swypik", fallbackDesc: "Swypik Guide", guides: "Guides", read: "min read", backHub: "← See all guides" },
} as const;
function tStrings(loc: string) { return (T as any)[loc] || T.ro; }

function priceCurrency(locale: string): string {
  return locale === "en" ? "EUR" : "RON";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params;
  const tt = tStrings(locale);
  const article = await getBlogArticleBySlug(slug, locale);
  if (!article) return { title: tt.notFound };

  const title = article.seoTitle || `${article.title} | Swypik`;
  const description = article.seoDescription || article.excerpt || tt.fallbackDesc;
  const ogImage = article.ogImageUrl || article.heroImageUrl || `${BASE_URL}/og-preview.webp`;
  const localePrefix = locale && locale !== "ro" ? `/${locale}` : "";
  const canonical = `${BASE_URL}${localePrefix}/blog/${article.slug}`;
  const rawUrl = `${BASE_URL}/blog/${article.slug}/raw${locale === "en" ? "?locale=en" : ""}`;

  return {
    title,
    description,
    keywords: article.seoKeywords.length ? article.seoKeywords.join(", ") : undefined,
    alternates: {
      canonical,
      languages: {
        ro: `${BASE_URL}/blog/${article.slug}`,
        en: `${BASE_URL}/en/blog/${article.slug}`,
        "x-default": `${BASE_URL}/blog/${article.slug}`,
      },
      types: {
        "application/rss+xml": locale === "en"
          ? `${BASE_URL}/blog/rss.xml?locale=en`
          : `${BASE_URL}/blog/rss.xml`,
        "text/markdown": rawUrl,
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      publishedTime: article.publishedAt || undefined,
      authors: [article.authorName],
      tags: article.tags,
      images: [{ url: ogImage, width: 1200, height: 630, alt: article.heroImageAlt || article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    other: {
      "ai:raw-markdown": rawUrl,
    },
  };
}

type LinkedProduct = NonNullable<Awaited<ReturnType<typeof getCheckoutProductById>>>;

async function loadLinkedProducts(ids: string[]): Promise<LinkedProduct[]> {
  if (!ids?.length) return [];
  const settled = await Promise.allSettled(ids.slice(0, 20).map((id) => getCheckoutProductById(id)));
  const out: LinkedProduct[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) out.push(s.value);
  }
  return out;
}

export default async function BlogArticlePage({ params }: Props) {
  const { slug, locale } = await params;
  const tCat = await getTranslations({ locale, namespace: "blogCategory" });
  const tt = tStrings(locale);
  const article = await getBlogArticleBySlug(slug, locale);
  if (!article) notFound();

  const localePrefix = locale && locale !== "ro" ? `/${locale}` : "";
  const canonical = `${BASE_URL}${localePrefix}/blog/${article.slug}`;
  const publishedISO = article.publishedAt || new Date().toISOString();

  const linkedProducts = await loadLinkedProducts(article.linkedProductIds);
  const productMentions = linkedProducts.map((p) => ({
    "@type": "Product",
    name: p.title,
    image: p.image,
    url: `${BASE_URL}${localePrefix}/product/${p.productId}`,
  }));

  const itemListLd = linkedProducts.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: article.title,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: linkedProducts.length,
    itemListElement: linkedProducts.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.title,
        image: p.image,
        url: `${BASE_URL}${localePrefix}/product/${p.productId}`,
        category: p.category,
        offers: {
          "@type": "Offer",
          price: p.price.toFixed(2),
          priceCurrency: priceCurrency(locale),
          availability: "https://schema.org/InStock",
          url: `${BASE_URL}${localePrefix}/product/${p.productId}`,
        },
      },
    })),
  } : null;

  const articleLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt || article.seoDescription,
    image: article.heroImageUrl ? [article.heroImageUrl] : undefined,
    datePublished: publishedISO,
    dateModified: publishedISO,
    author: { "@type": "Organization", name: article.authorName, url: BASE_URL },
    publisher: {
      "@type": "Organization",
      name: "Swypik",
      logo: { "@type": "ImageObject", url: `${BASE_URL}/icon-512.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    articleSection: article.category ? translateBlogCategory(article.category, tCat) : undefined,
    keywords: article.tags.join(", "),
    inLanguage: locale,
  };
  if (productMentions.length) {
    articleLd.mentions = productMentions;
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      {/* JSON-LD Article + Breadcrumb + ItemList (rich snippets + AI parsing) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Swypik", item: BASE_URL },
              { "@type": "ListItem", position: 2, name: tt.guides, item: `${BASE_URL}${localePrefix}/blog` },
              { "@type": "ListItem", position: 3, name: article.title, item: canonical },
            ],
          }),
        }}
      />
      {itemListLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
        />
      ) : null}

      {/* Breadcrumbs visible */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
        <nav className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-[#7C3AED]">Swypik</Link>
          <span className="mx-1.5">—</span>
          <Link href={`${localePrefix}/blog`} className="hover:text-[#7C3AED]">{tt.guides}</Link>
          <span className="mx-1.5">—</span>
          <span className="text-zinc-700 truncate">{article.title}</span>
        </nav>
      </div>

      {/* Hero */}
      <header className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-8">
        {article.category ? (
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#7C3AED" }}>
            {translateBlogCategory(article.category, tCat)}
          </div>
        ) : null}
        <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight text-[#0D0D0D]">
          {article.title}
        </h1>
        {article.excerpt ? (
          <p className="mt-4 text-lg sm:text-xl text-zinc-600 leading-relaxed">{article.excerpt}</p>
        ) : null}
        <div className="mt-6 flex items-center gap-3 text-sm text-zinc-500">
          {article.authorAvatar ? (
            <Image
              src={article.authorAvatar}
              alt={article.authorName}
              width={36}
              height={36}
              className="rounded-full"
            />
          ) : (
            <span
              className="w-9 h-9 rounded-full"
              style={{ background: "linear-gradient(135deg,#7C3AED,#EC4899)" }}
            />
          )}
          <div>
            <div className="font-bold text-[#0D0D0D]">{article.authorName}</div>
            <div className="text-xs">
              {article.readTimeMin} {tt.read}
              {article.publishedAt ? (
                <>
                  {" — "}
                  <time dateTime={article.publishedAt}>
                    {new Date(article.publishedAt).toLocaleDateString(locale === "en" ? "en-US" : "ro-RO", {
                      year: "numeric", month: "long", day: "numeric",
                    })}
                  </time>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Hero image */}
      {article.heroImageUrl ? (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 mb-10">
          <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-zinc-100">
            <Image
              src={article.heroImageUrl}
              alt={article.heroImageAlt || article.title}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        </div>
      ) : null}

      {/* Body — renders MDX with <InlineProductCard /> hydration */}
      <article className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <BlogArticleBody mdx={article.bodyMdx} />
      </article>

      {/* Tags */}
      {article.tags.length > 0 ? (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
          <div className="pt-6 border-t border-zinc-200 flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <span key={tag} className="px-3 py-1 rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* CTA back to hub */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <Link
          href={`${localePrefix}/blog`}
          className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-[#0D0D0D] text-white font-semibold text-sm hover:bg-zinc-800 transition"
        >
          {tt.backHub}
        </Link>
      </div>
    </main>
  );
}
