export type RawOrderStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "fulfilled"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "failed"
  | "return_requested"
  | string;

export type FulfillmentStatus =
  | "not_started"
  | "pending"
  | "processing"
  | "submitted"
  | "manual_required"
  | "pending_seller_action"
  | "partially_shipped"
  | "shipped"
  | "fulfilled"
  | "delivered"
  | "cancelled"
  | "failed"
  | string;

export type OrderStatusInput = {
  status: RawOrderStatus;
  fulfillmentStatus?: FulfillmentStatus | null;
  metadata?: Record<string, any> | null;
  trackingNumber?: string | null;
};

export type DerivedOrderStatus = {
  key: string;
  label: string;
  description: string;
  step: number;
  isTerminal: boolean;
  isReturnable: boolean;
};

function normalize(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function getFulfillmentStatus(input: OrderStatusInput): string {
  return normalize(
    input.fulfillmentStatus ||
      input.metadata?.fulfillment_status ||
      input.metadata?.fulfillmentStatus ||
      "",
  );
}

function getTrackingNumber(input: OrderStatusInput): string {
  return String(input.trackingNumber || input.metadata?.tracking_number || "").trim();
}

export function canRequestReturn(input: OrderStatusInput): boolean {
  const status = normalize(input.status);
  const fulfillmentStatus = getFulfillmentStatus(input);
  const terminalStatuses = new Set(["cancelled", "failed", "refunded", "return_requested"]);

  if (terminalStatuses.has(status)) return false;
  if (input.metadata?.return_reason || input.metadata?.return_requested_at) return false;

  return (
    status === "fulfilled" ||
    status === "delivered" ||
    fulfillmentStatus === "fulfilled" ||
    fulfillmentStatus === "shipped" ||
    fulfillmentStatus === "delivered"
  );
}

export function deriveOrderStatus(input: OrderStatusInput): DerivedOrderStatus {
  const status = normalize(input.status);
  const fulfillmentStatus = getFulfillmentStatus(input);
  const hasTracking = getTrackingNumber(input).length > 0;

  let result: Omit<DerivedOrderStatus, "isReturnable">;

  if (status === "return_requested") {
    result = {
      key: "return_requested",
      label: "Retur solicitat",
      description: "Cererea de retur a fost inregistrata si asteapta verificare.",
      step: 4,
      isTerminal: false,
    };
  } else if (status === "refunded") {
    result = {
      key: "refunded",
      label: "Rambursata",
      description: "Plata a fost rambursata catre client.",
      step: 4,
      isTerminal: true,
    };
  } else if (status === "cancelled") {
    result = {
      key: "cancelled",
      label: "Anulata",
      description: "Comanda a fost anulata.",
      step: 0,
      isTerminal: true,
    };
  } else if (status === "failed") {
    result = {
      key: "failed",
      label: "Esuata",
      description: "Plata sau procesarea comenzii a esuat.",
      step: 0,
      isTerminal: true,
    };
  } else if (status === "pending" || status === "authorized") {
    result = {
      key: "pending_payment",
      label: "In asteptarea platii",
      description: "Comanda a fost creata, dar plata nu este confirmata.",
      step: 1,
      isTerminal: false,
    };
  } else if (status === "delivered" || fulfillmentStatus === "delivered") {
    result = {
      key: "delivered",
      label: "Livrata",
      description: "Comanda a fost livrata.",
      step: 4,
      isTerminal: false,
    };
  } else if (hasTracking || status === "fulfilled" || fulfillmentStatus === "shipped" || fulfillmentStatus === "fulfilled") {
    result = {
      key: "shipped",
      label: "Expediata",
      description: "Comanda a fost expediata si are tracking disponibil.",
      step: 3,
      isTerminal: false,
    };
  } else if (fulfillmentStatus === "partially_shipped") {
    result = {
      key: "partially_shipped",
      label: "Expediere partiala",
      description: "O parte din comanda a fost expediata.",
      step: 3,
      isTerminal: false,
    };
  } else if (fulfillmentStatus === "manual_required") {
    result = {
      key: "manual_required",
      label: "Necesita procesare manuala",
      description: "Comanda este platita, dar are nevoie de interventie pentru fulfillment.",
      step: 2,
      isTerminal: false,
    };
  } else if (fulfillmentStatus === "processing" || fulfillmentStatus === "submitted") {
    result = {
      key: "processing",
      label: "In procesare",
      description: "Comanda este platita si este pregatita pentru expediere.",
      step: 2,
      isTerminal: false,
    };
  } else if (fulfillmentStatus === "pending_seller_action") {
    result = {
      key: "pending_seller_action",
      label: "Asteapta sellerul",
      description: "Sellerul trebuie sa adauge datele de expediere.",
      step: 2,
      isTerminal: false,
    };
  } else {
    result = {
      key: "paid",
      label: "Platita",
      description: "Plata a fost confirmata.",
      step: 2,
      isTerminal: false,
    };
  }

  return {
    ...result,
    isReturnable: canRequestReturn(input),
  };
}
