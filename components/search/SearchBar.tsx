"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Suggestion = {
  type: "video" | "creator";
  label: string;
  id: string;
  thumbnail?: string | null;
};

type Props = {
  initialQuery?: string;
  placeholder?: string;
};

const ACCENT = "#10A37F";

export default function SearchBar({
  initialQuery = "",
  placeholder = "Search videos, creators…",
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();

    if (trimmed.length < 1) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal, cache: "no-store" }
        );
        const data = await res.json();
        setSuggestions(
          Array.isArray(data?.suggestions) ? data.suggestions : []
        );
        setOpen(true);
        setActiveIdx(-1);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  // Close dropdown on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  function go(s: Suggestion) {
    setOpen(false);
    if (s.type === "video") {
      router.push(`/video/${s.id}`);
    } else if (s.type === "creator") {
      // label looks like "@username"
      const handle = s.label.startsWith("@") ? s.label.slice(1) : s.label;
      router.push(`/u/${encodeURIComponent(handle)}`);
    }
  }

  function submitQuery(value: string) {
    const v = value.trim();
    if (v.length < 2) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(v)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        submitQuery(q);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        go(suggestions[activeIdx]);
      } else {
        submitQuery(q);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 text-white placeholder-neutral-500 focus:outline-none"
        style={{ caretColor: ACCENT }}
      />

      {loading && (
        <div
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
          style={{ color: ACCENT }}
        >
          …
        </div>
      )}

      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-50 left-0 right-0 mt-1 max-h-96 overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 shadow-xl"
          role="listbox"
        >
          {suggestions.map((s, i) => {
            const active = i === activeIdx;
            return (
              <li
                key={`${s.type}-${s.id}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(s);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                style={{
                  backgroundColor: active ? "#1a1a1a" : "transparent",
                }}
              >
                <div className="w-8 h-8 rounded bg-neutral-800 overflow-hidden flex-shrink-0">
                  {s.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{s.label}</div>
                  <div
                    className="text-xs"
                    style={{ color: s.type === "creator" ? ACCENT : "#888" }}
                  >
                    {s.type === "video" ? "Video" : "Creator"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
