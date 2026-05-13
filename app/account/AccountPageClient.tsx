"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Settings, Plus, Video, Heart, Package, Grid, Bookmark } from "lucide-react";
import TopBar from "@/components/TopBar";
import EnablePushButton from "@/components/push/EnablePushButton";

type AccountPageClientProps = {
  redirectTo: string;
};

export default function AccountPageClient({ redirectTo }: AccountPageClientProps) {
  const [view, setView] = useState<"loading" | "login" | "verify" | "account">("loading");
  const [customer, setCustomer] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"videos" | "orders" | "saved">("videos");
  
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
        <div className="w-10 h-10 border-4 border-white/10 border-t-[#FE2C55] rounded-full animate-spin" />
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
            <p className="text-white/60">Introdu emailul pentru a intra în contul tău Swypik.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Emailul tău"
              autoFocus
              required
              className="w-full rounded-2xl bg-white/5 border border-white/10 px-5 py-4 text-white placeholder-white/40 outline-none focus:border-[#FE2C55] transition"
            />
            {loginError && <p className="text-sm font-bold text-[#FE2C55]">{loginError}</p>}
            <button
              type="submit"
              disabled={loginLoading || !email.trim()}
              className="w-full rounded-2xl bg-[#FE2C55] hover:bg-[#E0264A] py-4 font-black text-white disabled:opacity-50 transition active:scale-95"
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
            <p className="text-white/60">Codul a fost trimis la <br/><b className="text-white">{email}</b></p>
          </div>

          {devOtp && (
            <div className="mb-8 rounded-2xl border border-[#10A37F]/30 bg-[#10A37F]/10 p-6 text-center">
              <p className="text-xs font-bold text-[#10A37F] uppercase tracking-widest mb-2">🔧 Cod de Test</p>
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
              className="w-full text-center tracking-[0.5em] text-3xl rounded-2xl bg-white/5 border border-white/10 px-4 py-4 font-black text-white outline-none focus:border-[#FE2C55] transition"
            />
            {loginError && <p className="text-sm font-bold text-[#FE2C55] text-center">{loginError}</p>}
            <button
              type="submit"
              disabled={loginLoading || otp.length < 6}
              className="w-full rounded-2xl bg-[#FE2C55] hover:bg-[#E0264A] py-4 font-black text-white disabled:opacity-50 transition active:scale-95"
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
      <TopBar />
      {/* Top Navbar */}
      <header className="sticky top-12 z-30 bg-[#0D0D0D]/80 backdrop-blur-md border-b border-white/10 px-4 py-4 flex items-center justify-between">
        <div className="w-8" /> {/* Spacer */}
        <h1 className="text-lg font-black">{customer?.username || "Profil"}</h1>
        <button onClick={handleLogout} className="text-white/60 hover:text-white transition">
          <Settings size={24} />
        </button>
      </header>

      <div className="max-w-md mx-auto px-4 pt-6">
        {/* Profile Info */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#FE2C55] to-[#25F4EE] p-1 mb-4">
            <div className="w-full h-full rounded-full bg-[#1A1A1A] flex items-center justify-center overflow-hidden border-2 border-[#0D0D0D]">
              {customer?.avatar_url ? (
                <Image src={customer.avatar_url} alt="Avatar" width={96} height={96} className="w-full h-full object-cover" unoptimized />
              ) : (
                <span className="text-3xl">😎</span>
              )}
            </div>
          </div>
          <h2 className="text-xl font-black">{customer?.display_name || "Creator Swypik"}</h2>
          <p className="text-sm text-white/60 mb-4">@{customer?.username || "user"}</p>

          <div className="flex items-center justify-center gap-8 w-full px-8 mb-6">
            <div className="text-center">
              <p className="text-lg font-black">0</p>
              <p className="text-xs text-white/60">Urmăriri</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black">0</p>
              <p className="text-xs text-white/60">Urmăritori</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black">0</p>
              <p className="text-xs text-white/60">Aprecieri</p>
            </div>
          </div>

          <div className="flex gap-3 w-full">
            <Link 
              href="/creator/upload" 
              className="flex-1 bg-[#FE2C55] hover:bg-[#E0264A] text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition"
            >
              <Plus size={18} /> Publică
            </Link>
            <button className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2.5 rounded-lg font-bold transition">
              Editează
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-1">
          <button 
            onClick={() => setActiveTab("videos")}
            className={`flex-1 py-3 flex items-center justify-center gap-1 border-b-2 text-xs font-bold transition ${activeTab === "videos" ? "border-white text-white" : "border-transparent text-white/50"}`}
          >
            <Grid size={18} />
            <span>Clipuri</span>
          </button>
          <button 
            onClick={() => setActiveTab("saved")}
            className={`flex-1 py-3 flex items-center justify-center gap-1 border-b-2 text-xs font-bold transition ${activeTab === "saved" ? "border-white text-white" : "border-transparent text-white/50"}`}
          >
            <Bookmark size={18} />
            <span>Salvate</span>
          </button>
          <button 
            onClick={() => setActiveTab("orders")}
            className={`flex-1 py-3 flex items-center justify-center gap-1 border-b-2 text-xs font-bold transition ${activeTab === "orders" ? "border-white text-white" : "border-transparent text-white/50"}`}
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
                  <p className="text-sm">Nu ai publicat încă niciun clip.</p>
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
              <p className="text-sm">Clipuri salvate vor apărea aici.</p>
            </div>
          )}

          {activeTab === "orders" && (
            <div className="py-4 space-y-3">
              {orders.length === 0 ? (
                <div className="text-center py-10 text-white/40">
                  <Package size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nu ai nicio comandă.</p>
                </div>
              ) : (
                orders.map((order, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm">Comanda #{order.id.split("-")[0]}</p>
                      <p className="text-xs text-white/50">{order.status}</p>
                    </div>
                    <p className="font-black text-[#10A37F]">{order.totalRon} lei</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Settings: Notificări push */}
        <section className="mt-8 mb-10 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h3 className="text-base font-black text-white">Notificări push</h3>
          <p className="mt-1 text-sm text-white/60">
            Primește notificare când cineva îți dă follow, like sau comentariu.
          </p>
          <div className="mt-4">
            <EnablePushButton />
          </div>
        </section>
      </div>
    </div>
  );
}
