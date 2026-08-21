/**
 * Estimează probabilitatea de a câștiga un dispute Stripe (chargeback)
 * pe baza completude evidence + reason code + context order.
 *
 * Scor 0-100 (heuristic, NU statistic — bazat pe ghiduri publice Stripe + bune practici).
 * Atenție: succesul real depinde de bancă emitentă + dovezile concrete, nu de scor.
 */

export type DisputeReason =
  | "credit_not_processed"
  | "duplicate"
  | "fraudulent"
  | "general"
  | "incorrect_account_details"
  | "insufficient_funds"
  | "product_not_received"
  | "product_unacceptable"
  | "subscription_canceled"
  | "unrecognized"
  | string;

export type EvidenceFields = Record<string, unknown> | null | undefined;

export type WinScore = {
  score: number;             // 0-100
  label: "low" | "medium" | "high";
  factors: { tag: string; delta: number; note: string }[];
  recommendation: string;
  missing: MissingSuggestion[]; // top câmpuri lipsă sortate după impact
  combos: ComboScenario[];   // top 2 + top 3 dacă există suficiente sugestii
};

export type MissingSuggestion = {
  key: string;
  label: string;
  potentialDelta: number; // câte puncte ar urca scorul dacă l-ai completa
  newScore: number;       // scor estimat după completare
};

export type ComboScenario = {
  size: number;           // câte câmpuri în combo (2 sau 3)
  keys: string[];         // cheile combo
  labels: string[];       // labels pentru afișare
  newScore: number;       // scor estimat dacă toate sunt completate împreună
  delta: number;          // diferență vs baseline
};

const FIELD_LABELS: Record<string, string> = {
  receipt: "Receipt/chitanță (PDF)",
  shipping_documentation: "Document expediere AWB (PDF)",
  service_documentation: "Document serviciu (PDF)",
  customer_signature: "Semnătură client la livrare (PDF)",
  customer_communication: "Screenshot conversație (PDF/PNG)",
  refund_policy: "Politica de retur (PDF)",
  shipping_tracking_number: "Tracking number",
  shipping_carrier: "Curier",
  shipping_address: "Adresă livrare",
  shipping_date: "Data expediere",
  customer_name: "Nume client",
  customer_email_address: "Email client",
  customer_communication_text: "Comunicare cu clientul (text)",
  product_description: "Descriere produs",
  refund_policy_disclosure: "Politica de retur (text)",
};

// câmpurile relevante de propus + alias pe field-name pentru "ce input să umpli în UI"
const ALL_FIELDS = Object.keys(FIELD_LABELS);

const REASON_BASELINE: Record<string, number> = {
  // baseline win-rate aproximativ după ghidul Stripe + experiență publică
  fraudulent: 20,                   // greu de câștigat fără AVS+CVV match + 3DS
  unrecognized: 25,                 // similar fraudulent
  product_not_received: 55,         // dovedit cu tracking → mare șansă
  product_unacceptable: 45,         // depinde de fotografii + politica retur
  duplicate: 65,                    // ușor de demonstrat cu 2 charge IDs
  credit_not_processed: 60,         // dovedit cu refund receipt
  subscription_canceled: 50,        // dovedit cu logs
  incorrect_account_details: 40,
  insufficient_funds: 70,           // de obicei câștigat (responsabilitate buyer)
  general: 45,
};

