"use client";

/**
 * Swypik Pay — portofelul SWYP + mining zilnic.
 *
 * Trei zone:
 *  1. Sold + valoarea "în app" (SWYP e mijloc de plată, nu promisiune de preț);
 *  2. Butonul de mining (sesiune 24h, rată înghețată, streak, halving global);
 *  3. Istoricul din ledger + linkul de transparență (supply public).
 *
 * NOTĂ LEGALĂ: niciun text de aici nu promite creștere de valoare. SWYP e
 * monedă internă netradabilă (swyp_config.tradable=false) în această fază.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Coins, Pickaxe, Flame, Users, History, ShieldCheck, Loader2, Share2 } from "lucide-react";

type Mining = {
    active: boolean;
    sessionId: string | null;
    endsAt: string | null;
    claimable: boolean;
    rateUnits: string;
    streakDays: number;
    halvings: number;
    networkUsers: number;
    miners: number;
};

type ChainWallet = { address: string; createdAt: string; exportedAt: string | null };

type LedgerRow = {
    id: string;
    direction: "in" | "out";
    amount_units: string;
    kind: string;
    ref_type: string;
    description: string | null;
    created_at: string;
};

const fmtSwyp = (units: string | bigint) => (Number(units) / 100).toLocaleString("ro-RO", { maximumFractionDigits: 2 });

function useCountdown(target: string | null) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!target) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [target]);
    if (!target) return null;
    const ms = Math.max(0, new Date(target).getTime() - now);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return { done: ms === 0, label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
}

export default function PayClient() {
    const [balance, setBalance] = useState<string | null>(null);
    const [history, setHistory] = useState<LedgerRow[]>([]);
    const [mining, setMining] = useState<Mining | null>(null);
    const [busy, setBusy] = useState(false);
    const [unauthorized, setUnauthorized] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [wallet, setWallet] = useState<ChainWallet | null>(null);
    const [addrCopied, setAddrCopied] = useState(false);

    const load = useCallback(async () => {
        const [wRes, mRes] = await Promise.all([fetch("/api/swyp/wallet"), fetch("/api/swyp/mining")]);
        if (wRes.status === 401 || mRes.status === 401) { setUnauthorized(true); return; }
        const w = await wRes.json();
        const m = await mRes.json();
        if (w.success) { setBalance(w.balanceUnits); setHistory(w.history); }
        if (m.success) setMining(m.mining);
        if (m.wallet) setWallet(m.wallet);
        fetch("/api/me/referral")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d?.shareUrl) setShareUrl(d.shareUrl); })
            .catch(() => { });
    }, []);

    useEffect(() => { load().catch(() => { }); }, [load]);

    const countdown = useCountdown(mining?.active ? mining.endsAt : null);
    const claimable = Boolean(mining?.active && (mining.claimable || countdown?.done));

    const act = useCallback(async (action: "start" | "claim") => {
        setBusy(true);
        try {
            const res = await fetch("/api/swyp/mining", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            if (data.status) setMining(data.status);
            else if (data.mining) setMining(data.mining);
            await load();
        } finally {
            setBusy(false);
        }
    }, [load]);

    const ratePerSession = useMemo(() => (mining ? fmtSwyp(mining.rateUnits) : "—"), [mining]);
    // Rata pe oră (sesiune de 24h) — afișaj stil Pi: "0,42 SWYP/h"
    const ratePerHour = useMemo(() => {
        if (!mining) return "—";
        return (Number(mining.rateUnits) / 100 / 24).toLocaleString("ro-RO", { maximumFractionDigits: 2 });
    }, [mining]);
    // Câți SWYP s-au "minat" până acum în sesiunea curentă (proporțional cu timpul scurs).
    const minedSoFar = useMemo(() => {
        if (!mining?.active || !mining.endsAt) return "0";
        const total = Number(mining.rateUnits) / 100;
        const endMs = new Date(mining.endsAt).getTime();
        const startMs = endMs - 24 * 3_600_000;
        const frac = Math.min(1, Math.max(0, (Date.now() - startMs) / (endMs - startMs)));
        return (total * frac).toLocaleString("ro-RO", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        // countdown re-randează componenta în fiecare secundă, deci contorul crește live
    }, [mining, countdown]);

    if (unauthorized) {
        return (
            <main className="min-h-screen bg-[#0D0D0D] text-white flex flex-col items-center justify-center gap-4 p-6">
                <Coins size={48} className="text-[#F5A623]" />
                <h1 className="text-2xl font-black">Swypik Pay</h1>
                <p className="text-white/60 text-center max-w-sm">Conectează-te ca să-ți vezi portofelul SWYP și să pornești mining-ul zilnic.</p>
                <Link href="/account?redirect=%2Fpay" className="rounded-2xl bg-[#F5A623] px-6 py-3 font-black text-black">
                    Intră în cont
                </Link>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#0D0D0D] text-white pb-24">
            {/* ── Sold ── */}
            <section className="px-5 pt-8 pb-6 bg-gradient-to-b from-[#F5A623]/15 to-transparent">
                <div className="flex items-center gap-2 text-[#F5A623]">
                    <Coins size={20} />
                    <h1 className="text-lg font-black uppercase tracking-wider">Swypik Pay</h1>
                </div>
                <p className="mt-4 text-4xl font-black">
                    {balance === null ? <span className="inline-block h-9 w-40 rounded bg-white/10 animate-pulse" /> : <>{fmtSwyp(balance)} <span className="text-lg text-[#F5A623]">SWYP</span></>}
                </p>
                <p className="mt-1 text-xs text-white/50">Monedă internă Swypik — o folosești la reduceri, boost-uri și tips în aplicație.</p>
            </section>

            {/* ── Portofel on-chain (Swypik Chain) ── */}
            {wallet && (
                <section className="px-5 mt-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-black uppercase tracking-wider text-white/60">
                                🔗 Portofelul tău pe Swypik Chain
                            </p>
                            <span className="text-[10px] font-bold text-[#2DBE60]">chain ID 643366</span>
                        </div>
                        <button
                            onClick={async () => {
                                await navigator.clipboard.writeText(wallet.address).catch(() => {});
                                setAddrCopied(true);
                                setTimeout(() => setAddrCopied(false), 2000);
                            }}
                            className="mt-2 w-full text-left font-mono text-xs text-[#F5A623] break-all active:opacity-70"
                            title="Apasă pentru a copia"
                        >
                            {wallet.address} {addrCopied ? "✓ copiat" : "⧉"}
                        </button>
                        <p className="mt-2 text-[10px] leading-relaxed text-white/40">
                            Adresa ta reală pe blockchainul Swypik — creată automat, a ta pentru totdeauna.
                            Aici vei putea retrage SWYP din aplicație (în curând) și îl vei vedea în orice
                            portofel compatibil Ethereum.
                        </p>
                    </div>
                </section>
            )}

            {/* ── Mining ── */}
            <section className="px-5 mt-2">
                <div className="rounded-3xl border border-[#F5A623]/30 bg-gradient-to-br from-[#1A1A1A] to-[#0D0D0D] p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Pickaxe size={18} className="text-[#F5A623]" />
                            <h2 className="font-black">Mining zilnic</h2>
                        </div>
                        <span className="text-xs font-bold text-[#F5A623]">⚡ {ratePerHour} SWYP/h</span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/40">{ratePerSession} SWYP pe sesiunea de 24h</p>

                    <div className="mt-5 flex flex-col items-center gap-3">
                        {!mining?.active && (
                            <button
                                onClick={() => act("start")}
                                disabled={busy || !mining}
                                className="w-40 h-40 rounded-full bg-gradient-to-br from-[#F5A623] to-[#D4830B] text-black font-black text-lg shadow-[0_0_60px_-15px_#F5A623] active:scale-95 transition disabled:opacity-50 flex items-center justify-center"
                            >
                                {busy ? <Loader2 className="animate-spin" /> : "Pornește"}
                            </button>
                        )}
                        {mining?.active && !claimable && (
                            <div className="w-40 h-40 rounded-full border-4 border-[#F5A623]/40 flex flex-col items-center justify-center">
                                <span className="text-xl font-black tabular-nums text-[#F5A623]">
                                    {minedSoFar} <span className="text-[10px]">SWYP</span>
                                </span>
                                <span className="text-[10px] uppercase tracking-wider text-white/50">minat până acum</span>
                                <span className="mt-1 text-xs font-bold tabular-nums text-white/60">{countdown?.label ?? "…"}</span>
                            </div>
                        )}
                        {claimable && (
                            <button
                                onClick={() => act("claim")}
                                disabled={busy}
                                className="w-40 h-40 rounded-full bg-gradient-to-br from-[#2DBE60] to-[#188A41] text-black font-black text-lg shadow-[0_0_60px_-15px_#2DBE60] active:scale-95 transition disabled:opacity-50 flex items-center justify-center"
                            >
                                {busy ? <Loader2 className="animate-spin" /> : `Revendică ${ratePerSession}`}
                            </button>
                        )}
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-2xl bg-white/5 p-3">
                            <Flame size={14} className="mx-auto text-[#F5A623]" />
                            <p className="mt-1 text-sm font-black">{mining?.streakDays ?? "—"}</p>
                            <p className="text-[10px] text-white/50">zile streak (+10%/zi)</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                            <Users size={14} className="mx-auto text-[#F5A623]" />
                            <p className="mt-1 text-sm font-black">{mining?.miners?.toLocaleString("ro-RO") ?? "—"}</p>
                            <p className="text-[10px] text-white/50">mineri în rețea</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                            <ShieldCheck size={14} className="mx-auto text-[#F5A623]" />
                            <p className="mt-1 text-sm font-black">{mining ? `${mining.halvings}/4` : "—"}</p>
                            <p className="text-[10px] text-white/50">halving-uri</p>
                        </div>
                    </div>

                    <p className="mt-4 text-[11px] leading-relaxed text-white/40">
                        Rata scade pe măsură ce rețeaua crește — cine minează devreme câștigă mai mult pe sesiune.
                        Supply fix: 10 miliarde SWYP, verificabil public.
                    </p>

                    <button
                        onClick={async () => {
                            const url = shareUrl ?? "https://swypik.com";
                            const text = `Minez SWYP pe Swypik — pornește și tu, e gratis: ${url}`;
                            if (navigator.share) {
                                try { await navigator.share({ title: "Swypik Pay", text, url }); return; } catch { /* anulat */ }
                            }
                            await navigator.clipboard.writeText(text).catch(() => { });
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2500);
                        }}
                        className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl bg-[#F5A623]/15 border border-[#F5A623]/40 px-4 py-3 font-black text-sm text-[#F5A623] active:scale-[0.98] transition"
                    >
                        <Share2 size={16} />
                        {copied ? "Link copiat! Trimite-l unui prieten" : "Invită un prieten → +50 SWYP la prima lui comandă"}
                    </button>
                </div>
            </section>

            {/* ── Cum câștigi ── */}
            <section className="px-5 mt-6">
                <h3 className="text-sm font-black uppercase tracking-wider text-white/70 mb-3">Câștigă mai mult</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                        ["🚗", "Curse Swypik Go", "+20 SWYP/cursă"],
                        ["🍔", "Livrări la timp", "+15 SWYP/livrare"],
                        ["🎬", "Clipuri virale", "+10 SWYP/1k vizionări"],
                        ["⭐", "Recenzii după comandă", "+5 SWYP"],
                    ].map(([emoji, label, amount]) => (
                        <div key={label} className="rounded-2xl bg-white/5 p-3 flex items-center gap-3">
                            <span className="text-xl">{emoji}</span>
                            <div>
                                <p className="font-bold text-xs">{label}</p>
                                <p className="text-[10px] text-[#F5A623] font-black">{amount}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Istoric ── */}
            <section className="px-5 mt-6">
                <div className="flex items-center gap-2 mb-3">
                    <History size={14} className="text-white/50" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-white/70">Istoric</h3>
                </div>
                {history.length === 0 ? (
                    <p className="text-xs text-white/40">Nicio tranzacție încă — pornește mining-ul de mai sus. ⛏️</p>
                ) : (
                    <ul className="space-y-2">
                        {history.map((h) => (
                            <li key={h.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                                <div>
                                    <p className="text-xs font-bold">{h.description ?? h.ref_type}</p>
                                    <p className="text-[10px] text-white/40">{new Date(h.created_at).toLocaleString("ro-RO")}</p>
                                </div>
                                <span className={`text-sm font-black ${h.direction === "in" ? "text-[#2DBE60]" : "text-white/70"}`}>
                                    {h.direction === "in" ? "+" : "−"}{fmtSwyp(h.amount_units)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* ── Transparență ── */}
            <section className="px-5 mt-6">
                <a
                    href="/api/swyp/supply"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60 hover:bg-white/10 transition"
                >
                    <ShieldCheck size={16} className="text-[#F5A623]" />
                    <span>
                        <strong className="text-white">Transparență totală:</strong> supply-ul, trezoreria și integritatea
                        ledger-ului sunt publice și verificabile de oricine.
                    </span>
                </a>
            </section>
        </main>
    );
}
