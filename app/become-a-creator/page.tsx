"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function BecomeACreatorPage() {
  return (
    <div className="min-h-screen bg-white text-black font-sans">
      {/* Navigation */}
      <nav className="border-b border-[#E5E5E5] px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tight text-black">
          Swypik
        </Link>
        <div className="text-sm font-medium text-gray-500">Portal Creatori</div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 py-20 md:py-32 max-w-4xl mx-auto text-center">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
          Câștigă bani promovând produsele pe care le iubești.
        </h1>
        <p className="text-lg md:text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
          Monetizează-ți audiența. Alătură-te rețelei de creatori Swypik și primești comisioane
          pentru fiecare vânzare generată prin conținutul tău.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#apply"
            className="px-8 py-4 bg-black text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            Aplică acum <ArrowRight className="w-4 h-4" />
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
            <h3 className="font-semibold text-lg mb-2">Comisioane Atractive</h3>
            <p className="text-sm text-gray-500">
              Primești un procent generos din valoarea fiecărei comenzi generate.
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white border border-[#E5E5E5] flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-black" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Produse Diverse</h3>
            <p className="text-sm text-gray-500">
              Ai acces la mii de produse din catalogul nostru pe care să le promovezi.
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white border border-[#E5E5E5] flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-black" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Plăți Rapide</h3>
            <p className="text-sm text-gray-500">
              Îți primești banii direct în cont, fără întârzieri sau birocrație.
            </p>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section id="apply" className="px-6 py-20 max-w-xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold tracking-tight mb-3">Devino Creator Swypik</h2>
          <p className="text-gray-500">
            Completează detaliile tale, iar echipa noastră îți va analiza profilul.
          </p>
        </div>
        
        <CreatorForm />
      </section>
    </div>
  );
}

function CreatorForm() {
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name"),
      email: formData.get("email"),
      socialLink: formData.get("socialLink"),
      followers: formData.get("followers"),
    };

    try {
      const res = await fetch("/api/apply-creator", {
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
        <h3 className="text-2xl font-bold mb-2">Aplicația ta a fost primită!</h3>
        <p className="text-gray-500">O vom analiza în scurt timp și te vom contacta pe email.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 border border-[#E5E5E5] p-6 md:p-8 rounded-2xl bg-white">
      {status === "error" && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
          A apărut o eroare. Te rugăm să încerci din nou.
        </div>
      )}
      
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium text-black block">
          Numele tău complet
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
          placeholder="ex. Ion Popescu"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-black block">
          Email
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
          placeholder="contact@email.com"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="socialLink" className="text-sm font-medium text-black block">
          Link Social Media (TikTok / Instagram)
        </label>
        <input
          type="url"
          id="socialLink"
          name="socialLink"
          required
          className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
          placeholder="https://tiktok.com/@username"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="followers" className="text-sm font-medium text-black block">
          Nivel de urmăritori
        </label>
        <select
          id="followers"
          name="followers"
          required
          className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all bg-white"
        >
          <option value="">Selectează...</option>
          <option value="under_10k">Sub 10,000</option>
          <option value="10k_to_50k">10,000 - 50,000</option>
          <option value="50k_to_100k">50,000 - 100,000</option>
          <option value="over_100k">Peste 100,000</option>
        </select>
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
