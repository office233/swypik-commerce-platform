import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { getCreatorUserIdWithRoleCheck } from "@/lib/creator/session";
import { getPayoutReadiness, listCreatorPayouts } from "@/lib/creator/payouts";
import { getBalanceCents } from "@/lib/wallet/ledger";
import { logger } from "@/lib/logger";
import { StudioHeading } from "../_components/StudioHeading";
import PayoutsClient from "./PayoutsClient";
import type { PayoutsData } from "./_components/types";

export const dynamic = "force-dynamic";

/** Aceleași date ca GET /api/creator/payouts (fără accountId); clientul reîncarcă din API după o cerere. */
async function loadPayouts(userId: string): Promise<PayoutsData> {
  const [readiness, balanceCents, payouts] = await Promise.all([
    getPayoutReadiness(userId),
    getBalanceCents(userId),
    listCreatorPayouts(userId),
  ]);
  const { accountId: _accountId, ...publicReadiness } = readiness;
  return { readiness: publicReadiness, balanceCents, payouts };
}

export default async function CreatorPayoutsPage() {
  const session = await getCreatorUserIdWithRoleCheck();
  if (!session) redirect("/become-a-creator");

  const t = await getTranslations("creatorStudio.payouts");
  let data: PayoutsData;
  try {
    data = await loadPayouts(session.userId);
  } catch (err) {
    logger.error({ err, userId: session.userId }, "[creator/payouts] load failed");
    return (
      <div>
        <StudioHeading title={t("title")} />
        <Card>
          <ErrorState title={t("loadErrorTitle")} description={t("loadErrorBody")} />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <StudioHeading title={t("title")} subtitle={t("subtitle")} />
      <PayoutsClient initial={data} />
    </div>
  );
}
