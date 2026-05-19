/**
 * Paxum payout adapter — STUB ONLY.
 *
 * Paxum is used for creator payouts (the "outbound" side). It is NOT a
 * payment processor in our flow; CCBill handles charging.
 *
 * Wiring this requires PAXUM_API_KEY + PAXUM_API_SECRET and a
 * verified business account.
 */

export interface PayoutRequest {
  destinationEmail: string;
  amountMinor: number;
  currency: string;
  externalRef: string;
}

export interface PayoutResult {
  externalRef: string;
  paidAt: Date;
  rawResponse: unknown;
}

export class PaxumProvider {
  readonly id = "paxum" as const;

  paxumConfigured(): boolean {
    return Boolean(process.env.PAXUM_API_KEY && process.env.PAXUM_API_SECRET);
  }

  async sendPayout(_req: PayoutRequest): Promise<PayoutResult> {
    throw new Error("Paxum provider not wired — set PAXUM_API_KEY/SECRET and replace the stub.");
  }
}

export function paxumConfigured(): boolean {
  return Boolean(process.env.PAXUM_API_KEY && process.env.PAXUM_API_SECRET);
}
