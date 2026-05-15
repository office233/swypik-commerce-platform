"use client";

import { useEffect, useState } from "react";
import { Subtitles } from "lucide-react";

const LANG_LABELS: Record<string, string> = {
  ro: "Română",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
};

type Segment = { start: number; end: number; text: string };

type Props = {
  videoId: string;
  /** Current playback time in seconds (live updated). */
  currentTimeRef?: { current: number };
};

/** Floating CC button + active overlay text. Self-contained polling per-frame. */
export default function CaptionsButton({ videoId, currentTimeRef }: Props) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [overlay, setOverlay] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/videos/${videoId}/captions/list`)
      .then((r) => (r.ok ? r.json() : { languages: [] }))
      .then((j) => {
        if (!cancelled) setAvailable(Array.isArray(j?.languages) ? j.languages : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (!selected) {
      setSegments([]);
      setOverlay("");
      return;
    }
    let cancelled = false;
    fetch(`/api/videos/${videoId}/captions?lang=${selected}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setSegments(Array.isArray(j?.segments) ? j.segments : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected, videoId]);

  useEffect(() => {
    if (!selected || segments.length === 0) return;
    let raf = 0;
    const tick = () => {
      const t = currentTimeRef?.current ?? 0;
      const seg = segments.find((s) => t >= s.start && t <= s.end);
      setOverlay(seg?.text || "");
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [selected, segments, currentTimeRef]);

  if (available.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="action-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Subtitrări"
        aria-pressed={!!selected}
        style={{ position: "relative" }}
      >
        <div className="icon-wrap">
          <Subtitles size={28} strokeWidth={1.5} color={selected ? "#FE2C55" : "#fff"} />
        </div>
        <span className="count" style={{ fontSize: 10 }}>{selected ? selected.toUpperCase() : "CC"}</span>
        {open && (
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", right: 56, bottom: 0, background: "rgba(0,0,0,0.92)", borderRadius: 10, padding: 6, minWidth: 140, zIndex: 30 }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { setSelected(null); setOpen(false); }}
              style={{ display: "block", width: "100%", padding: "8px 12px", background: !selected ? "#FE2C55" : "transparent", color: "#fff", border: 0, textAlign: "left", borderRadius: 6, fontSize: 13, cursor: "pointer" }}
            >
              Off
            </button>
            {available.map((l) => (
              <button
                key={l}
                type="button"
                role="menuitem"
                onClick={() => { setSelected(l); setOpen(false); }}
                style={{ display: "block", width: "100%", padding: "8px 12px", background: selected === l ? "#FE2C55" : "transparent", color: "#fff", border: 0, textAlign: "left", borderRadius: 6, fontSize: 13, cursor: "pointer" }}
              >
                {LANG_LABELS[l] || l}
              </button>
            ))}
          </div>
        )}
      </button>

      {selected && overlay && (
        <div
          aria-live="polite"
          style={{
            position: "absolute",
            left: 16,
            right: 80,
            bottom: 220,
            zIndex: 10,
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            textShadow: "0 2px 6px rgba(0,0,0,0.85)",
            background: "rgba(0,0,0,0.35)",
            padding: "6px 10px",
            borderRadius: 8,
            pointerEvents: "none",
            textAlign: "center",
          }}
        >
          {overlay}
        </div>
      )}
    </>
  );
}