function has(ev: EvidenceFields, key: string): boolean {
  if (!ev || typeof ev !== "object") return false;
  // Acces prin index pe un tip cu chei cunoscute: `Record<string, unknown>` e
  // exact ce trebuie, iar `unknown` ne obligă să verificăm tipul mai jos —
  // spre deosebire de `as any`, care ar fi lăsat orice să treacă.
  const v = (ev as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim().length > 0;
}

function computeRaw(
  reason: string,
  ev: EvidenceFields,
  hasOrderLink: boolean,
): { score: number; factors: WinScore["factors"] } {
  const factors: WinScore["factors"] = [];
  let score = REASON_BASELINE[reason] ?? 45;
  factors.push({
    tag: `reason:${reason}`,
    delta: 0,
    note: `Baseline pentru motiv "${reason}": ${score}%`,
  });

  // Strong evidence files (Stripe weights file_ids cel mai mult)
  if (has(ev, "receipt")) {
    score += 6;
    factors.push({ tag: "receipt", delta: +6, note: "Receipt/chitanță atașat" });
  }
  if (has(ev, "shipping_documentation")) {
    score += 10;
    factors.push({ tag: "shipping_doc", delta: +10, note: "Document expediere (AWB)" });
  }
  if (has(ev, "customer_signature")) {
    score += 8;
    factors.push({ tag: "signature", delta: +8, note: "Semnătură client la livrare" });
  }
  if (has(ev, "customer_communication")) {
    score += 5;
    factors.push({ tag: "comm_file", delta: +5, note: "Screenshot conversație" });
  }
  if (has(ev, "service_documentation")) {
    score += 5;
    factors.push({ tag: "service_doc", delta: +5, note: "Document serviciu" });
  }
  if (has(ev, "refund_policy")) {
    score += 3;
    factors.push({ tag: "refund_policy", delta: +3, note: "Politica de retur (PDF)" });
  }

  // Text evidence
  if (has(ev, "shipping_tracking_number")) {
    score += 10;
    factors.push({ tag: "tracking", delta: +10, note: "Tracking number completat" });
  }
  if (has(ev, "shipping_carrier")) {
    score += 3;
    factors.push({ tag: "carrier", delta: +3, note: "Curier specificat" });
  }
  if (has(ev, "shipping_address")) {
    score += 4;
    factors.push({ tag: "shipping_addr", delta: +4, note: "Adresă livrare detaliată" });
  }
  if (has(ev, "shipping_date")) {
    score += 3;
    factors.push({ tag: "shipping_date", delta: +3, note: "Data expediere documentată" });
  }
  if (has(ev, "customer_name") && has(ev, "customer_email_address")) {
    score += 3;
    factors.push({ tag: "customer_id", delta: +3, note: "Client identificat (nume+email)" });
  }
  if (has(ev, "customer_communication_text")) {
    score += 4;
    factors.push({ tag: "comm_text", delta: +4, note: "Comunicare cu clientul (text)" });
  }
  if (has(ev, "product_description")) {
    score += 2;
    factors.push({ tag: "product_desc", delta: +2, note: "Produs descris" });
  }
  if (has(ev, "refund_policy_disclosure")) {
    score += 3;
    factors.push({ tag: "refund_text", delta: +3, note: "Politica retur (text)" });
  }

  // Penalty: dispute fără evidence deloc
  const evKeys = ev && typeof ev === "object" ? Object.keys(ev).filter((k) => has(ev, k)) : [];
  if (evKeys.length === 0) {
    score -= 25;
    factors.push({ tag: "no_evidence", delta: -25, note: "ZERO evidence completată" });
  }

  // Bonus dacă există order link (înseamnă putem dovedi vânzarea)
  if (hasOrderLink) {
    score += 4;
    factors.push({ tag: "order_linked", delta: +4, note: "Comanda corelată în sistem" });
  } else {
    score -= 5;
    factors.push({ tag: "no_order", delta: -5, note: "Fără comandă corelată" });
  }

  // Sinergii puternice: shipping_documentation + tracking + signature pentru product_not_received
  if (
    reason === "product_not_received" &&
    has(ev, "shipping_documentation") &&
    has(ev, "shipping_tracking_number")
  ) {
    score += 8;
    factors.push({ tag: "synergy_pnr", delta: +8, note: "Combinație win-ready pentru PNR" });
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), factors };
}

export function scoreDispute(input: {
  reason?: string | null;
  evidence?: EvidenceFields;
  hasOrderLink?: boolean;
}): WinScore {
  const reason = (input.reason || "general").toLowerCase();
  const ev: Record<string, unknown> = (input.evidence as Record<string, unknown> | undefined) ?? {};
  const hasOrderLink = Boolean(input.hasOrderLink);

  const baseline = computeRaw(reason, ev, hasOrderLink);
  baseline.factors.unshift({
    tag: `reason:${reason}`,
    delta: 0,
    note: `Baseline pentru motiv "${reason}": ${REASON_BASELINE[reason] ?? 45}%`,
  });

  // Calculează ce câștigă fiecare câmp NEcompletat dacă l-am completa
  const missing: MissingSuggestion[] = [];
  for (const key of ALL_FIELDS) {
    if (has(ev, key)) continue;
    const hypothetical = { ...ev, [key]: "filled" };
    const sim = computeRaw(reason, hypothetical, hasOrderLink);
    const delta = sim.score - baseline.score;
    if (delta > 0) {
      missing.push({
        key,
        label: FIELD_LABELS[key] || key,
        potentialDelta: delta,
        newScore: sim.score,
      });
    }
  }
  missing.sort((a, b) => b.potentialDelta - a.potentialDelta);

  const score = baseline.score;
  let label: WinScore["label"];
  let recommendation: string;
  if (score >= 65) {
    label = "high";
    recommendation = "Șansă bună — trimite evidence acum.";
  } else if (score >= 40) {
    label = "medium";
    recommendation = "Mai adaugă dovezi (tracking, AWB, semnătură) înainte de submit.";
  } else {
    label = "low";
    recommendation =
      reason === "fraudulent" || reason === "unrecognized"
        ? "Fraudă — de obicei pierdut. Accept dispute & cere bancii reverse doar dacă ai 3DS+AVS."
        : "Șansă mică — completează evidence sau acceptă pierderea pentru a evita fee.";
  }

  const topMissing = missing.slice(0, 5);

  // Calcul combo: ce s-ar întâmpla dacă completezi top 2 sau top 3 împreună
  const combos: ComboScenario[] = [];
  for (const size of [2, 3]) {
    if (topMissing.length < size) continue;
    const keys = topMissing.slice(0, size).map((m) => m.key);
    const hypothetical: Record<string, unknown> = { ...ev };
    for (const k of keys) hypothetical[k] = "filled";
    const sim = computeRaw(reason, hypothetical, hasOrderLink);
    const delta = sim.score - score;
    if (delta > 0) {
      combos.push({
        size,
        keys,
        labels: keys.map((k) => FIELD_LABELS[k] || k),
        newScore: sim.score,
        delta,
      });
    }
  }

  return {
    score,
    label,
    factors: baseline.factors,
    recommendation,
    missing: topMissing,
    combos,
  };
}
