/**
 * Parametrii Squad Buy — configurabili prin env, cu valori implicite explicite.
 * Motorul (engine.ts) nu mai conține numere magice.
 */
import { intEnv } from "@/lib/config/env";

/** Reducere procentuală față de prețul de listă când squad-ul se completează. */
// NEXT_PUBLIC_: procentul e afișat și pe client (pagina de produs), nu e secret.
export const SQUAD_DISCOUNT_PCT = intEnv("NEXT_PUBLIC_SQUAD_DISCOUNT_PCT", 30, 1, 90);
/** Câți membri trebuie să se strângă (inclusiv inițiatorul). */
export const SQUAD_REQUIRED_MEMBERS = intEnv("SQUAD_REQUIRED_MEMBERS", 2, 2, 20);
/** Cât timp rămâne deschis un squad. */
export const SQUAD_TTL_HOURS = intEnv("SQUAD_TTL_HOURS", 24, 1, 168);

export const SQUAD_DEFAULT_CREATOR_NAME = "Cumpărător Swypik";
export const SQUAD_DEFAULT_MEMBER_NAME = "Prieten Squad";

export function squadPriceCents(regularCents: number): number {
    return Math.round(regularCents * (1 - SQUAD_DISCOUNT_PCT / 100));
}
