"use client";

/**
 * AddressAutocomplete — căutare de adrese cu Nominatim (OSM).
 * Fără cheie API (nu există Google Places key de client în proiect).
 * Debounce 400ms + limit 5, conform politicii de utilizare Nominatim.
 */
import { useEffect, useRef, useState } from "react";

export type AddressResult = {
  address: string;
  lat: number;
  lng: number;
};

export default function AddressAutocomplete({
  placeholder,
  value,
  onSelect,
  icon,
}: {
  placeholder: string;
  value?: string;
  onSelect: (r: AddressResult) => void;
  icon?: React.ReactNode;
}) {
  const [query, setQuery] = useState(value ?? "");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNext = useRef(false);

  useEffect(() => {
    if (value !== undefined) setQuery(value);
  }, [value]);

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
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ro&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        const data: { display_name: string; lat: string; lon: string }[] = await res.json();
        setResults(
          data.map((d) => ({
            address: d.display_name,
            lat: Number(d.lat),
            lng: Number(d.lon),
          })),
        );
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-3 shadow-sm focus-within:border-neutral-900">
        {icon}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-neutral-400"
        />
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        ) : null}
      </div>
      {open && results.length > 0 ? (
        <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-2xl border border-neutral-200 bg-white shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full px-4 py-3 text-left text-[13px] leading-snug hover:bg-neutral-50"
                onClick={() => {
                  skipNext.current = true;
                  setQuery(r.address);
                  setOpen(false);
                  onSelect(r);
                }}
              >
                {r.address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
