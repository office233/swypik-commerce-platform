import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isEnabled } from "@/lib/feature-flags";
import SquadClient from "./SquadClient";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { getSquadsForSeller } from "@/lib/squad/engine";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export default async function SellerSquadPage() {
  if (!isEnabled("squadBuy")) notFound();
  const t = await getTranslations("sellerGrowthSquad");
  const sellerId = await getSellerSessionId();

  let initialSquads: any[] = [];
  let initialStats = {
    totalSquads: 0,
    activeSquads: 0,
    completedSquads: 0,
    viralOrdersCount: 0,
    extraRevenueCents: 0,
  };

  if (sellerId) {
    try {
      const data = await getSquadsForSeller(sellerId, 50);
      initialSquads = data.squads;
      initialStats = data.stats;
    } catch (e) {
      logger.error({ err: e, sellerId }, "Error loading seller squads");
    }
  }

  return (
    <Suspense fallback={<div className="p-8 text-neutral-500 font-bold">{t("loadingPage")}</div>}>
      <SquadClient initialSquads={initialSquads} initialStats={initialStats} />
    </Suspense>
  );
}
