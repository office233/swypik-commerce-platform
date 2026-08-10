/**
 * URL-ul public al aplicației — sursă unică de adevăr.
 * NEXT_PUBLIC_APP_URL e inline-uit la build, deci merge și pe client.
 *
 * 2026-08-10 (audit P1): în producție, dacă lipsesc ambele variabile, folosim
 * fallback-ul dar logăm un warning (server-side) ca să nu treacă neobservat.
 */
const RESOLVED_APP_URL =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    null;

if (
    !RESOLVED_APP_URL &&
    process.env.NODE_ENV === "production" &&
    typeof window === "undefined"
) {
    // eslint-disable-next-line no-console
    console.error(
        "[app-url] NEXT_PUBLIC_APP_URL/APP_URL lipsesc în producție — se folosește fallback-ul https://swypik.com. Link-urile din email/OAuth pot fi greșite pe staging.",
    );
}

export const APP_URL = (
    RESOLVED_APP_URL || "https://swypik.com"
).replace(/\/$/, "");
