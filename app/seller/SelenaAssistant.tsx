"use client";

/**
 * SelenaAssistant — chat minimal cu Selena AI (din ERP) pentru selleri.
 * Consumă POST /api/seller/selena, care face proxy autentificat cu X-Api-Key
 * către ERP: /api/partner/selena/assist.
 *
 * Task-uri: descriere produs, sugestie preț, răspuns către client, chat liber.
 * La depășirea limitei de plan (HTTP 402) afișăm clar mesajul de upgrade.
 */

import { useState } from "react";
import { Sparkles, CheckCircle2 } from "lucide-react";

type Task = "chat" | "product_description" | "price_suggestion" | "customer_reply";

const TASKS: Array<{ id: Task; label: string; placeholder: string }> = [
  { id: "chat", label: "Întrebare liberă", placeholder: "Întreabă-mă orice despre vânzări, produse sau clienți..." },
  { id: "product_description", label: "Descriere produs", placeholder: "Ex: Bormașină Bosch GSB 13 RE, 600W, percuție, mandrină 13mm" },
  { id: "price_suggestion", label: "Sugestie preț", placeholder: "Ex: Bormașină Bosch GSB 13 RE, cost achiziție 220 lei, categorie scule electrice" },
  { id: "customer_reply", label: "Răspuns client", placeholder: "Lipește aici mesajul primit de la client..." },
];

type Msg = { role: "user" | "assistant"; content: string };

export default function SelenaAssistant() {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<Task>("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);

  const active = TASKS.find((t) => t.id === task) ?? TASKS[0];

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    setQuotaMessage(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/seller/selena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, message: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setQuotaMessage(json.message || "Ai atins limita lunară de mesaje Selena.");
        return;
      }
      if (!res.ok || !json.success) {
        setError(json.error || "Selena nu a putut răspunde. Încearcă din nou.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: String(json.answer || "") }]);
    } catch {
      setError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-8 rounded-xl border border-[#E5E5E5] bg-white overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[48px] text-left hover:bg-[#F7F7F8] focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-lg"><Sparkles size={18} /></span>
          <span className="font-black text-[#0D0D0D]">Selena — asistent AI pentru vânzări</span>
        </span>
        <span className="text-sm text-[#6E6E80]">{open ? "Ascunde" : "Deschide"}</span>
      </button>

      {open && (
        <div className="border-t border-[#E5E5E5] p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {TASKS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTask(t.id)}
                className={`rounded-full px-3 py-1.5 min-h-[36px] text-xs font-bold border focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none ${
                  task === t.id
                    ? "bg-[#0D0D0D] text-white border-[#0D0D0D]"
                    : "bg-white text-[#0D0D0D] border-[#E5E5E5] hover:bg-[#F7F7F8]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {quotaMessage && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-bold text-amber-900">Limită atinsă</p>
              <p className="text-sm text-amber-800 mt-1">{quotaMessage}</p>
            </div>
          )}
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-bold text-red-700">{error}</p>
            </div>
          )}

          {messages.length > 0 && (
            <div className="mb-3 max-h-80 overflow-y-auto space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-[#F7F7F8] text-[#0D0D0D]" : "bg-violet-50 text-[#0D0D0D]"
                  }`}
                >
                  <span className="block text-[11px] font-bold text-[#6E6E80] mb-1">
                    {m.role === "user" ? "Tu" : "Selena"}
                  </span>
                  {m.content}
                </div>
              ))}
            </div>
          )}

          <label htmlFor="selena-input" className="sr-only">
            Mesaj pentru Selena
          </label>
          <textarea
            id="selena-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            rows={3}
            placeholder={active.placeholder}
            className="w-full rounded-lg border border-[#E5E5E5] p-3 text-sm focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#6E6E80]">Ctrl/⌘ + Enter pentru trimitere</span>
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-[#0D0D0D] px-4 py-2.5 min-h-[40px] text-sm font-bold text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
            >
              {loading ? "Selena scrie..." : "Trimite"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
