/**
 * URL-ul public al aplicației — sursă unică de adevăr.
 * NEXT_PUBLIC_APP_URL e inline-uit la build, deci merge și pe client.
 */
export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "https://swypik.com"
).replace(/\/$/, "");
