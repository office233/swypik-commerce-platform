"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

export default function BecomeASellerPage() {
  const t = useTranslations("becomeaseller");
  return (
    <div className="min-h-screen bg-white text-black font-sans">
      {/* Navigation */}
      <nav className="border-b border-[#E5E5E5] px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tight text-black">
          Swypik
        </Link>
        <div className="text-sm font-medium text-gray-500">B2B Portal</div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 py-20 md:py-32 max-w-4xl mx-auto text-center">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
          
          {t("zeroBataiDeCap")}
          <br className="hidden md:block" />
          <span className="text-gray-400">  {t("expuiProduseleLaMii")}</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
          
          {t("transformatiStoculInVanzari")}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#apply"
            className="px-8 py-4 bg-black text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            
            {t("aplicaAcum")} <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-[#E5E5E5] bg-gray-50/50">
        <div className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white border border-[#E5E5E5] flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-black" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{t("vanzariAccelerate")}</h3>
            <p className="text-sm text-gray-500">
              
              {t("produseleTaleSuntPromovate")}
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white border border-[#E5E5E5] flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-black" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{t("platformaAutonoma")}</h3>
            <p className="text-sm text-gray-500">
              
              {t("totulEsteAutomatizatPreiei")}
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white border border-[#E5E5E5] flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-black" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{t("faraCosturiAscunse")}</h3>
            <p className="text-sm text-gray-500">
              
              {t("transparentaTotalaAsupraComisioanelor")}
            </p>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section id="apply" className="px-6 py-20 max-w-xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold tracking-tight mb-3">Devino Seller Swypik</h2>
          <p className="text-gray-500">
            
            {t("completeazaDetaliileCompanieiTale")}
          </p>
        </div>
        
        <SellerForm />
      </section>
    </div>
  );
}

function SellerForm() {
  const t = useTranslations("becomeaseller");
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    
    const formData = new FormData(e.currentTarget);
    const data = {
      companyName: formData.get("companyName"),
      cui: formData.get("cui"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      productType: formData.get("productType"),
    };

    try {
      const res = await fetch("/api/apply-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch (err) {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="p-8 border border-[#E5E5E5] rounded-2xl bg-white text-center">
        <div className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-bold mb-2">{t("aplicatiaTaAFost")}</h3>
        <p className="text-gray-500">{t("oVomAnalizaIn")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 border border-[#E5E5E5] p-6 md:p-8 rounded-2xl bg-white">
      {status === "error" && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
          
          {t("aAparutOEroare")}
        </div>
      )}
      
      <div className="space-y-1.5">
        <label htmlFor="companyName" className="text-sm font-medium text-black block">
          Nume Companie
        </label>
        <input
          type="text"
          id="companyName"
          name="companyName"
          required
          autoComplete="organization"
          className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
          placeholder="ex. SC Swypik SRL"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cui" className="text-sm font-medium text-black block">
          CUI
        </label>
        <input
          type="text"
          id="cui"
          name="cui"
          required
          className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
          placeholder="ex. RO12345678"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-black block">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
            placeholder="contact@companie.ro"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-black block">
            Telefon
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            required
            autoComplete="tel"
            inputMode="tel"
            className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
            placeholder="07xx xxx xxx"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="productType" className="text-sm font-medium text-black block">
          
          {t("ceTipDeProduse")}
        </label>
        <textarea
          id="productType"
          name="productType"
          required
          rows={3}
          className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all resize-none"
          placeholder={t("haineElectroniceDecoratiuniEtc")}
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full py-3.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
      >
        {status === "loading" ? "Se trimite..." : "Trimite Aplicația"}
      </button>
    </form>
  );
}
