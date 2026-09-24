"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { logger } from "@/lib/logger";
import {
  Store,
  ExternalLink,
  Save,
  CheckCircle2,
  AlertCircle,
  Building,
  Sparkles,
} from "lucide-react";

type Props = {
  initialData: {
    sellerId: string;
    name: string;
    username: string;
    email: string;
    bio: string;
    avatarUrl: string;
    cui: string;
    phone: string;
    iban: string;
    invoiceSeries: string;
  };
};

export default function SellerSettingsClient({ initialData }: Props) {
  const t = useTranslations("sellerGrowthSettings");
  const [name, setName] = useState(initialData.name);
  const [username, setUsername] = useState(initialData.username);
  const [bio, setBio] = useState(initialData.bio);
  const [avatarUrl, setAvatarUrl] = useState(initialData.avatarUrl);
  const [cui, setCui] = useState(initialData.cui);
  const [phone, setPhone] = useState(initialData.phone);
  const [iban, setIban] = useState(initialData.iban);
  const [invoiceSeries, setInvoiceSeries] = useState(initialData.invoiceSeries);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cleanHandle = username.toLowerCase().replace(/[^a-z0-9_-]/g, "");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/seller/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          username: cleanHandle,
          bio,
          avatarUrl,
          cui,
          phone,
          iban,
          invoiceSeries,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("errorSaveGeneric"));
      }

      setSuccessMsg(data.message || t("saveSuccess"));
      setUsername(data.username);
    } catch (err: any) {
      logger.error({ err }, "Failed to save seller settings");
      setErrorMsg(err.message || t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E5E5] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#0D0D0D]">{t("title")}</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">
              Swypik Business
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            {t("subtitle")}
          </p>
        </div>

        {cleanHandle && (
          <Link
            href={`/u/${cleanHandle}`}
            target="_blank"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold shadow-sm transition"
          >
            <ExternalLink size={16} /> {t("viewStore")}
          </Link>
        )}
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-3 text-sm font-medium">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Main Settings */}
        <div className="md:col-span-2 space-y-6">
          {/* Public Store Profile Card */}
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 text-lg font-bold text-[#0D0D0D]">
              <Store className="w-5 h-5 text-violet-600" />
              {t("publicProfileTitle")}
            </div>
            <p className="text-xs text-neutral-500">
              {t("publicProfileHint")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                  {t("storeNameLabel")}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("storeNamePlaceholder")}
                  className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                  {t("handleLabel")}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-neutral-400 font-bold text-sm">@</span>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="techgadgets"
                    className="w-full pl-8 pr-3.5 py-2.5 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <p className="text-[11px] text-neutral-400 mt-1 break-all">
                  {t("yourLink")}: <span className="text-violet-600 font-semibold">swypik.com/u/{cleanHandle || "username"}</span>
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                {t("logoLabel")}
              </label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://images.unsplash.com/photo-..."
                className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                {t("bioLabel")}
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t("bioPlaceholder")}
                className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>
          </div>

          {/* Fiscal & Business Details */}
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 text-lg font-bold text-[#0D0D0D]">
              <Building className="w-5 h-5 text-violet-600" />
              {t("fiscalTitle")}
            </div>
            <p className="text-xs text-neutral-500">
              {t("fiscalHint")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                  {t("cuiLabel")}
                </label>
                <input
                  type="text"
                  value={cui}
                  onChange={(e) => setCui(e.target.value)}
                  placeholder="RO12345678"
                  className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                  {t("phoneLabel")}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07xxxxxxxx"
                  className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                  {t("ibanLabel")}
                </label>
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="RO49AAAA1B31007593840000"
                  className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                  {t("invoiceSeriesLabel")}
                </label>
                <input
                  type="text"
                  value={invoiceSeries}
                  onChange={(e) => setInvoiceSeries(e.target.value)}
                  placeholder="FACT"
                  className="w-full px-3.5 py-2.5 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 uppercase"
                />
                <p className="text-[11px] text-neutral-400 mt-1">{t("invoiceSeriesHint")}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-[#0D0D0D] hover:bg-neutral-800 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? t("saving") : t("saveSettings")}
            </button>
          </div>
        </div>

        {/* Right Col: Live Preview of Public Store Profile */}
        <div className="space-y-4">
          <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
            {t("previewTitle")}
          </div>

          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 shadow-sm space-y-4 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-violet-100 border-2 border-violet-500 flex items-center justify-center overflow-hidden">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={t("logoAlt")} width={80} height={80} className="w-full h-full object-cover" />
              ) : (
                <Store className="w-8 h-8 text-violet-600" />
              )}
            </div>

            <div>
              <h3 className="font-black text-lg text-[#0D0D0D] break-words">{name || t("storeNameFallback")}</h3>
              <p className="text-xs font-bold text-violet-600 break-all">@{cleanHandle || "username"}</p>
            </div>

            <p className="text-xs text-neutral-600 line-clamp-3 italic">
              &ldquo;{bio || t("bioFallback")}&rdquo;
            </p>

            <div className="pt-3 border-t border-[#E5E5E5] grid grid-cols-2 gap-2 text-xs">
              <div className="bg-neutral-50 p-2 rounded-lg font-medium text-neutral-600">
                <span className="block font-bold text-[#0D0D0D]">{t("socialFeed")}</span> {t("active")}
              </div>
              <div className="bg-neutral-50 p-2 rounded-lg font-medium text-neutral-600">
                <span className="block font-bold text-[#0D0D0D]">{t("commission")}</span> 7%
              </div>
            </div>

            <div className="text-[11px] text-neutral-400 break-all">
              {t("publicPage")}
              <br />
              <strong className="text-neutral-700">swypik.com/u/{cleanHandle || "username"}</strong>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
