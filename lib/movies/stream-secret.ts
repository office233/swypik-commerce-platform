/** Secretul HMAC pentru token-urile de stream — același ca la sesiunile anonime (APP_ENCRYPTION_KEY). */
export function getStreamSecret(): string {
    const key = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "";
    if (!key) {
        if (process.env.NODE_ENV === "production") throw new Error("APP_ENCRYPTION_KEY missing — refusing to sign stream tokens");
        return "dev-only-stream-secret";
    }
    return key;
}

/** Originile de pe care proxy-ul are voie să tragă media (anti-SSRF). */
export function allowedMediaOrigins(): string[] {
    return [process.env.S3_PUBLIC_URL, process.env.R2_PUBLIC_URL, process.env.S3_UPLOAD_PUBLIC_ENDPOINT]
        .filter((v): v is string => Boolean(v))
        .map((v) => new URL(v).origin);
}
