"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Mic, Square, Loader2 } from "lucide-react";

type Product = {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  price_cents: number | null;
  currency: string;
};

function formatPrice(cents: number | null, currency: string): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat("ro-RO", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export default function VoiceShoppingPage() {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string>("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  async function start() {
    setError("");
    setTranscript("");
    setProducts([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setLoading(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "voice.webm");
          fd.append("lang", "ro");
          const res = await fetch("/api/voice/search", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) {
            setError(data?.error || `eroare ${res.status}`);
          } else {
            setTranscript(data.transcript || "");
            setProducts(Array.isArray(data.products) ? data.products : []);
            if (!data.transcript) setError(data.note || "Nu am putut transcrie audio. Vorbește din nou.");
          }
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setLoading(false);
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch (e) {
      setError("Microfon indisponibil: " + (e as Error).message);
    }
  }

  function stop() {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>🎙️ Caută cu vocea</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>Apasă butonul, descrie ce vrei să cumperi, eliberează.</p>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={loading}
          aria-label={recording ? "Oprește înregistrarea" : "Începe înregistrarea"}
          aria-pressed={recording}
          style={{
            width: 120, height: 120, borderRadius: "50%",
            background: recording ? "#FE2C55" : "#7C3AED",
            border: 0, color: "#fff", cursor: loading ? "wait" : "pointer",
            boxShadow: recording ? "0 0 0 8px rgba(254,44,85,0.3)" : "0 4px 24px rgba(124,58,237,0.4)",
            transition: "all 0.2s",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {loading ? <Loader2 size={48} className="animate-spin" /> : recording ? <Square size={48} fill="#fff" /> : <Mic size={48} />}
        </button>
      </div>

      {recording && <p style={{ textAlign: "center", color: "#FE2C55", fontWeight: 600 }}>● Ascult...</p>}
      {error && <p role="alert" style={{ textAlign: "center", color: "#EF4444" }}>{error}</p>}

      {transcript && (
        <div style={{ background: "#f5f5f5", padding: 16, borderRadius: 12, marginBottom: 24 }}>
          <strong>Ai spus:</strong> <em>&ldquo;{transcript}&rdquo;</em>
        </div>
      )}

      {products.length > 0 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Rezultate ({products.length})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/product/${p.id}`}
                style={{ display: "block", textDecoration: "none", color: "inherit", border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}
              >
                {p.image_url ? (
                  <Image src={p.image_url} alt={p.title} width={200} height={200} style={{ width: "100%", height: 160, objectFit: "cover" }} unoptimized />
                ) : (
                  <div style={{ height: 160, background: "#f0f0f0" }} />
                )}
                <div style={{ padding: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                  <div style={{ fontSize: 14, color: "#7C3AED", fontWeight: 700 }}>{formatPrice(p.price_cents, p.currency)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
