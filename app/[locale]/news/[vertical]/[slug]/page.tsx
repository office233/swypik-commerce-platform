import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchVision24Article } from "@/lib/vision24/feed";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; vertical: string; slug: string }>;
};

async function getArticle(vertical: string, slug: string) {
  try {
    return await fetchVision24Article(vertical, slug);
  } catch {
    return null;
  }
}

function cleanMarkdownText(value: string) {
  return value.replace(/[#>*_`\[\]()]/g, "").replace(/\s+/g, " ").trim();
}

function renderMarkdown(body: string) {
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block, index) => {
    if (block.startsWith("### ")) {
      return <h3 key={index} className="mt-8 text-xl font-black text-[#0D0D0D]">{cleanMarkdownText(block.slice(4))}</h3>;
    }
    if (block.startsWith("## ")) {
      return <h2 key={index} className="mt-10 text-2xl font-black text-[#0D0D0D]">{cleanMarkdownText(block.slice(3))}</h2>;
    }
    if (block.startsWith(">")) {
      return (
        <blockquote key={index} className="my-7 border-l-4 border-[#10A37F] bg-[#F4FBF8] px-5 py-4 text-base font-semibold leading-8 text-[#174A3A]">
          {cleanMarkdownText(block.replace(/^>\s?/gm, ""))}
        </blockquote>
      );
    }
    if (/^-\s/m.test(block)) {
      const items = block.split("\n").map((line) => line.replace(/^-\s*/, "").trim()).filter(Boolean);
      return (
        <ul key={index} className="my-6 list-disc space-y-2 pl-6 text-lg leading-8 text-[#262626]">
          {items.map((item) => <li key={item}>{cleanMarkdownText(item)}</li>)}
        </ul>
      );
    }
    return <p key={index} className="my-6 text-lg leading-8 text-[#262626]">{cleanMarkdownText(block)}</p>;
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { vertical, slug } = await params;
  const article = await getArticle(vertical, slug);
  if (!article?.title) return { title: "Vision24 | Swypik" };
  return {
    title: `${article.title} | Vision24 pe Swypik`,
    description: article.dek || undefined,
    openGraph: {
      title: article.title,
      description: article.dek || undefined,
      images: article.hero_image_url ? [{ url: article.hero_image_url, alt: article.hero_image_alt || article.title }] : undefined,
    },
  };
}

export default async function Vision24ArticlePage({ params }: PageProps) {
  const t = await getTranslations("news");
  const { vertical, slug } = await params;
  const article = await getArticle(vertical, slug);
  if (!article?.title) notFound();

  const publishedAt = article.published_at ? new Date(article.published_at) : null;
  const body = article.body_md || article.dek || "";

  return (
    <main className="min-h-screen bg-[#F7F7F8] text-[#0D0D0D]">
      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
        <Link href="/explore" className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-sm font-black text-[#0D0D0D] shadow-sm ring-1 ring-black/5">

          {t("inapoiInFeed")}
        </Link>

        <header className="pt-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-normal text-[#10A37F]">
            <span>{article.vertical_name || article.vertical_slug}</span>
            <span className="text-[#8A8A8A]">Vision24</span>
            {publishedAt && <time className="text-[#8A8A8A]" dateTime={publishedAt.toISOString()}>{publishedAt.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" })}</time>}
          </div>
          <h1 className="mt-4 text-4xl font-black leading-none tracking-normal text-[#0D0D0D] sm:text-6xl">{article.title}</h1>
          {article.dek && <p className="mt-5 text-xl font-semibold leading-8 text-[#4A4A4A]">{article.dek}</p>}
        </header>

        {article.hero_image_url && (
          <figure className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={article.hero_image_url} alt={article.hero_image_alt || article.title} className="h-auto w-full object-cover" />
            {article.hero_image_alt && <figcaption className="px-4 py-3 text-sm font-semibold text-[#6E6E80]">{article.hero_image_alt}</figcaption>}
          </figure>
        )}

        <section className="mt-8 rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-black/5 sm:px-8 sm:py-5">
          {renderMarkdown(body)}
        </section>
      </article>
    </main>
  );
}