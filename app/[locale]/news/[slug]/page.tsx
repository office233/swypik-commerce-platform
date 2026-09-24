import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/feature-flags";
import { getArticleBySlug } from "@/lib/news/repository";
import ArticleClient from "./ArticleClient";

export const dynamic = "force-dynamic";

const DESCRIPTION_MAX = 160;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isEnabled("news")) return {};

  const article = await getArticleBySlug(slug).catch(() => null);
  if (!article) return {};

  const description = article.summary_tldr.replace(/[⚡📊🔮\n]/g, " ").trim().slice(0, DESCRIPTION_MAX);

  return {
    title: article.title,
    description,
    openGraph: {
      title: article.title,
      description,
      type: "article",
      images: article.cover_image_url ? [article.cover_image_url] : [],
      publishedTime: article.published_at,
    },
    alternates: { canonical: `/${locale}/news/${slug}` },
  };
}

export default async function ArticleReaderPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  if (!isEnabled("news")) notFound();

  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  return <ArticleClient article={article} />;
}
