"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Settings, Plus, Video, Heart, Package, Grid, Bookmark, Trophy, Coins, ChevronRight, Compass, User } from "lucide-react";
import PushNotificationCard from "@/components/push/PushNotificationCard";
import MyModes from "@/components/account/MyModes";
import { useTranslations } from "next-intl";
import { SUPPORT_EMAIL } from "@/lib/contact";

type AccountPageClientProps = {
  redirectTo: string;
};

export default function AccountPageClient({ redirectTo }: AccountPageClientProps) {
  const t = useTranslations("account");
  const [view, setView] = useState<"loading" | "login" | "verify" | "account">("loading");
  const [customer, setCustomer] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"videos" | "orders" | "saved">("videos");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [challengesCount, setChallengesCount] = useState<number | null>(null);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const router = useRouter();

  const loadData = useCallback(async () => {
    try {
      // Load orders
      const resOrders = await fetch("/api/auth/orders");
      const dataOrders = await resOrders.json();
      if (dataOrders.success) setOrders(dataOrders.orders);

      // Load creator videos (if endpoint exists, else fallback to empty)
      try {
        const resVideos = await fetch("/api/creator/videos");
        if (resVideos.ok) {
          const dataVideos = await resVideos.json();
          if (dataVideos.videos) setVideos(dataVideos.videos);
        }
      } catch (e) {
        console.error("No videos found", e);
      }

    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          setCustomer(data.customer);
          setView("account");
          void loadData();
          if (redirectTo !== "/") {
            router.push(redirectTo);
          }
        } else {
          setView("login");
        }
      })
      .catch(() => setView("login"));
  }, [loadData, redirectTo, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    setDevOtp(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email }),
      });
      const data = await res.json();
      if (data.requiresVerification) {
        if (data.devOtp) setDevOtp(data.devOtp);
        setView("verify");
      } else {
        setLoginError(data.error || "Eroare la autentificare.");
      }
    } catch {
      setLoginError("Eroare de conexiune.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_otp", email, token: otp }),
      });
      const data = await res.json();
      if (data.success) {
        const meRes = await fetch("/api/auth");
        const meData = await meRes.json();
        if (meData.authenticated) {
          setCustomer(meData.customer);
          setView("account");
          void loadData();
        }
        if (redirectTo !== "/") router.push(redirectTo);
      } else {
        setLoginError(data.error || "Cod invalid.");
      }
    } catch {
      setLoginError("Eroare de conexiune.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    setCustomer(null);
    setOrders([]);
    setVideos([]);
    setView("login");
    router.push("/");
  }

  /* ════════════════════ LOADING ════════════════════ */
  if (view === "loading") {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/10 border-t-[#7C3AED] rounded-full animate-spin" />
      </div>
    );
  }

  /* ════════════════════ LOGIN ════════════════════ */
  if (view === "login") {
    return (
      <div className="min-h-screen bg-[#0D0D0D] text-white">
        <div className="max-w-sm mx-auto px-6 pt-24">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-black mb-2">Autentificare</h1>
            <p className="text-white/60">{t("introduEmailulPentruA")}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailulTau")}
              autoFocus
              required
              className="w-full rounded-2xl bg-white/5 border border-white/10 px-5 py-4 text-white placeholder-white/40 outline-none focus:border-[#7C3AED] transition"
            />
            {loginError && <p className="text-sm font-bold text-[#7C3AED]">{loginError}</p>}
            <button
              type="submit"
              disabled={loginLoading || !email.trim()}
              className="w-full rounded-2xl bg-[#7C3AED] hover:bg-[#E0264A] py-4 font-black text-white disabled:opacity-50 transition active:scale-95"
            >
              {loginLoading ? "Se încarcă..." : "Continuă"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ════════════════════ VERIFY OTP ════════════════════ */
  if (view === "verify") {
    return (
      <div className="min-h-screen bg-[#0D0D0D] text-white">
        <div className="max-w-sm mx-auto px-6 pt-24">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-black mb-2">Verificare</h1>
            <p className="text-white/60">{t("codulAFostTrimis")} <br /><b className="text-white">{email}</b></p>
          </div>

          {devOtp && (
            <div className="mb-8 rounded-2xl border border-[#0D0D0D]/30 bg-[#0D0D0D]/10 p-6 text-center">
              <p className="text-xs font-bold text-[#0D0D0D] uppercase tracking-widest mb-2">{t("codDeTest")}</p>
              <p className="text-4xl font-black text-white tracking-[0.3em] font-mono">{devOtp}</p>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              autoFocus
              required
              inputMode="numeric"
              maxLength={6}
              className="w-full text-center tracking-[0.5em] text-3xl rounded-2xl bg-white/5 border border-white/10 px-4 py-4 font-black text-white outline-none focus:border-[#7C3AED] transition"
            />
            {loginError && <p className="text-sm font-bold text-[#7C3AED] text-center">{loginError}</p>}
            <button
              type="submit"
              disabled={loginLoading || otp.length < 6}
              className="w-full rounded-2xl bg-[#7C3AED] hover:bg-[#E0264A] py-4 font-black text-white disabled:opacity-50 transition active:scale-95"
            >
              {loginLoading ? "Verificăm..." : "Confirmă accesul"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ════════════════════ TIKTOK STYLE PROFILE ════════════════════ */
  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white mobile-page-bottom">
      {/* Top Navbar (NU mai e sticky — header se suprapunea peste avatar la scroll) */}
      <header className="relative z-10 bg-[#0D0D0D] border-b border-white/10 px-4 py-4 flex items-center justify-between">
        <div className="w-11" aria-hidden="true" />
        <h1 className="text-lg font-black">{customer?.username || "Profil"}</h1>
        <Link
          href="/account/settings"
          className="grid h-11 w-11 place-items-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
          aria-label={t("setari")}
        >
          <Settings size={22} />
        </Link>
      </header>

      <div className="max-w-md mx-auto px-4 pt-6">
        <PushNotificationCard />
        {/* Profile Info */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] p-1 mb-4">
            <div className="w-full h-full rounded-full bg-[#1A1A1A] flex items-center justify-center overflow-hidden border-2 border-[#0D0D0D]">
              {customer?.avatar_url ? (
                <Image src={customer.avatar_url} alt="Avatar" width={96} height={96} className="w-full h-full object-cover" unoptimized />
              ) : (
                <User size={32} />
              )}
            </div>
          </div>
          <h2 className="text-xl font-black">{customer?.display_name || "Creator Swypik"}</h2>
          <p className="text-sm text-white/60 mb-4">@{customer?.username || "user"}</p>

          <div className="flex items-center justify-center gap-8 w-full px-8 mb-6">
            <div className="text-center">
              <p className="text-lg font-black">0</p>
              <p className="text-xs text-white/60">{t("urmariri")}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black">0</p>
              <p className="text-xs text-white/60">{t("urmaritori")}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black">0</p>
              <p className="text-xs text-white/60">Aprecieri</p>
            </div>
          </div>

          <div className="flex gap-3 w-full">
            <Link
              href="/upload"
              className="flex-1 bg-[#7C3AED] hover:bg-[#E0264A] text-white py-3 min-h-[44px] rounded-lg font-bold flex items-center justify-center gap-2 transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
            >
              <Plus size={18} />  {t("publica")}
            </Link>
            <Link href="/account/edit" className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 min-h-[44px] flex items-center justify-center rounded-lg font-bold text-center transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">

              {t("editeaza")}
            </Link>
          </div>
        </div>

        {/* Modurile mele — comutare rol (cumpărător/creator/seller/curier) */}
        <MyModes />

        {/* Descoperă */}
        <section aria-label={t("descopera")} className="mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-sm font-black uppercase tracking-wider text-white/70">{t("descopera2")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/explore"
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#10A37F]/20 via-[#1A1A1A] to-[#1A1A1A] p-4 hover:border-[#10A37F]/60 transition active:scale-[0.98]"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-9 h-9 rounded-xl bg-[#10A37F]/20 flex items-center justify-center">
                  <Compass size={18} className="text-[#10A37F]" aria-hidden />
                </div>
                <ChevronRight size={16} className="text-white/40 group-hover:text-white/80 transition" aria-hidden />
              </div>
              <p className="text-[11px] uppercase font-bold tracking-wider text-white/50">Descoperă produse</p>
              <p className="mt-1 text-xl font-black text-white">Explore</p>
              <p className="mt-1 text-xs text-[#10A37F] font-bold">Vezi feedul →</p>
            </Link>

            <Link
              href="/missions"
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#F59E0B]/20 via-[#1A1A1A] to-[#1A1A1A] p-4 hover:border-[#F59E0B]/60 transition active:scale-[0.98]"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-9 h-9 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
                  <Trophy size={18} className="text-[#F59E0B]" aria-hidden />
                </div>
                <ChevronRight size={16} className="text-white/40 group-hover:text-white/80 transition" aria-hidden />
              </div>
              <p className="text-[11px] uppercase font-bold tracking-wider text-white/50">Câștigă SWYP</p>
              <p className="mt-1 text-xl font-black text-white">Misiuni</p>
              <p className="mt-1 text-xs text-[#F59E0B] font-bold">Vezi misiunile →</p>
            </Link>
          </div>
        </section>

        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-1">
          <button
            onClick={() => setActiveTab("videos")}
            className={`flex-1 py-3 min-h-[44px] flex items-center justify-center gap-1 border-b-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 focus-visible:outline-none ${activeTab === "videos" ? "border-white text-white" : "border-transparent text-white/50"}`}
          >
            <Grid size={18} />
            <span>Clipuri</span>
          </button>
          <button
            onClick={() => setActiveTab("saved")}
            className={`flex-1 py-3 min-h-[44px] flex items-center justify-center gap-1 border-b-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 focus-visible:outline-none ${activeTab === "saved" ? "border-white text-white" : "border-transparent text-white/50"}`}
          >
            <Bookmark size={18} />
            <span>Salvate</span>
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`flex-1 py-3 min-h-[44px] flex items-center justify-center gap-1 border-b-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 focus-visible:outline-none ${activeTab === "orders" ? "border-white text-white" : "border-transparent text-white/50"}`}
          >
            <Package size={18} />
            <span>Comenzi</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[300px]">
          {activeTab === "videos" && (
            <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3">
              {videos.length === 0 ? (
                <div className="col-span-3 py-20 text-center text-white/40">
                  <Video size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t("nuAiPublicatInca")}</p>
                </div>
              ) : (
                videos.map((vid, i) => (
                  <div key={i} className="aspect-[9/16] bg-white/5 relative group cursor-pointer">
                    {vid.thumbnail_url && (
                      <Image src={vid.thumbnail_url} className="w-full h-full object-cover" alt="Video" fill sizes="(max-width: 640px) 50vw, 33vw" unoptimized />
                    )}
                    <div className="absolute bottom-1 left-2 flex items-center gap-1 text-[10px] font-bold">
                      <Heart size={10} /> {vid.likes_count || 0}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "saved" && (
            <div className="py-20 text-center text-white/40">
              <Bookmark size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t("clipuriSalvateVorAparea")}</p>
            </div>
          )}

          {activeTab === "orders" && (
            <div className="py-4 space-y-3">
              {orders.length === 0 ? (
                <div className="text-center py-10 text-white/40">
                  <Package size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t("nuAiNicioComanda")}</p>
                </div>
              ) : (
                orders.map((order, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm">{t("comanda")}{order.id.split("-")[0]}</p>
                      <p className="text-xs text-white/50">{order.status}</p>
                    </div>
                    <p className="font-black text-[#0D0D0D]">{order.totalRon} lei</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Linkuri legale — aplicația nu are footer de site; profilul e
            locul standard în aplicații mobile (vezi Revolut, Uber). */}
        <div className="mt-8 border-t border-black/5 pt-4 pb-6">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px] font-semibold text-[#6E6E80]">
            <a href="/terms" className="underline-offset-2 hover:underline">{t("legalTerms" as never)}</a>
            <a href="/privacy" className="underline-offset-2 hover:underline">{t("legalPrivacy" as never)}</a>
            <a href="/legal/cookies" className="underline-offset-2 hover:underline">{t("legalCookies" as never)}</a>
            <a href="/legal/anpc" className="underline-offset-2 hover:underline">ANPC</a>
            <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">SOL (UE)</a>
          </div>
          <p className="mt-2 text-[11px] text-[#C4C4CC]">© {new Date().getFullYear()} Swypik Technology · {SUPPORT_EMAIL}</p>
        </div>

      </div>
    </div>
  );
}
