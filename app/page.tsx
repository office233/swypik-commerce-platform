import ChatInterface from "@/components/ChatInterface";
import { searchProducts } from "@/lib/db/product-queries";

export const runtime = "edge";
export const revalidate = 60; // Cache the home page for 60 seconds at the CDN edge

export default async function Home() {
  // Fetch initial data in parallel on the server
  const [trending, bestValue, topRated] = await Promise.all([
    searchProducts({ mode: "trending", limit: 20 }),
    searchProducts({ mode: "bestvalue", limit: 20 }),
    searchProducts({ mode: "toprated", limit: 20 }),
  ]);

  return (
    <ChatInterface 
      initialTrending={trending.products}
      initialBestValue={bestValue.products}
      initialTopRated={topRated.products}
    />
  );
}
