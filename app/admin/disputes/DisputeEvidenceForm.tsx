"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type TextKey =
  | "product_description"
  | "customer_name"
  | "customer_email_address"
  | "customer_communication_text"
  | "shipping_address"
  | "shipping_carrier"
  | "shipping_tracking_number"
  | "shipping_date"
  | "service_date"
  | "refund_policy_disclosure"
  | "uncategorized_text";

type FileKey =
  | "receipt"
  | "shipping_documentation"
  | "service_documentation"
  | "customer_signature"
  | "customer_communication"
  | "refund_policy"
  | "uncategorized_file";

type EvidenceShape = Partial<Record<TextKey | FileKey, string>>;

const FIELDS: { key: TextKey; label: string; placeholder?: string; multiline?: boolean }[] = [
  { key: "product_description", label: "Descriere produs", multiline: true, placeholder: "Numele și descrierea produsului livrat" },
  { key: "customer_name", label: "Nume client" },
  { key: "customer_email_address", label: "Email client" },
  { key: "customer_communication_text", label: "Comunicare cu clientul (text)", multiline: true },
  { key: "shipping_address", label: "Adresă livrare", multiline: true },
  { key: "shipping_carrier", label: "Curier" },
  { key: "shipping_tracking_number", label: "Tracking number" },
  { key: "shipping_date", label: "Data expediere (YYYY-MM-DD)" },
  { key: "service_date", label: "Data serviciu (YYYY-MM-DD)" },
  { key: "refund_policy_disclosure", label: "Politica de retur (text)", multiline: true },
  { key: "uncategorized_text", label: "Alte note", multiline: true },
];

const FILE_FIELDS: { key: FileKey; label: string }[] = [
  { key: "receipt", label: "Receipt / Chitanță" },
  { key: "shipping_documentation", label: "Doc. expediere (AWB)" },
  { key: "service_documentation", label: "Doc. serviciu" },
  { key: "customer_signature", label: "Semnătură client" },
  { key: "customer_communication", label: "Conversație screenshot" },
  { key: "refund_policy", label: "Politica de retur (PDF)" },
  { key: "uncategorized_file", label: "Alt fișier" },
];

type FileSlot = { fileId?: string; filename?: string; uploading: boolean; error?: string };

