import ChatInterface from "@/components/ChatInterface";
import { searchProducts } from "@/lib/db/product-queries";

// ISR: rebuild homepage every 120s — NOT force-dynamic (which caused timeout on every request)
export const revalidate = 120;
export const preferredRegion = "fra1";

/** Wrap a promise with a timeout so one slow query doesn't block the whole page */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function Home() {
  type ProductSearchResult = Awaited<ReturnType<typeof searchProducts>>;
  const emptyResult: ProductSearchResult = { products: [], total: 0, offset: 0, limit: 0, hasMore: false };
  let trending = emptyResult;
  let bestValue = emptyResult;
  let topRated = emptyResult;

  try {
    [trending, bestValue, topRated] = await Promise.all([
      withTimeout(searchProducts({ mode: "trending", limit: 20 }), 8000, emptyResult),
      withTimeout(searchProducts({ mode: "bestvalue", limit: 20 }), 8000, emptyResult),
      withTimeout(searchProducts({ mode: "toprated", limit: 20 }), 8000, emptyResult),
    ]);
  } catch (error) {
    console.error("[Home] Failed to load initial products:", error);
  }

  return (
    <>
      <h1 className="sr-only">Swypik — Shop by video</h1>
      <ChatInterface
        initialTrending={trending.products}
        initialBestValue={bestValue.products}
        initialTopRated={topRated.products}
      />
    </>
  );
}
