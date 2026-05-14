import { notFound } from "next/navigation";
import { dbQuery } from "@/lib/db";
import ProductEditorForm from "../ProductEditorForm";
import { updateMarketplaceProduct } from "../actions";

export const dynamic = "force-dynamic";

type EditMarketplaceProductPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string; created?: string; error?: string }>;
};

function getNotice(searchParams?: EditMarketplaceProductPageProps["searchParams"]) {
  if (searchParams?.error) {
    return { type: "error" as const, message: decodeURIComponent(searchParams.error) };
  }

  if (searchParams?.created) {
    return { type: "success" as const, message: "Product created successfully." };
  }

  if (searchParams?.saved) {
    return { type: "success" as const, message: "Product changes saved." };
  }

  return null;
}

export default async function EditMarketplaceProductPage({
  params,
  searchParams,
}: EditMarketplaceProductPageProps) {
  const { rows } = await dbQuery("SELECT * FROM marketplace_products WHERE id = $1", [params.id]);

  if (rows.length === 0) {
    notFound();
  }

  return (
    <ProductEditorForm
      mode="edit"
      product={rows[0]}
      action={updateMarketplaceProduct.bind(null, params.id)}
      notice={getNotice(searchParams)}
    />
  );
}
