import ProductEditorForm from "../ProductEditorForm";
import { createMarketplaceProduct } from "../actions";

export const dynamic = "force-dynamic";

type NewMarketplaceProductPageProps = {
  searchParams?: { error?: string };
};

export default function NewMarketplaceProductPage({ searchParams }: NewMarketplaceProductPageProps) {
  const notice = searchParams?.error
    ? { type: "error" as const, message: decodeURIComponent(searchParams.error) }
    : null;

  return <ProductEditorForm mode="create" action={createMarketplaceProduct} notice={notice} />;
}
