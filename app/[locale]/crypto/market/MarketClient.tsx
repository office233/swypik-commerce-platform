"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowUpRight, ArrowDownRight, Search, ShieldCheck } from "lucide-react";
import { logger } from "@/lib/logger";
import CryptoChart from "@/components/crypto/CryptoChart";
import type { CryptoMarketCoin, CryptoOhlcPoint, CryptoVsCurrency } from "@/lib/crypto/coingecko";

const VS_CURRENCIES: CryptoVsCurrency[] = ["usd", "eur", "ron"];
const OHLC_DAYS = [1, 7, 14, 30, 90, 180, 365] as const;
type OhlcDays = (typeof OHLC_DAYS)[number];
type DayLabelKey = "days1" | "days7" | "days14" | "days30" | "days90" | "days180" | "days365";
const DAY_LABEL_KEYS: Record<OhlcDays, DayLabelKey> = {
  1: "days1",
  7: "days7",
  14: "days14",
  30: "days30",
  90: "days90",
  180: "days180",
  365: "days365",
};

type SortKey = "rank" | "price" | "change" | "volume" | "marketCap";

interface MarketsApiResponse {
  coins: CryptoMarketCoin[];
}

interface OhlcApiResponse {
  candles: CryptoOhlcPoint[];
}

export default function MarketClient() {
  const t = useTranslations("crypto");
  const locale = useLocale();

  const [vsCurrency, setVsCurrency] = useState<CryptoVsCurrency>("usd");
  const [coins, setCoins] = useState<CryptoMarketCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");

  const [selectedCoinId, setSelectedCoinId] = useState<string | null>(null);
  const [days, setDays] = useState<OhlcDays>(30);
  const [candles, setCandles] = useState<CryptoOhlcPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/crypto/markets?vs_currency=${vsCurrency}&per_page=50`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<MarketsApiResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setCoins(Array.isArray(data.coins) ? data.coins : []);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.warn({ err }, "crypto markets client fetch failed");
        setError(true);
        setCoins([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vsCurrency]);

  useEffect(() => {
    if (!selectedCoinId) {
      setCandles([]);
      return;
    }
    let cancelled = false;
    setChartLoading(true);
    fetch(`/api/crypto/ohlc/${selectedCoinId}?vs_currency=${vsCurrency}&days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<OhlcApiResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setCandles(Array.isArray(data.candles) ? data.candles : []);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.warn({ err }, "crypto ohlc client fetch failed");
        setCandles([]);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCoinId, vsCurrency, days]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? coins.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
      : coins;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "price":
          return (b.currentPrice ?? 0) - (a.currentPrice ?? 0);
        case "change":
          return (b.priceChangePercentage24h ?? 0) - (a.priceChangePercentage24h ?? 0);
        case "volume":
          return (b.totalVolume ?? 0) - (a.totalVolume ?? 0);
        case "marketCap":
          return (b.marketCap ?? 0) - (a.marketCap ?? 0);
        case "rank":
        default:
          return (a.marketCapRank ?? Number.MAX_SAFE_INTEGER) - (b.marketCapRank ?? Number.MAX_SAFE_INTEGER);
      }
    });
    return sorted;
  }, [coins, search, sortKey]);

  const selectedCoin = useMemo(
    () => coins.find((c) => c.id === selectedCoinId) ?? null,
    [coins, selectedCoinId],
  );

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: vsCurrency.toUpperCase(),
        maximumFractionDigits: 6,
      }),
    [locale, vsCurrency],
  );

  const compactCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: vsCurrency.toUpperCase(),
        notation: "compact",
        maximumFractionDigits: 2,
      }),
    [locale, vsCurrency],
  );

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        signDisplay: "exceptZero",
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  const formatPrice = (value: number | null) => (value === null ? "—" : currencyFormatter.format(value));
  const formatCompact = (value: number | null) => (value === null ? "—" : compactCurrencyFormatter.format(value));
  const formatPercent = (value: number | null) => (value === null ? "—" : percentFormatter.format(value / 100));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold border border-cyan-500/30 uppercase tracking-wider mb-2">
              <ShieldCheck size={14} /> {t("badge")}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white">{t("heading")}</h1>
            <p className="text-slate-400 text-sm max-w-xl">{t("subheading")}</p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="crypto-currency" className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {t("currencyLabel")}
            </label>
            <select
              id="crypto-currency"
              value={vsCurrency}
              onChange={(e) => setVsCurrency(e.target.value as CryptoVsCurrency)}
              className="bg-slate-900 border border-slate-800 text-sm font-bold text-white px-3 py-2 rounded-xl outline-none"
            >
              {VS_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Attribution + disclaimer */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-slate-500 mb-8">
          <span>
            {t("attributionPrefix")}{" "}
            <a
              href="https://www.coingecko.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 font-semibold hover:underline"
            >
              CoinGecko
            </a>
          </span>
          <span className="hidden sm:inline">·</span>
          <span>{t("disclaimer")}</span>
        </div>

        {/* Chart panel */}
        {selectedCoin && (
          <div className="bg-[#090d16] rounded-2xl border border-slate-800 p-4 shadow-xl mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                {selectedCoin.image && (
                  // Logo servit de CDN-ul CoinGecko (assets.coingecko.com / coin-images.coingecko.com).
                  <img
                    src={selectedCoin.image}
                    alt={selectedCoin.name}
                    loading="lazy"
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                )}
                <span className="text-white font-extrabold text-lg">
                  {selectedCoin.name} ({selectedCoin.symbol.toUpperCase()})
                </span>
                {selectedCoin.priceChangePercentage24h !== null && (
                  <span
                    className={`font-bold text-sm px-2 py-0.5 rounded border ${
                      selectedCoin.priceChangePercentage24h >= 0
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                    }`}
                  >
                    {formatPercent(selectedCoin.priceChangePercentage24h)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="crypto-days" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {t("daysLabel")}
                </label>
                <select
                  id="crypto-days"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value) as OhlcDays)}
                  className="bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 px-2 py-1.5 rounded-lg outline-none"
                >
                  {OHLC_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {t(DAY_LABEL_KEYS[d])}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <dt className="text-slate-500 mb-1">{t("detailCurrentPrice")}</dt>
                <dd className="text-white font-extrabold text-sm">{formatPrice(selectedCoin.currentPrice)}</dd>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <dt className="text-slate-500 mb-1">{t("detailChange24h")}</dt>
                <dd className="text-white font-extrabold text-sm">{formatPercent(selectedCoin.priceChangePercentage24h)}</dd>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <dt className="text-slate-500 mb-1">{t("detailMarketCap")}</dt>
                <dd className="text-white font-extrabold text-sm">{formatCompact(selectedCoin.marketCap)}</dd>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <dt className="text-slate-500 mb-1">{t("detailVolume24h")}</dt>
                <dd className="text-white font-extrabold text-sm">{formatCompact(selectedCoin.totalVolume)}</dd>
              </div>
            </dl>

            {chartLoading ? (
              <div className="h-[380px] flex items-center justify-center text-slate-500 text-sm">{t("chartLoading")}</div>
            ) : candles.length === 0 ? (
              <div className="h-[380px] flex items-center justify-center text-slate-500 text-sm">{t("chartEmpty")}</div>
            ) : (
              <CryptoChart candles={candles} />
            )}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full bg-slate-900 border border-slate-800 text-sm text-slate-200 pl-9 pr-3 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="crypto-sort" className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {t("sortLabel")}
            </label>
            <select
              id="crypto-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-slate-900 border border-slate-800 text-sm font-bold text-slate-200 px-3 py-2 rounded-xl outline-none"
            >
              <option value="rank">{t("sortRank")}</option>
              <option value="price">{t("sortPrice")}</option>
              <option value="change">{t("sortChange")}</option>
              <option value="volume">{t("sortVolume")}</option>
              <option value="marketCap">{t("sortMarketCap")}</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">{t("tableRank")}</th>
                  <th className="px-6 py-3">{t("tableName")}</th>
                  <th className="px-6 py-3">{t("tablePrice")}</th>
                  <th className="px-6 py-3">{t("tableChange")}</th>
                  <th className="px-6 py-3">{t("tableVolume")}</th>
                  <th className="px-6 py-3">{t("tableMarketCap")}</th>
                  <th className="px-6 py-3 text-right">{t("tableAction")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`skeleton-${i}`}>
                      <td colSpan={7} className="px-6 py-4 text-slate-600 text-xs">
                        {t("loading")}
                      </td>
                    </tr>
                  ))}

                {!loading && error && (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-center text-rose-400 text-sm">
                      {t("errorMessage")}
                    </td>
                  </tr>
                )}

                {!loading && !error && filteredSorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-center text-slate-500 text-sm">
                      {t("noResults")}
                    </td>
                  </tr>
                )}

                {!loading &&
                  !error &&
                  filteredSorted.map((coin) => (
                    <tr key={coin.id} className="hover:bg-slate-800/50 transition">
                      <td className="px-6 py-4 font-bold text-slate-500">{coin.marketCapRank ?? "—"}</td>
                      <td className="px-6 py-4 font-bold text-white">
                        <div className="flex items-center gap-2">
                          {coin.image && (
                            <img
                              src={coin.image}
                              alt={coin.name}
                              loading="lazy"
                              width={20}
                              height={20}
                              className="rounded-full"
                            />
                          )}
                          <span>{coin.name}</span>
                          <span className="text-xs text-slate-400">{coin.symbol.toUpperCase()}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-extrabold">{formatPrice(coin.currentPrice)}</td>
                      <td className="px-6 py-4">
                        {coin.priceChangePercentage24h !== null && (
                          <span
                            className={`flex items-center gap-1 font-bold ${
                              coin.priceChangePercentage24h >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {coin.priceChangePercentage24h >= 0 ? (
                              <ArrowUpRight size={16} />
                            ) : (
                              <ArrowDownRight size={16} />
                            )}
                            {formatPercent(coin.priceChangePercentage24h)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400">{formatCompact(coin.totalVolume)}</td>
                      <td className="px-6 py-4 text-slate-400">{formatCompact(coin.marketCap)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedCoinId(coin.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-xs font-bold transition"
                        >
                          {t("viewButton")}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
