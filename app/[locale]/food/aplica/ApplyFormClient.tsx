"use client";

/**
 * Formular public de aplicare restaurant → POST /api/merchants/apply
 * Creează local_merchant cu status='pending'; adminul aprobă în /admin/aplicatii.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";

type FormState = {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  schedule: string;
  description: string;
};

const EMPTY: FormState = {
  name: "",
  address: "",
  city: "",
  phone: "",
  email: "",
  schedule: "",
  description: "",
};

export default function ApplyFormClient() {
  const t = useTranslations("foodApply");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/merchants/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(typeof data.error === "string" && data.error !== "rate_limited" ? data.error : t("error"));
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setErrorMsg(t("error"));
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-lg font-bold text-green-700">{t("successTitle")}</p>
        <p className="mt-2 text-[14px] text-green-800">{t("successBody")}</p>
      </div>
    );
  }

  const input =
    "w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-[14px] outline-none focus:border-violet-400";

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <label className="mb-1 block text-[13px] font-bold" htmlFor="fa-name">{t("nameLabel")}</label>
        <input id="fa-name" className={input} required minLength={2} maxLength={160} value={form.name} onChange={set("name")} />
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-bold" htmlFor="fa-address">{t("addressLabel")}</label>
        <input id="fa-address" className={input} required minLength={5} maxLength={400} value={form.address} onChange={set("address")} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[13px] font-bold" htmlFor="fa-city">{t("cityLabel")}</label>
          <input id="fa-city" className={input} required minLength={2} maxLength={120} value={form.city} onChange={set("city")} />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-bold" htmlFor="fa-phone">{t("phoneLabel")}</label>
          <input id="fa-phone" type="tel" className={input} required minLength={5} maxLength={32} value={form.phone} onChange={set("phone")} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-bold" htmlFor="fa-email">{t("emailLabel")}</label>
        <input id="fa-email" type="email" className={input} maxLength={254} value={form.email} onChange={set("email")} />
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-bold" htmlFor="fa-schedule">{t("scheduleLabel")}</label>
        <input id="fa-schedule" className={input} maxLength={400} placeholder={t("schedulePlaceholder")} value={form.schedule} onChange={set("schedule")} />
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-bold" htmlFor="fa-desc">{t("descriptionLabel")}</label>
        <textarea id="fa-desc" className={`${input} min-h-[100px]`} maxLength={2000} value={form.description} onChange={set("description")} />
      </div>
      {errorMsg && <p className="text-[13px] font-bold text-red-600">{errorMsg}</p>}
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-xl bg-black py-3 text-[15px] font-bold text-white hover:bg-black/85 disabled:opacity-50"
      >
        {status === "sending" ? t("sending") : t("submit")}
      </button>
    </form>
  );
}
