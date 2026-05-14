import { redirect } from "next/navigation";

export default async function LegacySellerStorefront({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/sellers/${id}`);
}
