/**
 * CCBill adapter — STUB ONLY.
 */

import type {
  AdultPaymentProvider,
  CreateSubscriptionInput,
  CreatePPVInput,
  CreateTipInput,
  ProcessorRedirect,
} from "@/lib/adult/payments";

export class CCBillProvider implements AdultPaymentProvider {
  readonly name = "ccbill" as const;

  private notWired(): never {
    throw new Error("CCBill provider not wired — set CCBILL_* env vars and replace the stub.");
  }

  async createSubscription(_input: CreateSubscriptionInput): Promise<ProcessorRedirect> {
    return this.notWired();
  }
  async createPPV(_input: CreatePPVInput): Promise<ProcessorRedirect> {
    return this.notWired();
  }
  async createTip(_input: CreateTipInput): Promise<ProcessorRedirect> {
    return this.notWired();
  }
  verifyWebhook(_rawBody: string, _signature: string) {
    return null;
  }
}

export function ccbillConfigured(): boolean {
  return Boolean(
    process.env.CCBILL_ACCOUNT_NUMBER &&
    process.env.CCBILL_SUB_ACCOUNT &&
    process.env.CCBILL_SALT &&
    process.env.CCBILL_WEBHOOK_SECRET,
  );
}
