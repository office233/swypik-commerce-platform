"use client";

/**
 * AddressAutocomplete — căutare de adrese prin proxy-ul intern /api/geo/search
 * (Nominatim server-side cu cache Redis 24h + rate limit + User-Agent corect).
 * Debounce 350ms + formatare titlu/oraș + buton ștergere (X).
 */
import { useEffect, useRef, useState } from "react";
import { X, MapPin } from "lucide-react";

export type AddressResult = {
  address: string;
  lat: number;
  lng: number;
  city?: string | null;
};

export default function AddressAutocomplete({
  placeholder,
  value,
  onSelect,
  onClear,
  icon,
}: {
  placeholder: string;
  value?: string;
  onSelect: (r: AddressResult) => void;
  onClear?: () => void;
  icon?: React.ReactNode;
}) {
  const [query, setQuery] = useState(value ?? "");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNext = useRef(false);

  useEffect(() => {
    if (value !== undefined) setQuery(value);
  }, [value]);

  // Închide dropdown-ul la click în exterior
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(query)}`);
        const data: { results?: AddressResult[] } = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onClear?.();
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-2.5 rounded-2xl border border-neutral-200/80 bg-white px-3.5 py-3 shadow-sm focus-within:border-neutral-900 focus-within:ring-1 focus-within:ring-neutral-900/10 transition">
        {icon}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[14px] font-semibold text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
        />
        {loading ? (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        ) : query ? (
          <button
            type="button"
            onClick={handleClear}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 transition"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      {open && results.length > 0 ? (
        <ul className="absolute z-[1000] mt-1.5 max-h-64 w-full overflow-auto rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-2xl">
          {results.map((r, i) => {
            const parts = r.address.split(",");
            const title = parts[0]?.trim() || r.address;
            const subtitle = parts.slice(1).join(",").trim();

            return (
              <li key={i}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-neutral-50 active:bg-neutral-100"
                  onClick={() => {
                    skipNext.current = true;
                    setQuery(r.address);
                    setOpen(false);
                    onSelect(r);
                  }}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                    <MapPin size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-extrabold text-neutral-900">
                      {title}
                    </span>
                    {subtitle ? (
                      <span className="block truncate text-[11px] text-neutral-500 font-medium">
                        {subtitle}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
