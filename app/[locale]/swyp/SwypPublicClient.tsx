"use client";

/**
 * /swyp — pagina publică de transparență a monedei SWYP.
 *
 * Public, fără cont: tokenomics live din /api/swyp/supply și /api/swyp/rate,
 * distribuția trezoreriilor cu bare vizuale, "cum capătă valoare" în 3 pași
 * și acces direct la explorer/RPC/API. Zero cifre statice — totul e citit
 * din API-urile reale, aceleași pe care le poate apela oricine.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Coins, ShieldCheck, ArrowUpRight, Wallet, Landmark, TrendingUp, Store, PiggyBank, Divide, Copy } from "lucide-react";
import { SWYP_CHAIN_ID, SWYP_CHAIN_NAME, SWYP_NATIVE_CURRENCY, SWYP_PUBLIC_RPC_URL, SWYP_EXPLORER_URL } from "@/lib/swyp/chain-public";

type Supply = {
    totalSupplySwyp: string;
    circulatingSwyp: string;
    holders: number;
    treasury: { pool: string; balanceSwyp: string; genesisSwyp: string }[];
};
type Rate = { ron_per_swyp?: string; backed?: boolean };

const POOL_COLORS: Record<string, string> = {
    rewards: "#F5A623",
    ecosystem: "#2DBE60",
    company: "#5B8DEF",
    team: "#B96AF7",
    reserve: "#F76A6A",
    staking: "#8A8F98",
};

export default function SwypPublicClient() {
    const t = useTranslations("swypPublic");
    const locale = useLocale();
    const [supply, setSupply] = useState<Supply | null>(null);
    const [rate, setRate] = useState<Rate | null>(null);
    const [rpcCopied, setRpcCopied] = useState(false);

    useEffect(() => {
        void fetch("/api/swyp/supply").then((r) => (r.ok ? r.json() : null)).then(setSupply).catch(() => { });
        void fetch("/api/swyp/rate").then((r) => (r.ok ? r.json() : null)).then(setRate).catch(() => { });
    }, []);

    const fmt = (n: string | number) => Number(n).toLocaleString(locale);

    const pools = useMemo(() => {
        if (!supply?.treasury) return [];
        const total = Number(supply.totalSupplySwyp) || 1;
        return supply.treasury
            .filter((p) => Number(p.genesisSwyp) > 0)
            .sort((a, b) => Number(b.balanceSwyp) - Number(a.balanceSwyp))
            .map((p) => ({
                ...p,
                pct: (Number(p.balanceSwyp) / total) * 100,
                color: POOL_COLORS[p.pool] ?? "#8A8F98",
            }));
    }, [supply]);

    const rateDisplay = useMemo(() => {
        const v = Number(rate?.ron_per_swyp ?? 0);
        return v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }, [rate, locale]);

    const poolLabel = (pool: string) => {
        const key = `pool${pool.charAt(0).toUpperCase()}${pool.slice(1)}`;
        try { return t(key as never); } catch { return pool; }
    };

    return (
        <main className="min-h-screen bg-[#0B0B0C] text-white pb-24">
            <div className="mx-auto w-full max-w-2xl px-5">

                {/* ── Hero ── */}
                <header className="pt-14 pb-10 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F5A623]/10 border border-[#F5A623]/20">
                        <Coins size={30} className="text-[#F5A623]" />
                    </div>
                    <h1 className="mt-6 text-3xl font-black tracking-tight">{t("title")}</h1>
                    <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-white/40">{t("subtitle")}</p>
                    <span className="mt-5 inline-block rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-[11px] font-bold text-white/50">
                        {t("badge")}
                    </span>
                </header>

                {/* ── Statistici live ── */}
                <section className="grid grid-cols-2 gap-2">
                    {[
                        { label: t("statSupply"), value: supply ? fmt(supply.totalSupplySwyp) : null },
                        { label: t("statCirculating"), value: supply ? fmt(supply.circulatingSwyp) : null },
                        { label: t("statHolders"), value: supply ? fmt(supply.holders) : null },
                        { label: t("statRate"), value: rate !== null ? `${rateDisplay} RON` : null, sub: t("ratePerSwyp") },
                    ].map((s) => (
                        <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">{s.label}</p>
                            {s.value === null
                                ? <span className="mt-2 inline-block h-6 w-24 rounded bg-white/5 animate-pulse" />
                                : <p className="mt-1.5 text-lg font-black tabular-nums leading-tight">{s.value}{s.sub && <span className="ml-1 text-[10px] font-bold text-white/35">{s.sub}</span>}</p>}
                        </div>
                    ))}
                </section>
                <p className="mt-3 text-[11px] leading-relaxed text-white/30">{t("rateZeroNote")}</p>

                {/* ── Trezorerii ── */}
                <section className="mt-12">
                    <div className="flex items-center gap-2">
                        <Landmark size={15} className="text-[#F5A623]" />
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/45">{t("treasuryTitle")}</h2>
                    </div>

                    {/* Bara compusă */}
                    {pools.length > 0 && (
                        <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full">
                            {pools.map((p) => (
                                <div key={p.pool} style={{ width: `${p.pct}%`, backgroundColor: p.color }} title={`${poolLabel(p.pool)} ${p.pct.toFixed(0)}%`} />
                            ))}
                        </div>
                    )}

                    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] divide-y divide-white/[0.05] overflow-hidden">
                        {(pools.length ? pools : Array.from({ length: 5 }, (_, i) => ({ pool: `s${i}`, balanceSwyp: null as string | null, pct: 0, color: "#333" }))).map((p) => (
                            <div key={p.pool} className="flex items-center justify-between px-4 py-3">
                                <span className="flex items-center gap-2.5">
                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                                    <span className="text-xs font-bold text-white/80">{p.balanceSwyp === null ? <span className="inline-block h-3 w-24 rounded bg-white/5 animate-pulse" /> : poolLabel(p.pool)}</span>
                                </span>
                                {p.balanceSwyp !== null && (
                                    <span className="text-xs font-black tabular-nums text-white/60">
                                        {fmt(p.balanceSwyp)} <span className="text-white/25 font-bold">· {p.pct.toFixed(0)}%</span>
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-white/30">{t("treasuryNote")}</p>
                </section>

                {/* ── Cum capătă valoare ── */}
                <section className="mt-12">
                    <div className="flex items-center gap-2">
                        <TrendingUp size={15} className="text-[#2DBE60]" />
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/45">{t("howTitle")}</h2>
                    </div>
                    <div className="mt-4 space-y-2">
                        {[
                            { Icon: Store, title: t("how1Title"), text: t("how1Text") },
                            { Icon: PiggyBank, title: t("how2Title"), text: t("how2Text") },
                            { Icon: Divide, title: t("how3Title"), text: t("how3Text") },
                        ].map((s, i) => (
                            <div key={i} className="flex gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2DBE60]/10">
                                    <s.Icon size={16} className="text-[#2DBE60]" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-white/85">{i + 1}. {s.title}</p>
                                    <p className="mt-1 text-[11px] leading-relaxed text-white/40">{s.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Verifică singur ── */}
                <section className="mt-12">
                    <div className="flex items-center gap-2">
                        <ShieldCheck size={15} className="text-[#F5A623]" />
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/45">{t("verifyTitle")}</h2>
                    </div>
                    <p className="mt-2 text-[11px] text-white/30">{t("verifyNote")}</p>

                    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] divide-y divide-white/[0.05] overflow-hidden">
                        <a href={SWYP_EXPLORER_URL} target="_blank" rel="noopener noreferrer"
                            className="flex items-center justify-between px-4 py-4 hover:bg-white/[0.04] transition">
                            <span>
                                <span className="block text-xs font-bold text-white/85">{t("linkExplorer")}</span>
                                <span className="mt-0.5 block text-[10px] text-white/35">{t("linkExplorerDesc")}</span>
                            </span>
                            <ArrowUpRight size={14} className="text-[#F5A623]/70 shrink-0 ml-3" />
                        </a>

                        <button
                            onClick={async () => {
                                // 2026-08-11 (audit): construit din constantele env-backed — nu mai poate
                                // rămâne desincronizat la schimbarea RPC/explorer-ului.
                                const cfg = `Network: ${SWYP_CHAIN_NAME}\nRPC: ${SWYP_PUBLIC_RPC_URL}\nChain ID: ${SWYP_CHAIN_ID}\nSymbol: ${SWYP_NATIVE_CURRENCY.symbol}\nExplorer: ${SWYP_EXPLORER_URL}`;
                                await navigator.clipboard.writeText(cfg).catch(() => { });
                                setRpcCopied(true);
                                setTimeout(() => setRpcCopied(false), 2500);
                            }}
                            className="flex w-full items-center justify-between px-4 py-4 text-left hover:bg-white/[0.04] transition">
                            <span>
                                <span className="block text-xs font-bold text-white/85">{t("linkRpc")}</span>
                                <span className="mt-0.5 block text-[10px] text-white/35">{t("linkRpcDesc")}</span>
                            </span>
                            <span className="flex items-center gap-1 shrink-0 ml-3 text-[10px] font-bold text-[#F5A623]/80">
                                <Copy size={12} /> {rpcCopied ? t("rpcCopied") : t("rpcCopy")}
                            </span>
                        </button>

                        <a href="/api/swyp/supply" target="_blank" rel="noopener noreferrer"
                            className="flex items-center justify-between px-4 py-4 hover:bg-white/[0.04] transition">
                            <span>
                                <span className="block text-xs font-bold text-white/85">{t("linkApi")}</span>
                                <span className="mt-0.5 block text-[10px] text-white/35">{t("linkApiDesc")}</span>
                            </span>
                            <ArrowUpRight size={14} className="text-[#F5A623]/70 shrink-0 ml-3" />
                        </a>
                    </div>
                </section>

                {/* ── CTA ── */}
                <section className="mt-12 rounded-2xl border border-[#F5A623]/20 bg-[#F5A623]/[0.06] p-6 text-center">
                    <p className="text-sm font-black">{t("earnCta")}</p>
                    <Link href="/pay" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#F5A623] px-6 py-3 text-[13px] font-black text-black active:scale-[0.98] transition">
                        <Wallet size={15} /> {t("earnCtaBtn")}
                    </Link>
                </section>

                {/* ── Disclaimer ── */}
                <p className="mt-10 text-[10px] leading-relaxed text-white/25">{t("disclaimer")}</p>
            </div>
        </main>
    );
}
