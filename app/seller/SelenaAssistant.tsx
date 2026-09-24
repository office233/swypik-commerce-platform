"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, X, Send, Bot } from "lucide-react";

type Task = "chat" | "product_description" | "price_suggestion" | "customer_reply";

type Msg = { role: "user" | "assistant"; content: string };

export default function SelenaAssistant() {
  const t = useTranslations("sellerGrowthSelena");
  const TASKS: Array<{ id: Task; label: string; placeholder: string }> = [
    { id: "chat", label: t("taskChatLabel"), placeholder: t("taskChatPlaceholder") },
    { id: "product_description", label: t("taskDescriptionLabel"), placeholder: t("taskDescriptionPlaceholder") },
    { id: "price_suggestion", label: t("taskPriceLabel"), placeholder: t("taskPricePlaceholder") },
    { id: "customer_reply", label: t("taskReplyLabel"), placeholder: t("taskReplyPlaceholder") },
  ];
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<Task>("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: t("welcomeMessage"),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = TASKS.find((tk) => tk.id === task) ?? TASKS[0];

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/seller/selena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, message: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        // Fallback friendly AI responses if the AI backend proxy is offline
        let fallbackReply: string;
        if (task === "product_description") {
          fallbackReply = t("fallbackDescription", { text });
        } else if (task === "price_suggestion") {
          fallbackReply = t("fallbackPrice");
        } else {
          fallbackReply = t("fallbackChat", { text });
        }
        setMessages((prev) => [...prev, { role: "assistant", content: json.answer || fallbackReply }]);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: String(json.answer || "") }]);
    } catch {
      setError(t("connectionError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black text-xs shadow-2xl transition-all transform hover:scale-105 active:scale-95"
          title={t("openTitle")}
          aria-label={t("openTitle")}
        >
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>{t("copilotName")}</span>
        </button>
      )}

      {/* Floating Chat Window */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-96 max-w-[calc(100vw-32px)] h-[540px] max-h-[calc(100vh-64px)] bg-white rounded-3xl shadow-2xl border border-violet-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">
                <Bot size={18} />
              </div>
              <div>
                <h3 className="font-black text-sm leading-tight flex items-center gap-1.5">
                  Ily AI <span className="text-[9px] px-1.5 py-0.2 bg-amber-400 text-black font-black rounded uppercase">{t("copilotTag")}</span>
                </h3>
                <p className="text-[10px] text-violet-200 font-medium">{t("fullName")}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
              aria-label={t("closeLabel")}
            >
              <X size={16} />
            </button>
          </div>

          {/* Quick Tasks */}
          <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-100 flex gap-1.5 overflow-x-auto">
            {TASKS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTask(t.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition ${
                  task === t.id
                    ? "bg-[#0D0D0D] text-white"
                    : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`p-3 rounded-2xl text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-[#0D0D0D] text-white ml-6 rounded-tr-sm"
                    : "bg-violet-50 text-neutral-800 border border-violet-100 mr-6 rounded-tl-sm whitespace-pre-wrap"
                }`}
              >
                <div className="font-bold text-[10px] opacity-70 mb-1 flex items-center gap-1">
                  {m.role === "user" ? t("youLabel") : "Ily AI"}
                </div>
                {m.content}
              </div>
            ))}

            {loading && (
              <div className="p-3 bg-violet-50 rounded-2xl mr-6 border border-violet-100 text-xs text-violet-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin" />
                {t("thinking")}
              </div>
            )}
            {error && <div className="text-xs text-red-600 px-2">{error}</div>}
          </div>

          {/* Input Area */}
          <div className="p-3 border-t border-neutral-100 bg-white space-y-2">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={2}
                placeholder={active.placeholder}
                className="w-full pr-10 pl-3 py-2 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                aria-label={t("sendLabel")}
                className="absolute right-2.5 bottom-2.5 w-7 h-7 rounded-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center transition disabled:opacity-40"
              >
                <Send size={13} />
              </button>
            </div>
            <p className="text-[10px] text-neutral-400 text-center">{t("enterHint")}</p>
          </div>
        </div>
      )}
    </>
  );
}
