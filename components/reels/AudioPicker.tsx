"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { Search, X, Play, Pause, Check, Music } from "lucide-react";
import { useTranslations } from "next-intl";

export interface AudioTrackDTO {
  id: number;
  source: string;
  sourceId: string;
  title: string;
  artist: string;
  durationS: number;
  audioUrl: string;
  imageUrl: string | null;
  tags: string[];
  genre: string | null;
  attributionUrl: string | null;
  popularity: number;
}

interface AudioPickerProps {
  open: boolean;
  onClose: () => void;
  selectedId: number | null;
  onSelect: (track: AudioTrackDTO | null) => void;
}

const GENRES = ["pop", "rock", "electronic", "hiphop", "jazz", "classical", "ambient", "dance"];

function formatDur(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function AudioPicker({ open, onClose, selectedId, onSelect }: AudioPickerProps) {
  const t = useTranslations("audioPicker");
  const tAudio = useTranslations("audioPicker");
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [tracks, setTracks] = useState<AudioTrackDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const titleId = "audio-picker-title";

  const fetchTracks = useCallback(async (search: string, genreFilter: string) => {
    // Abort any in-flight request before starting a new one
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (genreFilter) params.set("genre", genreFilter);
      params.set("limit", "50");
      const res = await fetch(`/api/audio/tracks?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      if (!controller.signal.aborted) {
        setTracks(Array.isArray(data.tracks) ? data.tracks : []);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(tAudio("errNuAmIncarcat"));
      setTracks([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Fetch on open + on filter change (debounced)
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchTracks(q, genre), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [open, q, genre, fetchTracks]);

  // Stop audio on close
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      setPlayingId(null);
    }
  }, [open]);

  // A11y: Escape closes, focus search on open, body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // focus the search input
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  const togglePlay = useCallback((track: AudioTrackDTO) => {
    let el = audioRef.current;
    if (!el) {
      el = new Audio();
      el.preload = "none";
      el.onended = () => setPlayingId(null);
      audioRef.current = el;
    }
    if (playingId === track.id) {
      el.pause();
      setPlayingId(null);
    } else {
      el.src = track.audioUrl;
      el.currentTime = 0;
      el.play().then(() => setPlayingId(track.id)).catch(() => setPlayingId(null));
    }
  }, [playingId]);

  const handleSelect = useCallback((track: AudioTrackDTO) => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
    onSelect(track);
    onClose();
  }, [onSelect, onClose]);

  const handleClear = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
    onSelect(null);
    onClose();
  }, [onSelect, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md bg-neutral-950 text-white rounded-t-3xl sm:rounded-3xl border border-white/10 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/10">
          <button
            onClick={onClose}
            aria-label={t("inchide")}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 active:scale-95"
          >
            <X size={18} />
          </button>
          <h2 id={titleId} className="text-sm font-bold">{tAudio("alegePiesa")}</h2>
          <button
            onClick={handleClear}
            className="text-xs font-bold text-white/60 hover:text-white"
          >
            {selectedId ? tAudio("elimina") : tAudio("fara")}
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              ref={searchInputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("cautaTitluArtistTag")}
              aria-label={t("cautaPiesa")}
              className="w-full bg-white/5 border border-white/10 rounded-full pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-white/30"
            />
          </div>
        </div>

        {/* Genre chips */}
        <div className="px-4 pt-3 pb-2 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            <button
              onClick={() => setGenre("")}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                genre === "" ? "bg-white text-black" : "bg-white/10 text-white/80"
              }`}
            >
              Toate
            </button>
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setGenre(genre === g ? "" : g)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize transition ${
                  genre === g ? "bg-white text-black" : "bg-white/10 text-white/80"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading && (
            <div className="text-center text-xs text-white/40 py-8">{t("seIncarca")}</div>
          )}
          {error && (
            <div className="text-center text-xs text-red-400 py-8">{error}</div>
          )}
          {!loading && !error && tracks.length === 0 && (
            <div className="text-center text-xs text-white/40 py-8">{t("nicioPiesaGasita")}</div>
          )}
          {tracks.map((t) => {
            const isPlaying = playingId === t.id;
            const isSelected = selectedId === t.id;
            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 p-2 rounded-xl my-0.5 ${
                  isSelected ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <button
                  onClick={() => togglePlay(t)}
                  aria-label={isPlaying ? tAudio("pauza") : tAudio("reda")}
                  className="relative w-12 h-12 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 active:scale-95"
                >
                  {t.imageUrl ? (
                    <Image src={t.imageUrl} alt="" width={48} height={48} className="h-full w-full object-cover" unoptimized />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music size={18} className="text-white/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    {isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" />}
                  </div>
                </button>
                <button
                  onClick={() => handleSelect(t)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="text-sm font-bold truncate">{t.title}</div>
                  <div className="text-[11px] text-white/50 truncate">
                    {t.artist} · {formatDur(t.durationS)}
                    {t.genre ? ` · ${t.genre}` : ""}
                  </div>
                </button>
                {isSelected && (
                  <div className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0">
                    <Check size={14} strokeWidth={3} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}