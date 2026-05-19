"use client";

import { useState } from "react";

export default function CreatorApplyForm() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const f = new FormData(e.currentTarget);
    const body = {
      legal_first_name: String(f.get("legal_first_name") || "").trim(),
      legal_last_name: String(f.get("legal_last_name") || "").trim(),
      date_of_birth: String(f.get("date_of_birth") || ""),
      document_type: String(f.get("document_type") || ""),
      address_country: String(f.get("address_country") || "").toUpperCase(),
      address_region: String(f.get("address_region") || "").trim() || null,
      tax_id_ref: String(f.get("tax_id_ref") || "").trim() || null,
      accepted_terms: f.get("accepted_terms") === "on",
    };
    try {
      const r = await fetch("/api/adult/creator/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data?.message || data?.error || `HTTP ${r.status}`);
        setBusy(false); return;
      }
      if (data?.hostedUrl) {
        window.location.href = data.hostedUrl;
        return;
      }
      // No hostedUrl (dev stub) — go to creator dashboard.
      window.location.href = "/adult/creator";
    } catch (e: any) {
      setErr(String(e?.message || e)); setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={form}>
      <Row label="Legal first name"><input name="legal_first_name" required style={inp} /></Row>
      <Row label="Legal last name"><input name="legal_last_name" required style={inp} /></Row>
      <Row label="Date of birth"><input name="date_of_birth" type="date" required style={inp} /></Row>
      <Row label="Document type">
        <select name="document_type" required style={inp} defaultValue="passport">
          <option value="passport">Passport</option>
          <option value="national_id">National ID</option>
          <option value="drivers_license">Driver&apos;s license</option>
        </select>
      </Row>
      <Row label="Country (ISO-2, e.g. US, RO)">
        <input name="address_country" required pattern="[A-Za-z]{2}" maxLength={2} style={inp} />
      </Row>
      <Row label="State / Region (optional)">
        <input name="address_region" style={inp} />
      </Row>
      <Row label="Tax ID / VAT (optional)">
        <input name="tax_id_ref" style={inp} />
      </Row>
      <label style={{ display: "flex", gap: 8, color: "#d4d4d8", fontSize: 14, marginTop: 8 }}>
        <input type="checkbox" name="accepted_terms" required />
        I confirm I am 18+ and I have read and agree to the After Dark Terms, §2257 statement, and content rules.
      </label>
      <button type="submit" disabled={busy} style={btn}>
        {busy ? "Submitting…" : "Submit & continue to Veriff"}
      </button>
      {err && <p style={{ color: "#fca5a5", fontSize: 14 }}>{err}</p>}
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ color: "#a1a1aa", fontSize: 13 }}>{label}</span>
      {children}
    </label>
  );
}

const form: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 12,
  background: "#111114", border: "1px solid #1f1f23", borderRadius: 14, padding: 24,
};
const inp: React.CSSProperties = {
  background: "#0a0a0a", border: "1px solid #27272a", color: "#ededed",
  padding: "10px 12px", borderRadius: 8, fontSize: 14,
};
const btn: React.CSSProperties = {
  background: "#f43f5e", color: "#fff", border: "none",
  padding: "12px 22px", borderRadius: 999, fontWeight: 600, cursor: "pointer", fontSize: 14,
  marginTop: 8,
};
