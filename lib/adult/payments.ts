/**
 * Adult payment processor abstraction.
 *
 * Stripe is explicitly forbidden for any adult flow (Stripe Restricted
 * Businesses FAQ — adult content, pay-per-view adult, adult live chat,
 * adult products). We define a single interface so the rest of the app
 * stays processor-agnostic; concrete adapters for CCBill / Verotel /
 * Segpay / Paxum are added in future sessions when accounts are live.
 *
 * Hard rule (also enforced at DB level via CHECK constraints on
 * adult.subscriptions.processor, adult.ppv_unlocks.processor,
 * adult.tips.processor, adult.transactions.processor):
 *
 *   processor ∈ {ccbill, verotel, segpay, paxum, manual_test}
 *
 * Any attempt to wire Stripe into this path MUST be rejected at code
 * review.
 */

export type AdultProcessor = "ccbill" | "verotel" | "segpay" | "paxum" | "manual_test";

export interface CreateSubscriptionInput {
  fanUserId: string;
  creatorUserId: string;
  tierMinor: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatePPVInput {
  fanUserId: string;
  postId: string;
  amountMinor: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreateTipInput {
  fanUserId: string;
  creatorUserId: string;
  postId?: string;
  amountMinor: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface ProcessorRedirect {
  processor: AdultProcessor;
  processorRef: string;
  hostedUrl: string;
}

export interface AdultPaymentProvider {
  readonly name: AdultProcessor;
  createSubscription(input: CreateSubscriptionInput): Promise<ProcessorRedirect>;
  createPPV(input: CreatePPVInput): Promise<ProcessorRedirect>;
  createTip(input: CreateTipInput): Promise<ProcessorRedirect>;
  /**
   * Verify a signed webhook payload. Return null if signature is invalid.
   * Adapters MUST implement signature checking; this is the only safe
   * way to flip subscription/unlock state.
   */
  verifyWebhook(rawBody: string, signature: string): { kind: string; ref: string; payload: unknown } | null;
}

/**
 * Stub adapter used in dev / tests only. Returns a fake hosted URL that
 * an admin can hit to simulate webhook delivery. Never enabled in prod.
 */
class ManualTestProvider implements AdultPaymentProvider {
  readonly name = "manual_test" as const;

  async createSubscription(input: CreateSubscriptionInput): Promise<ProcessorRedirect> {
    const ref = `manual_sub_${Date.now()}_${input.fanUserId.slice(0, 8)}`;
    return { processor: this.name, processorRef: ref, hostedUrl: `${input.returnUrl}?manual=1&ref=${ref}` };
  }
  async createPPV(input: CreatePPVInput): Promise<ProcessorRedirect> {
    const ref = `manual_ppv_${Date.now()}_${input.postId.slice(0, 8)}`;
    return { processor: this.name, processorRef: ref, hostedUrl: `${input.returnUrl}?manual=1&ref=${ref}` };
  }
  async createTip(input: CreateTipInput): Promise<ProcessorRedirect> {
    const ref = `manual_tip_${Date.now()}_${input.fanUserId.slice(0, 8)}`;
    return { processor: this.name, processorRef: ref, hostedUrl: `${input.returnUrl}?manual=1&ref=${ref}` };
  }
  verifyWebhook(_rawBody: string, _signature: string) {
    if (process.env.NODE_ENV === "production") return null;
    return { kind: "manual", ref: "manual", payload: {} };
  }
}

export function getAdultPaymentProvider(): AdultPaymentProvider {
  // In future: select based on env (CCBILL_ENABLED, VEROTEL_ENABLED, ...).
  // For now only the manual test stub exists. Hard-fail in prod so that
  // anyone trying to ship adult payments without a real adapter notices.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AdultPaymentProvider: no real processor configured. Stripe is forbidden for adult flows. Wire CCBill/Verotel/Segpay/Paxum first.",
    );
  }
  return new ManualTestProvider();
}
