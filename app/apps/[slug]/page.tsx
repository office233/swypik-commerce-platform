import AppDetailClient from "./AppDetailClient";

export const metadata = { title: "Aplicație — Swypik App Store" };

export default async function AppDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AppDetailClient slug={slug} />;
}
