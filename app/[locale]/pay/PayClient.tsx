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
import { useTranslations, useLocale } from "next-intl";
import { Coins, Pickaxe, Flame, Users, History, ShieldCheck, Loader2, Share2, Lock, Wallet, Car, Bike, Clapperboard, Star } from "lucide-react";
import { APP_URL } from "@/lib/app-url";

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

type StakeRow = {
    id: string;
    amount_units: string;
    term_months: number;
    apy_bps: number;
    status: string;
    matures_at: string;
};

type StakingInfo = {
    stakes: StakeRow[];
    totalStakedUnits: string;
    stakers: number;
    apyBps: Record<string, number>;
};

type LedgerRow = {
    id: string;
    direction: "in" | "out";
    amount_units: string;
    kind: string;
    ref_type: string;
    description: string | null;
    created_at: string;
};

const fmtSwyp = (units: string | bigint, locale?: string) =>
    (Number(units) / 100).toLocaleString(locale, { maximumFractionDigits: 2 });

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
    const t = useTranslations("payPage");
    const locale = useLocale();
    const [balance, setBalance] = useState<string | null>(null);
    const [history, setHistory] = useState<LedgerRow[]>([]);
    const [mining, setMining] = useState<Mining | null>(null);
    const [busy, setBusy] = useState(false);
    const [unauthorized, setUnauthorized] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [wallet, setWallet] = useState<ChainWallet | null>(null);
    const [addrCopied, setAddrCopied] = useState(false);
    const [withdrawBusy, setWithdrawBusy] = useState(false);
    const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null);
    const [lastTxUrl, setLastTxUrl] = useState<string | null>(null);
    const [sendOpen, setSendOpen] = useState(false);
    const [sendTo, setSendTo] = useState("");
    const [sendAmount, setSendAmount] = useState("");
    const [sendBusy, setSendBusy] = useState(false);
    const [sendMsg, setSendMsg] = useState<string | null>(null);
    const [sendTxUrl, setSendTxUrl] = useState<string | null>(null);
    const [depositAddr, setDepositAddr] = useState<string | null>(null);
    const [depositOpen, setDepositOpen] = useState(false);
    const [depCopied, setDepCopied] = useState(false);
    const [staking, setStaking] = useState<StakingInfo | null>(null);
    const [stakeBusy, setStakeBusy] = useState(false);
    const [stakeMsg, setStakeMsg] = useState<string | null>(null);
    // Modal de sumă (înlocuiește prompt()) + modal de confirmare (înlocuiește confirm())
    const [amountModal, setAmountModal] = useState<{ kind: "withdraw" } | { kind: "stake"; months: 3 | 6 | 12 } | null>(null);
    const [amountValue, setAmountValue] = useState("");
    const [confirmModal, setConfirmModal] = useState<{ text: string; onYes: () => void } | null>(null);
    const [aboutOpen, setAboutOpen] = useState<number | null>(null);
    // Reguli de câștig din DB (swyp_emission_rules) — zero hardcodări în UI.
    const [earnRules, setEarnRules] = useState<{ action: string; label: string; display: string }[]>([]);

    useEffect(() => {
        fetch("/api/swyp/earn-rules")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d?.success) setEarnRules(d.rules); })
            .catch(() => { /* secțiunea se ascunde dacă API-ul nu răspunde */ });
    }, []);

    const load = useCallback(async () => {
        const [wRes, mRes] = await Promise.all([fetch("/api/swyp/wallet"), fetch("/api/swyp/mining")]);
        if (wRes.status === 401 || mRes.status === 401) { setUnauthorized(true); return; }
        const w = await wRes.json();
        const m = await mRes.json();
        if (w.success) { setBalance(w.balanceUnits); setHistory(w.history); }
        if (w.success && w.depositAddress) setDepositAddr(w.depositAddress);
        if (m.success) setMining(m.mining);
        if (m.wallet) setWallet(m.wallet);
        fetch("/api/me/referral")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d?.shareUrl) setShareUrl(d.shareUrl); })
            .catch(() => { });
        fetch("/api/swyp/stake")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d?.success) setStaking(d); })
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
        return (Number(mining.rateUnits) / 100 / 24).toLocaleString(locale, { maximumFractionDigits: 2 });
    }, [mining, locale]);
    // Câți SWYP s-au "minat" până acum în sesiunea curentă (proporțional cu timpul scurs).
    const minedSoFar = useMemo(() => {
        if (!mining?.active || !mining.endsAt) return "0";
        const total = Number(mining.rateUnits) / 100;
        const endMs = new Date(mining.endsAt).getTime();
        const startMs = endMs - 24 * 3_600_000;
        const frac = Math.min(1, Math.max(0, (Date.now() - startMs) / (endMs - startMs)));
        return (total * frac).toLocaleString(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        // countdown re-randează componenta în fiecare secundă, deci contorul crește live
    }, [mining, countdown, locale]);

    // ── Acțiuni cu sumă (după confirmarea din modal) ──
    const doWithdraw = useCallback(async (amount: number) => {
        setWithdrawBusy(true);
        setWithdrawMsg(null);
        try {
            const res = await fetch("/api/swyp/withdraw", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amountSwyp: amount }),
            });
            const data = await res.json();
            if (data.success) {
                setWithdrawMsg(t("withdrawOk"));
                setLastTxUrl(data.explorerUrl);
                await load();
            } else {
                const reasons: Record<string, string> = {
                    insufficient_funds: t("errInsufficient"),
                    min_1_swyp: t("errMin1"),
                    invalid_amount: t("errInvalidAmount"),
                    rate_limited: t("errRateLimited"),
                    chain_unavailable_refunded: t("errChainRefunded"),
                };
                setWithdrawMsg(`✗ ${reasons[data.error] ?? data.error}`);
            }
        } catch {
            setWithdrawMsg(t("errNetwork"));
        } finally {
            setWithdrawBusy(false);
        }
    }, [load, t]);

    const doStake = useCallback(async (amount: number, months: 3 | 6 | 12) => {
        setStakeBusy(true);
        setStakeMsg(null);
        try {
            const res = await fetch("/api/swyp/stake", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "stake", amountSwyp: amount, termMonths: months }),
            });
            const d = await res.json();
            const errs: Record<string, string> = {
                insufficient_funds: t("errInsufficient"),
                invalid_amount: t("errInvalidAmount"),
                rate_limited: t("errRateLimited"),
            };
            setStakeMsg(d.success ? t("stakeOk", { months }) : `✗ ${errs[d.error] ?? d.error}`);
            await load();
        } finally {
            setStakeBusy(false);
        }
    }, [load, t]);

    if (unauthorized) {
        return (
            <main className="min-h-screen bg-[#0D0D0D] text-white flex flex-col items-center justify-center gap-4 p-6">
                <Coins size={48} className="text-[#F5A623]" />
                <h1 className="text-2xl font-black">Swypik Pay</h1>
                <p className="text-white/60 text-center max-w-sm">{t("loginPrompt")}</p>
                <Link href="/account?redirect=%2Fpay" className="rounded-2xl bg-[#F5A623] px-6 py-3 font-black text-black">
                    {t("loginCta")}
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
                    {balance === null ? <span className="inline-block h-9 w-40 rounded bg-white/10 animate-pulse" /> : <>{fmtSwyp(balance, locale)} <span className="text-lg text-[#F5A623]">SWYP</span></>}
                </p>
                <p className="mt-1 text-xs text-white/50">{t("balanceNote")}</p>
            </section>

            {/* ── Portofel on-chain (Swypik Chain) ── */}
            {wallet && (
                <section className="px-5 mt-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-black uppercase tracking-wider text-white/60">
                                {t("walletTitle")}
                            </p>
                            <span className="text-[10px] font-bold text-[#2DBE60]">chain ID 643366</span>
                        </div>
                        <button
                            onClick={async () => {
                                await navigator.clipboard.writeText(wallet.address).catch(() => { });
                                setAddrCopied(true);
                                setTimeout(() => setAddrCopied(false), 2000);
                            }}
                            className="mt-2 w-full text-left font-mono text-xs text-[#F5A623] break-all active:opacity-70"
                            title={t("copyHint")}
                        >
                            {wallet.address} {addrCopied ? t("copied") : "⧉"}
                        </button>
                        <p className="mt-2 text-[10px] leading-relaxed text-white/40">
                            {t("walletNote")}
                        </p>

                        <button
                            onClick={() => { setAmountValue(""); setAmountModal({ kind: "withdraw" }); }}
                            disabled={withdrawBusy || balance === null || BigInt(balance ?? "0") < 100n}
                            className="mt-3 w-full rounded-xl bg-[#F5A623] px-4 py-2.5 text-sm font-black text-black active:scale-[0.98] transition disabled:opacity-40"
                        >
                            {withdrawBusy ? t("withdrawBusy") : t("withdraw")}
                        </button>
                        {withdrawMsg && (
                            <p className="mt-2 text-xs font-bold text-white/80">
                                {withdrawMsg}{" "}
                                {lastTxUrl && (
                                    <a href={lastTxUrl} target="_blank" rel="noopener noreferrer" className="text-[#F5A623] underline">
                                        {t("viewTx")}
                                    </a>
                                )}
                            </p>
                        )}

                        {/* ── Trimite SWYP (P2P on-chain) ── */}
                        <button
                            onClick={() => { setSendOpen((v) => !v); setSendMsg(null); }}
                            className="mt-2 w-full rounded-xl border border-[#F5A623]/40 px-4 py-2.5 text-sm font-black text-[#F5A623] active:scale-[0.98] transition"
                        >
                            {sendOpen ? t("sendClose") : t("sendOpen")}
                        </button>
                        {sendOpen && (
                            <div className="mt-3 space-y-2">
                                <input
                                    value={sendTo}
                                    onChange={(e) => setSendTo(e.target.value.trim())}
                                    placeholder={t("sendToPlaceholder")}
                                    spellCheck={false}
                                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 font-mono text-xs text-white placeholder:text-white/30 focus:border-[#F5A623]/60 outline-none"
                                />
                                <input
                                    value={sendAmount}
                                    onChange={(e) => setSendAmount(e.target.value)}
                                    placeholder={t("sendAmountPlaceholder")}
                                    inputMode="decimal"
                                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[#F5A623]/60 outline-none"
                                />
                                <button
                                    onClick={async () => {
                                        const amount = Number(sendAmount.replace(",", "."));
                                        if (!/^0x[0-9a-fA-F]{40}$/.test(sendTo)) { setSendMsg(t("errAddress")); return; }
                                        if (!Number.isFinite(amount) || amount < 0.01) { setSendMsg(t("errMinSend")); return; }
                                        setConfirmModal({
                                            text: t("sendConfirm", { amount, address: `${sendTo.slice(0, 10)}…${sendTo.slice(-8)}` }),
                                            onYes: async () => {
                                                setSendBusy(true);
                                                setSendMsg(null);
                                                setSendTxUrl(null);
                                                try {
                                                    const res = await fetch("/api/swyp/transfer", {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ toAddress: sendTo, amountSwyp: amount }),
                                                    });
                                                    const data = await res.json();
                                                    if (data.success) {
                                                        setSendMsg(data.pending ? t("sendPending") : t("sendOk"));
                                                        setSendTxUrl(data.explorerUrl);
                                                        setSendTo(""); setSendAmount("");
                                                    } else {
                                                        const reasons: Record<string, string> = {
                                                            invalid_address: t("errAddress"),
                                                            invalid_amount: t("errInvalidAmount"),
                                                            min_amount: t("errMinSend"),
                                                            self_transfer: t("errSelfTransfer"),
                                                            insufficient_chain_balance: t("errChainBalance"),
                                                            rate_limited: t("errRateLimited"),
                                                            chain_failed: t("errChainFailed"),
                                                        };
                                                        setSendMsg(`✗ ${reasons[data.error] ?? data.error}`);
                                                    }
                                                } catch {
                                                    setSendMsg(t("errNetwork"));
                                                } finally {
                                                    setSendBusy(false);
                                                }
                                            },
                                        });
                                    }}
                                    disabled={sendBusy}
                                    className="w-full rounded-xl bg-[#F5A623] px-4 py-2.5 text-sm font-black text-black active:scale-[0.98] transition disabled:opacity-40"
                                >
                                    {sendBusy ? t("sending") : t("sendNow")}
                                </button>
                                <p className="text-[10px] leading-relaxed text-white/40">
                                    {t("sendNote")}
                                </p>
                                {sendMsg && (
                                    <p className="text-xs font-bold text-white/80">
                                        {sendMsg}{" "}
                                        {sendTxUrl && (
                                            <a href={sendTxUrl} target="_blank" rel="noopener noreferrer" className="text-[#F5A623] underline">
                                                {t("viewTx")}
                                            </a>
                                        )}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ── Depune SWYP (chain → app) ── */}
                        {depositAddr && (
                            <>
                                <button
                                    onClick={() => setDepositOpen((v) => !v)}
                                    className="mt-2 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-black text-white/80 active:scale-[0.98] transition"
                                >
                                    {depositOpen ? t("depositClose") : t("depositOpen")}
                                </button>
                                {depositOpen && (
                                    <div className="mt-3 space-y-2">
                                        <p className="text-xs text-white/60">{t("depositHint")}</p>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(depositAddr).then(() => {
                                                    setDepCopied(true);
                                                    setTimeout(() => setDepCopied(false), 2000);
                                                });
                                            }}
                                            className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 font-mono text-[11px] text-white/90 break-all text-left active:scale-[0.99] transition"
                                        >
                                            {depositAddr}
                                            <span className="block mt-1 text-[10px] font-sans font-bold text-[#F5A623]">
                                                {depCopied ? t("depositCopied") : t("depositCopy")}
                                            </span>
                                        </button>
                                        <p className="text-[10px] leading-relaxed text-white/40">{t("depositNote")}</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </section>
            )}

            {/* ── Mining ── */}
            <section className="px-5 mt-2">
                <div className="rounded-3xl border border-[#F5A623]/30 bg-gradient-to-br from-[#1A1A1A] to-[#0D0D0D] p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Pickaxe size={18} className="text-[#F5A623]" />
                            <h2 className="font-black">{t("miningTitle")}</h2>
                        </div>
                        <span className="text-xs font-bold text-[#F5A623]">{t("perHour", { rate: ratePerHour })}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/40">{t("perSession", { rate: ratePerSession })}</p>

                    <div className="mt-5 flex flex-col items-center gap-3">
                        {!mining?.active && (
                            <button
                                onClick={() => act("start")}
                                disabled={busy || !mining}
                                className="w-40 h-40 rounded-full bg-gradient-to-br from-[#F5A623] to-[#D4830B] text-black font-black text-lg shadow-[0_0_60px_-15px_#F5A623] active:scale-95 transition disabled:opacity-50 flex items-center justify-center"
                            >
                                {busy ? <Loader2 className="animate-spin" /> : t("start")}
                            </button>
                        )}
                        {mining?.active && !claimable && (
                            <div className="w-40 h-40 rounded-full border-4 border-[#F5A623]/40 flex flex-col items-center justify-center">
                                <span className="text-xl font-black tabular-nums text-[#F5A623]">
                                    {minedSoFar} <span className="text-[10px]">SWYP</span>
                                </span>
                                <span className="text-[10px] uppercase tracking-wider text-white/50">{t("minedSoFar")}</span>
                                <span className="mt-1 text-xs font-bold tabular-nums text-white/60">{countdown?.label ?? "…"}</span>
                            </div>
                        )}
                        {claimable && (
                            <button
                                onClick={() => act("claim")}
                                disabled={busy}
                                className="w-40 h-40 rounded-full bg-gradient-to-br from-[#2DBE60] to-[#188A41] text-black font-black text-lg shadow-[0_0_60px_-15px_#2DBE60] active:scale-95 transition disabled:opacity-50 flex items-center justify-center"
                            >
                                {busy ? <Loader2 className="animate-spin" /> : t("claim", { amount: ratePerSession })}
                            </button>
                        )}
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-2xl bg-white/5 p-3">
                            <Flame size={14} className="mx-auto text-[#F5A623]" />
                            <p className="mt-1 text-sm font-black">{mining?.streakDays ?? "—"}</p>
                            <p className="text-[10px] text-white/50">{t("streakLabel")}</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                            <Users size={14} className="mx-auto text-[#F5A623]" />
                            <p className="mt-1 text-sm font-black">{mining?.miners?.toLocaleString(locale) ?? "—"}</p>
                            <p className="text-[10px] text-white/50">{t("minersLabel")}</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                            <ShieldCheck size={14} className="mx-auto text-[#F5A623]" />
                            <p className="mt-1 text-sm font-black">{mining ? `${mining.halvings}/4` : "—"}</p>
                            <p className="text-[10px] text-white/50">{t("halvingsLabel")}</p>
                        </div>
                    </div>

                    <p className="mt-4 text-[11px] leading-relaxed text-white/40">
                        {t("miningNote", { supply: (10_000_000_000).toLocaleString(locale) })}
                    </p>

                    <button
                        onClick={async () => {
                            const url = shareUrl ?? APP_URL;
                            const text = t("shareText", { url });
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
                        {copied
                            ? t("linkCopied")
                            : t("invite", { bonus: earnRules.find((r) => r.action === "referral_validated")?.display ?? t("inviteFallback") })}
                    </button>
                </div>
            </section>

            {/* ── Cum câștigi ── */}
            {earnRules.length > 0 && (
                <section className="px-5 mt-6">
                    <h3 className="text-sm font-black uppercase tracking-wider text-white/70 mb-3">{t("earnTitle")}</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        {earnRules.slice(0, 4).map((rule) => {
                            const Icon =
                                rule.action === "go_ride_completed" ? Car :
                                    rule.action === "eats_delivery_on_time" ? Bike :
                                        rule.action === "creator_1k_views" ? Clapperboard : Star;
                            return (
                                <div key={rule.action} className="rounded-2xl bg-white/5 p-3 flex items-center gap-3">
                                    <Icon size={20} className="text-[#F5A623] shrink-0" />
                                    <div>
                                        <p className="font-bold text-xs">{rule.label}</p>
                                        <p className="text-[10px] text-[#F5A623] font-black">{rule.display}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ── Istoric ── */}
            {/* ── Staking ── */}
            <section className="px-5 mt-6">
                <div className="rounded-3xl border border-[#2DBE60]/30 bg-gradient-to-br from-[#0F2A18] to-[#0D0D0D] p-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Lock size={16} className="text-[#2DBE60]" />
                            <h3 className="font-black text-sm">{t("stakingTitle")}</h3>
                        </div>
                        {staking && (
                            <span className="text-[10px] font-bold text-white/50">
                                {t("stakingSummary", { amount: fmtSwyp(staking.totalStakedUnits, locale), stakers: staking.stakers })}
                            </span>
                        )}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {([3, 6, 12] as const).map((m) => {
                            const bps = staking?.apyBps?.[String(m)] ?? 0;
                            return (
                                <button
                                    key={m}
                                    onClick={() => { setAmountValue(""); setAmountModal({ kind: "stake", months: m }); }}
                                    disabled={stakeBusy || balance === null || BigInt(balance ?? "0") < 100n}
                                    className="rounded-2xl bg-white/5 border border-[#2DBE60]/20 p-3 active:scale-95 transition disabled:opacity-40"
                                >
                                    <p className="text-lg font-black text-[#2DBE60]">{(bps / 100).toFixed(0)}%</p>
                                    <p className="text-[10px] text-white/50">{t("months", { months: m })}</p>
                                </button>
                            );
                        })}
                    </div>
                    {stakeMsg && <p className="mt-2 text-xs font-bold text-white/80">{stakeMsg}</p>}

                    {staking && staking.stakes.length > 0 && (
                        <ul className="mt-4 space-y-2">
                            {staking.stakes.filter((s) => s.status === "active").map((s) => (
                                <li key={s.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                                    <div>
                                        <p className="text-xs font-bold">{fmtSwyp(s.amount_units, locale)} SWYP · {t("months", { months: s.term_months })}</p>
                                        <p className="text-[10px] text-white/40">
                                            {t("unlocksAt", { date: new Date(s.matures_at).toLocaleDateString(locale) })}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setConfirmModal({
                                            text: t("withdrawEarlyConfirm"),
                                            onYes: async () => {
                                                await fetch("/api/swyp/stake", {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ action: "withdraw_early", stakeId: s.id }),
                                                });
                                                await load();
                                            },
                                        })}
                                        className="text-[10px] font-bold text-white/50 underline"
                                    >
                                        {t("withdrawEarly")}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <p className="mt-3 text-[10px] leading-relaxed text-white/40">
                        {t("stakingNote")}
                    </p>
                </div>
            </section>

            <section className="px-5 mt-6">
                <div className="flex items-center gap-2 mb-3">
                    <History size={14} className="text-white/50" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-white/70">{t("historyTitle")}</h3>
                </div>
                {history.length === 0 ? (
                    <p className="text-xs text-white/40">{t("historyEmpty")}</p>
                ) : (
                    <ul className="space-y-2">
                        {history.map((h) => (
                            <li key={h.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                                <div>
                                    <p className="text-xs font-bold">{h.description ?? h.ref_type}</p>
                                    <p className="text-[10px] text-white/40">{new Date(h.created_at).toLocaleString(locale)}</p>
                                </div>
                                <span className={`text-sm font-black ${h.direction === "in" ? "text-[#2DBE60]" : "text-white/70"}`}>
                                    {h.direction === "in" ? "+" : "−"}{fmtSwyp(h.amount_units, locale)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* ── Transparență ── */}
            <section className="px-5 mt-6">
                <a
                    href="https://scan.swypik.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60 hover:bg-white/10 transition"
                >
                    <ShieldCheck size={16} className="text-[#F5A623]" />
                    <span>
                        <strong className="text-white">{t("explorerStrong")}</strong> {t("explorerText")}
                    </span>
                </a>

                <button
                    onClick={async () => {
                        const eth = (window as unknown as { ethereum?: { request: (a: unknown) => Promise<unknown> } }).ethereum;
                        if (!eth) {
                            window.open("https://metamask.io/download/", "_blank");
                            return;
                        }
                        try {
                            await eth.request({
                                method: "wallet_addEthereumChain",
                                params: [{
                                    chainId: "0x9D126", // 643366
                                    chainName: "Swypik Chain",
                                    nativeCurrency: { name: "Swypik", symbol: "SWYP", decimals: 18 },
                                    rpcUrls: ["https://rpc.swypik.com"],
                                    blockExplorerUrls: ["https://scan.swypik.com"],
                                }],
                            });
                        } catch { /* utilizatorul a refuzat */ }
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white/70 hover:bg-white/10 transition"
                >
                    <Wallet size={14} className="text-[#F5A623]" />
                    {t("addMetamask")}
                </button>
            </section>

            {/* ── Ce este SWYP? (educație + transparență) ── */}
            <section className="px-5 mt-6 pb-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-white/70 mb-3">{t("aboutTitle")}</h3>
                <div className="space-y-2">
                    {([1, 2, 3, 4, 5] as const).map((i) => (
                        <div key={i} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                            <button
                                onClick={() => setAboutOpen(aboutOpen === i ? null : i)}
                                className="w-full flex items-center justify-between px-4 py-3 text-left"
                            >
                                <span className="text-xs font-bold text-white/90">{t(`aboutQ${i}`)}</span>
                                <span className="text-white/40 text-xs ml-2 shrink-0">{aboutOpen === i ? "−" : "+"}</span>
                            </button>
                            {aboutOpen === i && (
                                <p className="px-4 pb-3 text-[11px] leading-relaxed text-white/60">{t(`aboutA${i}`)}</p>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Modal sumă (înlocuiește prompt) ── */}
            {amountModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => setAmountModal(null)}>
                    <div className="w-full max-w-sm rounded-3xl bg-[#1A1A1A] border border-white/10 p-5" onClick={(e) => e.stopPropagation()}>
                        <p className="text-sm font-black text-white">
                            {amountModal.kind === "withdraw" ? t("amountPromptWithdraw") : t("stakePrompt", { months: amountModal.months })}
                        </p>
                        <input
                            autoFocus
                            value={amountValue}
                            onChange={(e) => setAmountValue(e.target.value)}
                            inputMode="decimal"
                            placeholder="1"
                            className="mt-3 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[#F5A623]/60 outline-none"
                        />
                        <div className="mt-4 flex gap-2">
                            <button onClick={() => setAmountModal(null)} className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-white/70">
                                {t("cancel")}
                            </button>
                            <button
                                onClick={() => {
                                    const amount = Number(amountValue.replace(",", "."));
                                    if (!Number.isFinite(amount) || amount < 1) return;
                                    const m = amountModal;
                                    setAmountModal(null);
                                    if (m.kind === "withdraw") void doWithdraw(amount);
                                    else void doStake(amount, m.months);
                                }}
                                disabled={!Number.isFinite(Number(amountValue.replace(",", "."))) || Number(amountValue.replace(",", ".")) < 1}
                                className="flex-1 rounded-xl bg-[#F5A623] px-4 py-2.5 text-sm font-black text-black disabled:opacity-40"
                            >
                                {t("confirm")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal confirmare (înlocuiește confirm) ── */}
            {confirmModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => setConfirmModal(null)}>
                    <div className="w-full max-w-sm rounded-3xl bg-[#1A1A1A] border border-white/10 p-5" onClick={(e) => e.stopPropagation()}>
                        <p className="text-sm font-bold text-white leading-relaxed">{confirmModal.text}</p>
                        <div className="mt-4 flex gap-2">
                            <button onClick={() => setConfirmModal(null)} className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-white/70">
                                {t("cancel")}
                            </button>
                            <button
                                onClick={() => { const m = confirmModal; setConfirmModal(null); void m.onYes(); }}
                                className="flex-1 rounded-xl bg-[#F5A623] px-4 py-2.5 text-sm font-black text-black"
                            >
                                {t("confirm")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
