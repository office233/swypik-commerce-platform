/**
 * Email transport — abstractizare peste Resend și SMTP.
 *
 * Ordinea de alegere:
 *   1. RESEND_API_KEY  → Resend (API HTTP, cel mai simplu)
 *   2. SMTP_HOST       → SMTP clasic (IONOS, Amazon SES, Gmail, orice)
 *   3. niciunul        → no-op, doar log (dev)
 *
 * Toate rutele existente cheamă `sendMail()`; nu trebuie să știe ce provider e.
 *
 * Variabile SMTP:
 *   SMTP_HOST, SMTP_PORT (465 = TLS implicit, 587 = STARTTLS),
 *   SMTP_USER, SMTP_PASS, SMTP_SECURE ("1" pentru 465)
 */
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "email-transport" });

export type MailProvider = "resend" | "smtp" | "none";

export interface MailInput {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    headers?: Record<string, string>;
}

const FROM = process.env.EMAIL_FROM || "Swypik <noreply@swypik.com>";

let _resend: Resend | null = null;
let _smtp: Transporter | null = null;

export function activeProvider(): MailProvider {
    const key = process.env.RESEND_API_KEY;
    if (key && !key.includes("placeholder")) return "resend";
    if (process.env.SMTP_HOST) return "smtp";
    return "none";
}

function getResend(): Resend | null {
    const key = process.env.RESEND_API_KEY;
    if (!key || key.includes("placeholder")) return null;
    if (!_resend) _resend = new Resend(key);
    return _resend;
}

function getSmtp(): Transporter | null {
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    if (_smtp) return _smtp;

    const port = Number(process.env.SMTP_PORT) || 587;
    _smtp = nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE === "1" || port === 465,
        auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
            : undefined,
        // rate-limit prietenos cu providerii care limitează conexiunile
        pool: true,
        maxConnections: 3,
        maxMessages: 50,
    });
    return _smtp;
}

/**
 * Trimite un email prin providerul configurat.
 * Returnează `true` dacă a plecat (sau dacă nu există provider — nu blocăm fluxul).
 */
export async function sendMail(input: MailInput): Promise<boolean> {
    const provider = activeProvider();

    if (provider === "none") {
        log.warn({ to: maskEmail(input.to), subject: input.subject }, "email skipped — niciun provider configurat");
        return true;
    }

    try {
        if (provider === "resend") {
            const r = getResend();
            if (!r) return true;
            const { error } = await r.emails.send({
                from: FROM,
                to: input.to,
                subject: input.subject,
                html: input.html,
                text: input.text,
                replyTo: input.replyTo,
                headers: input.headers,
            });
            if (error) {
                log.error({ err: error, to: maskEmail(input.to) }, "resend send failed");
                return false;
            }
            return true;
        }

        const t = getSmtp();
        if (!t) return true;
        await t.sendMail({
            from: FROM,
            to: input.to,
            subject: input.subject,
            html: input.html,
            text: input.text,
            replyTo: input.replyTo,
            headers: input.headers,
        });
        return true;
    } catch (err) {
        log.error({ err, provider, to: maskEmail(input.to) }, "email send failed");
        return false;
    }
}

/** Verifică dacă providerul chiar funcționează (pentru /api/health). */
export async function verifyTransport(): Promise<{ ok: boolean; provider: MailProvider; error?: string }> {
    const provider = activeProvider();
    if (provider === "none") return { ok: false, provider };
    if (provider === "resend") return { ok: true, provider };
    try {
        const t = getSmtp();
        if (!t) return { ok: false, provider, error: "smtp not initialised" };
        await t.verify();
        return { ok: true, provider };
    } catch (err) {
        return { ok: false, provider, error: (err as Error).message };
    }
}

function maskEmail(e: string | null | undefined): string {
    if (!e || !e.includes("@")) return "<none>";
    const [u, d] = e.split("@");
    return `${u.slice(0, 2)}***@${d}`;
}
