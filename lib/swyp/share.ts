import { SWYPIK_OFFICIAL_ID } from "@/lib/config/accounts";

/**
 * Cota unui creator/artist dintr-o plată SWYP (deblocare, tip). Zero când
 * conținutul e al contului oficial (platforma nu se plătește pe sine) și când
 * plătitorul e chiar proprietarul (altfel ar putea „recicla" SWYP prin pool).
 * Folosită de Movies și Music cu propriul `shareBps`.
 */
export function platformShareUnits(amountUnits: number, ownerUserId: string, viewerUserId: string, shareBps: number): number {
    if (amountUnits <= 0) return 0;
    if (ownerUserId === SWYPIK_OFFICIAL_ID || ownerUserId === viewerUserId) return 0;
    return Math.floor((amountUnits * shareBps) / 10_000);
}
