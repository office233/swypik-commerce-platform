"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Copy,
  Check,
  Share2,
  ChevronLeft,
  TrendingUp,
  Gift,
} from "lucide-react";

type ReferralData = {
  code: string;
  shareUrl: string;
  totalInvited: number;
  totalValidated: number;
};

type ApiError = { error: string };

export default function InviteFriendClient() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch("/api/me/referral", { cache: "no-store" });
        const body = (await res.json()) as ReferralData | ApiError;
        if (aborted) return;
        if (!res.ok || "error" in body) {
          setError("Could not load your referral code.");
        } else {
          setData(body);
        }
      } catch {
        if (!aborted) setError("Network error.");
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  const copy = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [data]);

  const share = useCallback(async () => {
    if (!data) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Join me on Swypik",
          text: "Sign up with my link and we both get a $SWYP mining boost.",
          url: data.shareUrl,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      void copy();
    }
  }, [data, copy]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-950 via-indigo-950 to-slate-950 text-white pb-24">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <Link
          href="/account"
          className="text-sm text-violet-300 inline-flex items-center gap-1 hover:text-violet-200 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to profile
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Invite friends</h1>
        <p className="text-violet-300 text-sm mt-1">
          Earn +10% mining boost for each active friend. No cap.
        </p>
      </div>

      {/* Stats card */}
      <div className="mx-5 rounded-3xl bg-gradient-to-br from-violet-600/40 to-indigo-700/40 backdrop-blur border border-white/10 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-full bg-violet-500/30 p-3">
            <Users className="w-6 h-6 text-violet-200" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-violet-300">
              Your referrals
            </div>
            <div className="text-2xl font-bold mt-0.5">
              {loading ? "…" : `${data?.totalValidated ?? 0} active`}
            </div>
            <div className="text-violet-300 text-xs">
              {loading ? "" : `${data?.totalInvited ?? 0} invited total`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm border-t border-white/10 pt-3">
          <TrendingUp className="w-4 h-4 text-emerald-300" />
          <span className="text-violet-200">Mining boost from referrals</span>
          <span className="ml-auto font-bold text-emerald-300">
            +{(data?.totalValidated ?? 0) * 10}%
          </span>
        </div>
      </div>

      {/* Share link */}
      <div className="mx-5 mt-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-5">
        <div className="text-xs uppercase tracking-wider text-violet-300 mb-2">
          Your invite link
        </div>
        {loading ? (
          <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
        ) : error ? (
          <div className="text-rose-300 text-sm">{error}</div>
        ) : data ? (
          <>
            <div className="rounded-xl bg-black/30 border border-white/10 px-4 py-3 font-mono text-sm break-all">
              {data.shareUrl}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copy}
                className="rounded-xl bg-white/10 hover:bg-white/15 transition px-4 py-3 font-semibold inline-flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={share}
                className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 transition px-4 py-3 font-semibold inline-flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
            <div className="mt-3 text-xs text-violet-400">
              Code: <span className="font-mono text-violet-200">{data.code}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* How it works */}
      <div className="mx-5 mt-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="w-4 h-4 text-amber-300" />
          <h2 className="font-semibold">How it works</h2>
        </div>
        <ol className="space-y-3 text-sm text-violet-200">
          <li className="flex gap-3">
            <span className="rounded-full bg-violet-500/30 w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
              1
            </span>
            <span>Share your link with friends.</span>
          </li>
          <li className="flex gap-3">
            <span className="rounded-full bg-violet-500/30 w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
              2
            </span>
            <span>
              They sign up via your link and verify their email.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="rounded-full bg-violet-500/30 w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
              3
            </span>
            <span>
              Each active referral gives you{" "}
              <span className="font-semibold text-emerald-300">+10% mining boost</span>{" "}
              on every $SWYP tap, forever.
            </span>
          </li>
        </ol>
      </div>

      <div className="mx-5 mt-6">
        <Link
          href="/earn"
          className="block w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-center py-4 font-bold text-slate-900 shadow-lg shadow-orange-500/30 hover:scale-[1.02] transition"
        >
          Back to mining
        </Link>
      </div>
    </div>
  );
}
