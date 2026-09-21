/**
 * Utilitare de formatare pentru Swypik Music. `unitsToSwyp` NU se duplică —
 * e reexportat din Movies (același helper: subunități → SWYP, format ro-RO).
 */
export { unitsToSwyp } from "@/components/movies/UnlockButton";

/** Durata în milisecunde → „m:ss" (ex.: 183400 → „3:03"). */
export function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
