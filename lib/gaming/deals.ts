import { logger } from "@/lib/logger";

export interface FreeGame {
  id: number;
  title: string;
  thumbnail: string;
  short_description: string;
  game_url: string;
  genre: string;
  platform: string;
}

export interface GameDeal {
  dealID: string;
  title: string;
  salePrice: string;
  normalPrice: string;
  savings: string;
  thumb: string;
  steamRatingPercent?: string;
}

export async function getFreeGames(): Promise<FreeGame[]> {
  try {
    const res = await fetch("https://www.freetogame.com/api/games?sort-by=popularity", {
      next: { revalidate: 7200 }, // 2h cache
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`freetogame status ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      return data.slice(0, 8);
    }
  } catch (e) {
    logger.warn({ err: e }, "[gaming.deals] freetogame fetch failed");
  }
  return [];
}

export async function getTopGameDeals(): Promise<GameDeal[]> {
  try {
    const res = await fetch("https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=20&sortBy=Savings", {
      headers: { "User-Agent": "SwypikGaming/1.0" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`cheapshark status ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      return data.slice(0, 8);
    }
  } catch (e) {
    logger.warn({ err: e }, "[gaming.deals] cheapshark fetch failed");
  }
  return [];
}
