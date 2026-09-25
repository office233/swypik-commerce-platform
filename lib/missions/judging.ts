/**
 * Jurizarea misiunilor (admin sau sellerul care a finanțat misiunea).
 *
 *   winner → selectează câștigătorul ȘI plătește premiul, atomic:
 *            în aceeași tranzacție se blochează misiunea (FOR UPDATE), se
 *            verifică locurile și escrow-ul, se crește paid_out_cents, se
 *            marchează înscrierea 'paid' și se creditează portofelul RON al
 *            creatorului (ledger, ref 'mission_prize', idempotent).
 *   pay    → reîncearcă plata pentru rânduri vechi rămase 'winner'/'approved'.
 *   reject → respinge (nu se poate după plată).
 */
import { withTransaction, type TxQuery } from "@/lib/db";
import { creditUserTx } from "@/lib/wallet/ledger";
import { logger } from "@/lib/logger";
import { notifyLocalized } from "@/lib/notifications/localized";
import { escrowRemainingCents } from "./config";
import type { JudgeAction } from "./schemas";

export type JudgeActor = { kind: "admin"; label: string } | { kind: "seller"; sellerId: string };

export type JudgeResult =
  | { ok: true; status: "paid" | "rejected"; prizeCents?: number }
  | {
      ok: false;
      code:
        | "not_found"
        | "invalid_transition"
        | "video_not_published"
        | "no_winner_slots"
        | "escrow_insufficient"
        | "mission_not_funded";
    };

type SubRow = {
  id: string;
  status: string;
  user_id: string;
  video_id: string | null;
  video_status: string | null;
  mission_id: string;
  mission_slug: string;
  mission_title: string;
  seller_id: string | null;
  funding_status: string;
  prize_amount_minor: number;
  max_winners: number | null;
  funded_cents: string;
  paid_out_cents: string;
  refunded_cents: string;
};

async function loadLocked(q: TxQuery, submissionId: string, actor: JudgeActor): Promise<SubRow | null> {
  // Blocăm întâi misiunea (serializează plățile concurente pe același escrow),
  // apoi înscrierea.
  const { rows } = await q<SubRow>(
    `SELECT s.id, s.status, s.user_id, s.video_id, v.status AS video_status,
            m.id AS mission_id, m.slug AS mission_slug, m.title AS mission_title,
            m.seller_id, m.funding_status, m.prize_amount_minor, m.max_winners,
            m.funded_cents::text, m.paid_out_cents::text, m.refunded_cents::text
       FROM creator_mission_submissions s
       JOIN creator_missions m ON m.id = s.mission_id
       LEFT JOIN videos v ON v.id = s.video_id
      WHERE s.id = $1
      FOR UPDATE OF m, s`,
    [submissionId],
  );
  const row = rows[0];
  if (!row) return null;
  if (actor.kind === "seller" && row.seller_id !== actor.sellerId) return null;
  return row;
}

async function payInTx(q: TxQuery, sub: SubRow, judgedBy: string): Promise<JudgeResult> {
  if (sub.funding_status !== "funded") return { ok: false, code: "mission_not_funded" };
  if (sub.video_status !== "ready") return { ok: false, code: "video_not_published" };
  const prize = Number(sub.prize_amount_minor);
  if (escrowRemainingCents(sub) < prize) return { ok: false, code: "escrow_insufficient" };

  const { rows: cnt } = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM creator_mission_submissions
      WHERE mission_id = $1 AND status = 'paid'`,
    [sub.mission_id],
  );
  if (sub.max_winners !== null && Number(cnt[0]?.n ?? 0) >= sub.max_winners) {
    return { ok: false, code: "no_winner_slots" };
  }

  await q(
    `UPDATE creator_missions SET paid_out_cents = paid_out_cents + $2 WHERE id = $1`,
    [sub.mission_id, prize],
  );
  await q(
    `UPDATE creator_mission_submissions
        SET status = 'paid', paid_at = now(), payout_minor = $2, payout_currency = 'RON',
            judged_by = $3, judged_at = now()
      WHERE id = $1`,
    [sub.id, prize, judgedBy],
  );
  await creditUserTx(q, {
    userId: sub.user_id,
    amountCents: prize,
    refType: "mission_prize",
    refId: `mission:${sub.mission_id}:submission:${sub.id}`,
    description: `mission_prize:${sub.mission_slug}`,
    metadata: { missionId: sub.mission_id, submissionId: sub.id },
  });
  return { ok: true, status: "paid", prizeCents: prize };
}

export async function judgeSubmission(
  submissionId: string,
  action: JudgeAction,
  actor: JudgeActor,
): Promise<JudgeResult> {
  const judgedBy = actor.kind === "admin" ? `admin:${actor.label}` : `seller:${actor.sellerId}`;

  const outcome = await withTransaction(async (q) => {
    const sub = await loadLocked(q, submissionId, actor);
    if (!sub) return { result: { ok: false, code: "not_found" } as JudgeResult, sub: null };

    if (action.action === "reject") {
      if (!["submitted", "approved", "winner"].includes(sub.status)) {
        return { result: { ok: false, code: "invalid_transition" } as JudgeResult, sub };
      }
      await q(
        `UPDATE creator_mission_submissions
            SET status = 'rejected', rejection_reason = $2, judged_by = $3, judged_at = now()
          WHERE id = $1`,
        [sub.id, action.reason ?? null, judgedBy],
      );
      return { result: { ok: true, status: "rejected" } as JudgeResult, sub };
    }

    const payable = action.action === "winner" ? ["submitted", "approved", "winner"] : ["winner", "approved"];
    if (!payable.includes(sub.status)) {
      return { result: { ok: false, code: "invalid_transition" } as JudgeResult, sub };
    }
    return { result: await payInTx(q, sub, judgedBy), sub };
  });

  const { result, sub } = outcome;
  if (result.ok && sub) {
    logger.info({ submissionId, action: action.action, judgedBy }, "mission.submission.judged");
    const values = { mission: sub.mission_title, amount: (result.prizeCents ?? 0) / 100 };
    await notifyLocalized(sub.user_id, result.status === "paid" ? "missionWinner" : "missionRejected", {
      url: result.status === "paid" ? "/creator/earnings" : `/missions/${sub.mission_slug}`,
      values,
    });
  }
  return result;
}

export function judgeErrorStatus(code: Exclude<JudgeResult, { ok: true }>["code"]): number {
  return code === "not_found" ? 404 : code === "video_not_published" ? 422 : 409;
}
