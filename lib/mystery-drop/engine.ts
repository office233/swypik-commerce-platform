/**
 * Swypik Daily Mystery Drop Engine
 * 
 * Generates dopamine-driven daily rewards for retention,
 * connected directly to Swypik Pay, Swypik Go, Food, and Seller Ads.
 */

export interface MysteryDropReward {
  id: string;
  type: "swyp_coins" | "go_discount" | "food_free_delivery" | "ad_product_drop";
  title: string;
  description: string;
  badge: string;
  icon: string;
  valueRon: number;
  swypAmount?: number;
  code?: string;
  productId?: string;
  shareToUnlock?: boolean;
}

const POSSIBLE_REWARDS: Array<{ reward: MysteryDropReward; weight: number }> = [
  {
    weight: 40,
    reward: {
      id: "rw_swyp_25",
      type: "swyp_coins",
      title: "+25 Monede SWYP",
      description: "Ai primit 25 SWYP direct în portofelul tău. Îi poți folosi la orice comandă!",
      badge: "CÂȘTIG GARANTAT",
      icon: "🪙",
      valueRon: 12.5,
      swypAmount: 25,
    },
  },
  {
    weight: 25,
    reward: {
      id: "rw_go_40",
      type: "go_discount",
      title: "40% Reducere Swypik Go",
      description: "Economisește la următoarea ta cursă în oraș cu mașinile Swypik Go.",
      badge: "MOBILITATE",
      icon: "🚕",
      valueRon: 20,
      code: "GO-MYSTERY40",
    },
  },
  {
    weight: 20,
    reward: {
      id: "rw_food_delivery",
      type: "food_free_delivery",
      title: "Transport Gratuit la Mâncare",
      description: "Comandă de la restaurantul tău preferat fără nicio taxă de livrare.",
      badge: "SWYPIK FOOD",
      icon: "🍔",
      valueRon: 15,
      code: "FOOD-FREEDROP",
    },
  },
  {
    weight: 15,
    reward: {
      id: "rw_ad_gadget",
      type: "ad_product_drop",
      title: "Căști Wireless Pro la 0 LEI",
      description: "Produs sponsorizat de partenerul Swypik Shop! Deblochează-l trimițând linkul la 1 prieten.",
      badge: "MARELE PREMIU",
      icon: "🎧",
      valueRon: 149,
      shareToUnlock: true,
    },
  },
];

export function selectRandomMysteryReward(): MysteryDropReward {
  const totalWeight = POSSIBLE_REWARDS.reduce((acc, item) => acc + item.weight, 0);
  let random = Math.random() * totalWeight;

  for (const item of POSSIBLE_REWARDS) {
    if (random < item.weight) {
      return item.reward;
    }
    random -= item.weight;
  }

  return POSSIBLE_REWARDS[0].reward;
}

export function canClaimDailyDrop(lastClaimedIso: string | null): boolean {
  if (!lastClaimedIso) return true;
  const lastDate = new Date(lastClaimedIso);
  const now = new Date();
  
  // Claimable once per calendar day (UTC)
  return (
    lastDate.getUTCFullYear() !== now.getUTCFullYear() ||
    lastDate.getUTCMonth() !== now.getUTCMonth() ||
    lastDate.getUTCDate() !== now.getUTCDate()
  );
}
