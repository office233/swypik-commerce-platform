/**
 * Shared Pi SDK browser types + the single global `Window.Pi` declaration.
 * Both PiLoginButton and lib/pi/payments import from here so the global
 * isn't declared twice with conflicting shapes.
 */

export type PiScope = "username" | "payments" | "wallet_address";

export type PiAuthResult = {
  accessToken: string;
  user: { uid: string; username: string };
};

export type PiIncompletePayment = {
  identifier: string;
  transaction?: { txid: string };
};

export type PiPaymentData = {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
};

export type PiPaymentCallbacks = {
  onReadyForServerApproval: (paymentId: string) => void;
  onReadyForServerCompletion: (paymentId: string, txid: string) => void;
  onCancel: (paymentId: string) => void;
  onError: (error: Error, payment?: { identifier?: string }) => void;
};

export type PiSDK = {
  init: (opts: { version: "2.0"; sandbox?: boolean }) => Promise<void> | void;
  authenticate: (
    scopes: PiScope[],
    onIncompletePaymentFound: (payment: PiIncompletePayment) => void,
  ) => Promise<PiAuthResult>;
  createPayment: (data: PiPaymentData, callbacks: PiPaymentCallbacks) => void;
};

declare global {
  interface Window {
    Pi?: PiSDK;
  }
}