export default function DisputeEvidenceForm({
  disputeId,
  draft,
  suggestions,
}: {
  disputeId: string;
  draft: Record<string, unknown> | null;
  suggestions?: { key: string; potentialDelta: number; newScore: number }[];
}) {
  const t = useTranslations("disputesDisputeEvidenceForm");
  const suggMap = new Map<string, { potentialDelta: number; newScore: number }>();
  for (const s of suggestions || []) suggMap.set(s.key, s);
  const router = useRouter();
  const [evidence, setEvidence] = useState<EvidenceShape>(() => {
    const init: EvidenceShape = {};
    if (draft) {
      for (const f of [...FIELDS, ...FILE_FIELDS]) {
        const v = (draft as any)[f.key];
        if (typeof v === "string") (init as any)[f.key] = v;
      }
    }
    return init;
  });
  const [fileSlots, setFileSlots] = useState<Partial<Record<FileKey, FileSlot>>>(() => {
    const init: Partial<Record<FileKey, FileSlot>> = {};
    if (draft) {
      for (const f of FILE_FIELDS) {
        const v = (draft as any)[f.key];
        if (typeof v === "string") init[f.key] = { fileId: v, filename: v, uploading: false };
      }
    }
    return init;
  });
  const fileInputRefs = useRef<Partial<Record<FileKey, HTMLInputElement | null>>>({});
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof EvidenceShape>(key: K, value: string) {
    setEvidence((prev) => ({ ...prev, [key]: value }));
  }

  async function applySuggestions() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}/suggest`);
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.error || `Eroare HTTP ${res.status}`);
        return;
      }
      const s = (data.suggestion || {}) as Partial<Record<TextKey, string>>;
      const empty = (k: TextKey) => !evidence[k] || !String(evidence[k]).trim();
      setEvidence((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(s)) {
          if (typeof v === "string" && empty(k as TextKey)) (next as any)[k] = v;
        }
        return next;
      });
      setOkMsg(`Sugestii aplicate (${Object.keys(s).length} câmpuri). Cele completate manual nu au fost suprascrise.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare necunoscută");
    } finally {
      setSuggesting(false);
    }
  }

  async function uploadFile(key: FileKey, file: File) {
    setFileSlots((prev) => ({ ...prev, [key]: { uploading: true } }));
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setFileSlots((prev) => ({ ...prev, [key]: { uploading: false, error: data?.error || `HTTP ${res.status}` } }));
        return;
      }
      setFileSlots((prev) => ({
        ...prev,
        [key]: { uploading: false, fileId: data.file_id, filename: data.filename },
      }));
      setEvidence((prev) => ({ ...prev, [key]: data.file_id }));
    } catch (e) {
      setFileSlots((prev) => ({ ...prev, [key]: { uploading: false, error: e instanceof Error ? e.message : "upload error" } }));
    }
  }

  function clearFile(key: FileKey) {
    setFileSlots((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setEvidence((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const ref = fileInputRefs.current[key];
    if (ref) ref.value = "";
  }

  async function send(submit: boolean) {
    setError(null);
    setOkMsg(null);
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(evidence)) {
      if (typeof v === "string" && v.trim()) payload[k] = v.trim();
    }
    if (submit && Object.keys(payload).length === 0) {
      setError("Trebuie cel puțin un câmp completat pentru submit.");
      return;
    }
    try {
      const res = await fetch("/api/admin/disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disputeId, evidence: payload, submit }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.error || `Eroare HTTP ${res.status}`);
        return;
      }
      setOkMsg(submit ? `Trimis la Stripe (status: ${data.status})` : "Draft salvat");
      if (submit) startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare necunoscută");
    }
  }

  return (
    <div className="space-y-3 bg-white border border-[#E5E5E5] rounded p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-sm text-[#0D0D0D]">{t("raspundeLaDispute")}</div>
        <button
          type="button"
          onClick={applySuggestions}
          disabled={suggesting}
          className="px-2.5 py-1 rounded text-xs font-semibold bg-violet-100 text-violet-800 hover:bg-violet-200 disabled:opacity-60"
        >
          {suggesting ? "Se completează…" : "Auto-completează din comandă"}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {FIELDS.map((f) => {
          const sugg = suggMap.get(f.key);
          const ringCls = sugg
            ? "border-violet-400 ring-1 ring-violet-200"
            : "border-[#E5E5E5]";
          return (
            <label key={f.key} className="text-xs flex flex-col gap-1">
              <span className="flex items-center justify-between gap-1">
                <span className="text-gray-600">{f.label}</span>
                {sugg && (
                  <span
                    className="text-[10px] font-bold bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded"
                    title={`Ar urca scorul la ${sugg.newScore}%`}
                  >
                    +{sugg.potentialDelta} pct
                  </span>
                )}
              </span>
              {f.multiline ? (
                <textarea
                  rows={3}
                  placeholder={f.placeholder}
                  value={(evidence[f.key] as string) || ""}
                  onChange={(e) => update(f.key, e.target.value)}
                  className={`border rounded p-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y ${ringCls}`}
                />
              ) : (
                <input
                  type="text"
                  placeholder={f.placeholder}
                  value={(evidence[f.key] as string) || ""}
                  onChange={(e) => update(f.key, e.target.value)}
                  className={`border rounded p-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 ${ringCls}`}
                />
              )}
            </label>
          );
        })}
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">{t("fisierePdfPngJpg")}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {FILE_FIELDS.map((f) => {
            const slot = fileSlots[f.key];
            const sugg = suggMap.get(f.key);
            const borderCls = sugg
              ? "border-violet-400 bg-violet-50/40 ring-1 ring-violet-200"
              : "border-[#E5E5E5] bg-gray-50/50";
            return (
              <div key={f.key} className={`border rounded p-2 ${borderCls}`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="text-xs text-gray-600">{f.label}</div>
                  {sugg && (
                    <span
                      className="text-[10px] font-bold bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded"
                      title={`Ar urca scorul la ${sugg.newScore}%`}
                    >
                      +{sugg.potentialDelta} pct
                    </span>
                  )}
                </div>
                {slot?.fileId ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
                      {slot.fileId.slice(0, 18)}…
                    </span>
                    <span className="text-gray-500 truncate" title={slot.filename}>{slot.filename}</span>
                    <button
                      type="button"
                      onClick={() => clearFile(f.key)}
                      className="ml-auto text-red-600 hover:underline"
                    >

                      {t("sterge")}
                    </button>
                  </div>
                ) : slot?.uploading ? (
                  <div className="text-xs text-gray-500">{t("seUrcaLaStripe")}</div>
                ) : (
                  <input
                    ref={(el) => {
                      fileInputRefs.current[f.key] = el;
                    }}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadFile(f.key, file);
                    }}
                    className="text-xs w-full"
                  />
                )}
                {slot?.error && <div className="text-xs text-red-700 mt-1">{slot.error}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}
      {okMsg && <p className="text-xs text-green-700">{okMsg}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => send(false)}
          disabled={pending}
          className="px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold border border-[#E5E5E5] hover:bg-gray-50 disabled:opacity-60"
        >

          {t("salveazaDraft")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("Trimite definitiv evidence la Stripe? Nu mai poate fi modificat.")) send(true);
          }}
          disabled={pending}
          className="px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold bg-[#0D0D0D] text-white hover:bg-black disabled:opacity-60"
        >
          {pending ? "Se trimite…" : "Trimite la Stripe"}
        </button>
      </div>
    </div>
  );
}
