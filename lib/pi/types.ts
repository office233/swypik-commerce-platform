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

export type PiMigratedWallet = { publicKey: string };

export type PiWallet = {
  /**
   * Returns the list of wallet addresses the authenticated user has migrated
   * to the Pi blockchain. Each entry has a public Stellar key (`G...`).
   * Requires the `wallet_address` scope on Pi.authenticate. Pi Browser only.
   */
  getUserMigratedWalletAddresses: () => Promise<{ wallets: PiMigratedWallet[] }>;
  /** Submit a pre-signed Stellar XDR. Not used in the auth flow. */
  submitTransaction?: (xdr: string) => Promise<unknown>;
};

export type PiSDK = {
  init: (opts: { version: "2.0"; sandbox?: boolean }) => Promise<void> | void;
  authenticate: (
    scopes: PiScope[],
    onIncompletePaymentFound: (payment: PiIncompletePayment) => void,
  ) => Promise<PiAuthResult>;
  createPayment: (data: PiPaymentData, callbacks: PiPaymentCallbacks) => void;
  /** Wallet module exposed by the Pi SDK inside Pi Browser. May be undefined
   *  in older SDK versions or under sandbox without wallet permission. */
  Wallet?: PiWallet;
};

declare global {
  interface Window {
    Pi?: PiSDK;
  }
}
