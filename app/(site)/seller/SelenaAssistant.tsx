"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Send } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { IconButton } from "@/components/ui/IconButton";
import { Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/ui/cn";

type Task = "chat" | "product_description" | "price_suggestion" | "customer_reply";
type Msg = { role: "user" | "assistant"; content: string };

/**
 * Copilotul AI al seller-ului (proxy către ERP-ul lui — de aceea layout-ul îl
 * afișează doar cu ERP conectat). Buton compact deasupra BottomNav + sertar lateral.
 */
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
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: t("welcomeMessage") }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = TASKS.find((tk) => tk.id === task) ?? TASKS[0];

  async function handleSend() {
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
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; answer?: string };
      if (!res.ok || !json.success || !json.answer) throw new Error("selena_failed");
      setMessages((prev) => [...prev, { role: "assistant", content: String(json.answer) }]);
    } catch {
      setError(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      side="right"
      title={t("copilotName")}
      description={t("fullName")}
      trigger={
        <IconButton
          variant="primary"
          size="lg"
          label={t("openTitle")}
          className="fixed right-4 z-40 shadow-elev-2"
          style={{ bottom: "calc(var(--bottom-inset, 0px) + 1rem)" }}
        >
          <Sparkles aria-hidden />
        </IconButton>
      }
      footer={
        <div className="space-y-1">
          <div className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              placeholder={active.placeholder}
              aria-label={active.placeholder}
              className="pr-14"
            />
            <IconButton
              variant="primary"
              size="sm"
              label={t("sendLabel")}
              onClick={() => void handleSend()}
              disabled={loading || !input.trim()}
              className="absolute bottom-2 right-2"
            >
              <Send aria-hidden />
            </IconButton>
          </div>
          <p className="text-center text-xs text-subtle">{t("enterHint")}</p>
        </div>
      }
    >
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {TASKS.map((tk) => (
          <button
            key={tk.id}
            type="button"
            onClick={() => setTask(tk.id)}
            aria-pressed={task === tk.id}
            className={cn(
              "min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors duration-fast",
              task === tk.id ? "bg-brand text-brand-fg" : "border border-subtle bg-surface text-muted hover:bg-surface-2",
            )}
          >
            {tk.label}
          </button>
        ))}
      </div>
      <div className="space-y-3" aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap rounded-card p-3 text-sm",
              m.role === "user" ? "ml-8 bg-brand text-brand-fg" : "mr-8 bg-surface-2 text-fg",
            )}
          >
            <p className="mb-1 text-xs font-semibold opacity-70">{m.role === "user" ? t("youLabel") : t("copilotName")}</p>
            {m.content}
          </div>
        ))}
        {loading ? (
          <p className="mr-8 flex items-center gap-2 rounded-card bg-surface-2 p-3 text-sm text-muted">
            <Sparkles className="h-4 w-4 animate-spin" aria-hidden />
            {t("thinking")}
          </p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Sheet>
  );
}
