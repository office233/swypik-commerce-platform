import { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Clock, ChevronLeft, Camera, FileCheck, AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "Identity verification (KYC) · Swypik",
  description: "Verify your identity to unlock +50% mining boost, higher withdrawal limits, and seller features.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-950 via-indigo-950 to-slate-950 text-white pb-24">
      <div className="px-5 pt-6 pb-4">
        <Link
          href="/account"
          className="text-sm text-violet-300 inline-flex items-center gap-1 hover:text-violet-200 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to profile
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Verify your identity</h1>
        <p className="text-violet-300 text-sm mt-1">
          Required for $SWYP withdrawals, seller features, and the +50% mining boost.
        </p>
      </div>

      {/* Status banner */}
      <div className="mx-5 rounded-3xl bg-gradient-to-br from-amber-600/20 to-orange-700/20 backdrop-blur border border-amber-500/30 p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-500/30 p-2 flex-shrink-0">
            <Clock className="w-5 h-5 text-amber-200" />
          </div>
          <div>
            <div className="font-semibold">KYC opens in Q3 2026</div>
            <p className="text-amber-100/80 text-sm mt-1">
              We&apos;re integrating with a regulated provider (Onfido or Veriff)
              to handle ID + face verification securely. Until then, you can mine
              and use $SWYP for in-app purchases without KYC.
            </p>
          </div>
        </div>
      </div>

      {/* What's coming */}
      <div className="mx-5 mt-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-5">
        <h2 className="font-semibold mb-4">What you&apos;ll need</h2>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <FileCheck className="w-5 h-5 text-violet-300 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Government-issued ID</div>
              <div className="text-violet-300 text-xs mt-0.5">
                Passport, national ID card, or driver&apos;s license.
              </div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Camera className="w-5 h-5 text-violet-300 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">A short selfie video</div>
              <div className="text-violet-300 text-xs mt-0.5">
                We use it to confirm the ID belongs to you. Liveness check, no
                photos stored after verification.
              </div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-violet-300 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Privacy by design</div>
              <div className="text-violet-300 text-xs mt-0.5">
                Documents processed by our regulated KYC partner and deleted
                after verification (we keep only a pass/fail flag).
              </div>
            </div>
          </li>
        </ul>
      </div>

      {/* What you unlock */}
      <div className="mx-5 mt-6 rounded-2xl bg-gradient-to-br from-emerald-600/20 to-teal-700/20 border border-emerald-500/20 p-5">
        <h2 className="font-semibold mb-3">What KYC unlocks</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span>+50% mining boost (permanent)</span>
            <span className="text-emerald-300 text-xs font-semibold">Q3</span>
          </li>
          <li className="flex items-center justify-between">
            <span>$SWYP withdrawals to external wallets</span>
            <span className="text-emerald-300 text-xs font-semibold">Q3</span>
          </li>
          <li className="flex items-center justify-between">
            <span>Seller dashboard (sell on Swypik)</span>
            <span className="text-emerald-300 text-xs font-semibold">Q3</span>
          </li>
          <li className="flex items-center justify-between">
            <span>Higher daily mining cap</span>
            <span className="text-emerald-300 text-xs font-semibold">Q3</span>
          </li>
        </ul>
      </div>

      {/* Notify me CTA placeholder */}
      <div className="mx-5 mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
        <div className="text-sm text-violet-200">
          We&apos;ll notify you the moment KYC opens.
        </div>
        <div className="text-xs text-violet-400 mt-1">
          Notification preferences live in{" "}
          <Link
            href="/account/notifications"
            className="text-violet-200 underline underline-offset-2"
          >
            Settings → Notifications
          </Link>
          .
        </div>
      </div>

      {/* Honest disclaimer */}
      <div className="mx-5 mt-6 flex items-start gap-2 text-xs text-violet-400">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Until KYC ships, the +50% boost is shown as “Coming soon” on the Earn
          page and is not credited to your multiplier.
        </p>
      </div>
    </div>
  );
}
