"use client";

import { useEffect, useState } from "react";

interface Consent {
  id: string;
  subject_legal_name: string;
  signed_at: string;
  revoked_at: string | null;
}

async function presignAndUpload(file: File, postKind: string, variant: "preview" | "premium"): Promise<string> {
  const r = await fetch("/api/adult/media/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      postKind,
      variant,
      contentType: file.type,
      contentLength: file.size,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.message || data?.error || `presign failed (${r.status})`);

  const put = await fetch(data.url, {
    method: "PUT",
    headers: data.headers,
    body: file,
  });
  if (!put.ok) throw new Error(`upload failed (${put.status})`);
  return data.key as string;
}

export default function UploadForm() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [selectedConsents, setSelectedConsents] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/adult/consent").then(r => r.json()).then(d => {
      if (Array.isArray(d.items)) setConsents(d.items);
    }).catch(() => {});
  }, []);

  function toggleConsent(id: string) {
    const next = new Set(selectedConsents);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedConsents(next);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null); setOk(null); setProgress("");
    try {
      const f = new FormData(e.currentTarget);
      const kind = String(f.get("kind") || "photo_set");
      const title = String(f.get("title") || "").trim();
      const description = String(f.get("description") || "").trim() || null;
      const previewFile = f.get("preview") as File | null;
      const premiumFile = f.get("premium") as File | null;
      const priceMinor = Math.max(0, Math.floor(Number(f.get("price_minor") || 0)));
      const currency = String(f.get("currency") || "EUR").toUpperCase();
      const requiresSubscription = f.get("requires_subscription") === "on";

      if (!premiumFile || premiumFile.size === 0) throw new Error("premium file required");
      if (selectedConsents.size < 1) throw new Error("select at least one consent release");

      setProgress("Uploading premium media…");
      const premiumKey = await presignAndUpload(premiumFile, kind, "premium");

      let previewKey: string | null = null;
      if (previewFile && previewFile.size > 0) {
        setProgress("Uploading preview media…");
        previewKey = await presignAndUpload(previewFile, kind, "preview");
      }

      setProgress("Creating post…");
      const r = await fetch("/api/adult/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind, title, description,
          preview_media_key: previewKey,
          premium_media_key: premiumKey,
          price_minor: priceMinor,
          currency,
          requires_subscription: requiresSubscription,
          consent_release_ids: Array.from(selectedConsents),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || data?.error || `create failed (${r.status})`);
      setOk(`Submitted for moderation. Post id: ${data.id}`);
      (e.target as HTMLFormElement).reset();
      setSelectedConsents(new Set());
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false); setProgress("");
    }
  }

  return (
    <form onSubmit={onSubmit} style={form}>
      <Row label="Kind">
        <select name="kind" style={inp} defaultValue="photo_set">
          <option value="photo_set">Photo set</option>
          <option value="video">Video</option>
          <option value="ppv">Pay-per-view</option>
          <option value="drop">Drop</option>
          <option value="bundle">Bundle</option>
        </select>
      </Row>
      <Row label="Title"><input name="title" required minLength={3} style={inp} /></Row>
      <Row label="Description (optional)">
        <textarea name="description" rows={3} style={{ ...inp, resize: "vertical" }} />
      </Row>
      <Row label="Preview file (optional, shown to non-paying viewers)">
        <input name="preview" type="file" accept="image/*,video/*" style={inp} />
      </Row>
      <Row label="Premium file (required — main content)">
        <input name="premium" type="file" accept="image/*,video/*" required style={inp} />
      </Row>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Row label="Price (minor units, e.g. 499 = €4.99)">
          <input name="price_minor" type="number" min={0} defaultValue={0} style={inp} />
        </Row>
        <Row label="Currency">
          <select name="currency" defaultValue="EUR" style={inp}>
            <option>EUR</option><option>USD</option><option>GBP</option>
          </select>
        </Row>
        <Row label="Subscribers only">
          <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#d4d4d8" }}>
            <input name="requires_subscription" type="checkbox" /> Yes
          </label>
        </Row>
      </div>

      <fieldset style={{ border: "1px solid #27272a", borderRadius: 8, padding: 12 }}>
        <legend style={{ color: "#a1a1aa", padding: "0 8px" }}>Attach consent releases (required)</legend>
        {consents.length === 0 ? (
          <p style={{ color: "#a1a1aa", fontSize: 13 }}>
            You have no consent releases yet. Create one via the consent record form before publishing.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {consents.map(c => (
              <li key={c.id} style={{ padding: "6px 0", color: "#d4d4d8", fontSize: 14 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={selectedConsents.has(c.id)}
                    onChange={() => toggleConsent(c.id)}
                    disabled={Boolean(c.revoked_at)}
                  />
                  <span>
                    <strong>{c.subject_legal_name}</strong>{" "}
                    <span style={{ color: "#71717a" }}>(signed {new Date(c.signed_at).toLocaleDateString()})</span>
                    {c.revoked_at && <span style={{ color: "#fca5a5" }}> · revoked</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <button type="submit" disabled={busy} style={btn}>
        {busy ? (progress || "Working…") : "Submit for moderation"}
      </button>
      {err && <p style={{ color: "#fca5a5" }}>{err}</p>}
      {ok && <p style={{ color: "#86efac" }}>{ok}</p>}
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
};
