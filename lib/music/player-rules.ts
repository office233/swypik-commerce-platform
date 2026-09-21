/**
 * Reguli pure ale player-ului (testabile fără React).
 *
 * De ce avansăm în coadă: `locked` = piesa curentă a răspuns 402 și sărim
 * peste ea — paywall-ul trebuie să rămână vizibil ca userul să poată debloca;
 * orice altă cauză (acțiunea userului, sfârșitul piesei, eroare) îl închide.
 */
export type AdvanceReason = "user" | "locked" | "ended" | "error";

export function lockedAfterAdvance<L>(previous: L | null, reason: AdvanceReason): L | null {
    return reason === "locked" ? previous : null;
}
