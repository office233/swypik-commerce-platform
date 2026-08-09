/**
 * GET /api/swyp/mining/verify?username=<nume> — verificare PUBLICĂ a zilelor de mining.
 *
 * Transparență anti-trișare: oricine poate verifica sesiunile de mining
 * revendicate de un utilizator, fiecare legată criptografic de intrarea din
 * ledger (hash-chain SHA-256, verificat orar de /api/cron/verify-supply).
 *
 * Pentru fiecare sesiune revendicată se expune:
 *  - started_at / ends_at (sesiunea a durat efectiv 24h, nu se poate scurta);
 *  - claimed_at, streak_days, rate_units (rata înghețată la pornire);
 *  - ledger: id, entry_hash, prev_hash — verificabile independent prin
 *    recalcularea lanțului (sha256(prev|from|to|amount|kind|ref_type|ref_id)).
 *
 * Invarianti verificați aici (răspunsul include `checks`):
 *  1. fiecare claim are intrare în ledger cu ref_id = session id;
 *  2. suma din ledger = rate_units din sesiune;
 *  3. claimed_at >= ends_at (nu se poate revendica înainte de final);
 *  4. cel mult o sesiune pe zi (fără suprapuneri).
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { dbQuery } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: Request) => {
    const url = new URL(req.url);
    const username = (url.searchParams.get("username") ?? "").trim().replace(/^@/, "");
    if (!/^[a-zA-Z0-9_.]{2,32}$/.test(username)) {
        return NextResponse.json({ success: false, error: "invalid_username" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
    const limited = await rateLimit("swypMiningVerify", ip);
    if (!limited.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

    const { rows: urows } = await dbQuery<{ id: string; username: string }>(
        `SELECT id::text, username FROM users WHERE lower(username) = lower($1)`,
        [username],
    );
    if (!urows[0]) return NextResponse.json({ success: false, error: "user_not_found" }, { status: 404 });
    const userId = urows[0].id;

    const { rows: sessions } = await dbQuery<{
        id: string; started_at: string; ends_at: string; claimed_at: string | null;
        streak_days: number; rate_units: string;
        ledger_id: string | null; entry_hash: string | null; prev_hash: string | null;
        ledger_amount: string | null;
    }>(
        `SELECT s.id::text, s.started_at::text, s.ends_at::text, s.claimed_at::text,
                s.streak_days, s.rate_units::text,
                le.id::text AS ledger_id, le.entry_hash, le.prev_hash,
                le.amount_units::text AS ledger_amount
           FROM swyp_mining_sessions s
           LEFT JOIN swyp_ledger_entries le ON le.id = s.ledger_entry_id
          WHERE s.user_id = $1
          ORDER BY s.started_at DESC
          LIMIT 100`,
        [userId],
    );

    // Verificări de integritate pe loc — răspunsul spune direct dacă e curat.
    const problems: string[] = [];
    let prevStart: number | null = null;
    for (const s of sessions) {
        if (s.claimed_at) {
            if (!s.ledger_id) problems.push(`session ${s.id}: claim fără intrare în ledger`);
            else if (s.ledger_amount !== s.rate_units)
                problems.push(`session ${s.id}: suma ledger (${s.ledger_amount}) != rata sesiunii (${s.rate_units})`);
            if (new Date(s.claimed_at) < new Date(s.ends_at))
                problems.push(`session ${s.id}: revendicat înainte de final`);
        }
        const st = new Date(s.started_at).getTime();
        if (prevStart !== null && prevStart - st < 24 * 3_600_000 - 60_000)
            problems.push(`session ${s.id}: suprapunere cu sesiunea următoare (sub 24h)`);
        prevStart = st;
    }

    return NextResponse.json({
        success: true,
        username: urows[0].username,
        totalSessions: sessions.length,
        claimedSessions: sessions.filter((s) => s.claimed_at).length,
        checks: { ok: problems.length === 0, problems },
        howToVerify:
            "entry_hash = sha256(prev_hash|from|to|amount_units|kind|ref_type|ref_id). Lanțul complet e verificat orar; supply-ul public: /api/swyp/supply",
        sessions,
    });
});
