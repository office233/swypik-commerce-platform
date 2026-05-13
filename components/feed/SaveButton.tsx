"use client";

import { useEffect, useState } from "react";
import { Bookmark, Plus, Check, Loader2 } from "lucide-react";

type Collection = {
  id: string;
  title: string;
  icon?: string | null;
  color?: string | null;
  item_count?: number;
};

type Props = {
  videoId: string;
  /** Optional callback when a save succeeds. */
  onSaved?: (collection: { id: string; title: string }) => void;
  /** Optional className passed to root button. */
  className?: string;
};

/**
 * SaveButton — bookmark icon with a dropdown picker.
 *
 * Single tap: quicksave to the most-recently-used / default collection.
 * Long-press / chevron: open dropdown to pick a specific collection or
 * create a new one inline.
 *
 * Talks to:
 *   - POST /api/videos/:id/quicksave   (one-tap)
 *   - GET  /api/collections            (dropdown load)
 *   - POST /api/collections            (inline create)
 *   - POST /api/collections/:id/items  (pick specific)
 */
export default function SaveButton({ videoId, onSaved, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!open || collections !== null) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch("/api/collections", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!aborted) setCollections(data.collections ?? []);
      } catch {
        if (!aborted) setCollections([]);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [open, collections]);

  const showToast = (text: string) => {
    setSavedLabel(text);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  const quickSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/quicksave`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const title: string = data?.collection?.title ?? "Salvate";
        showToast(`Salvat în ${title}`);
        onSaved?.(data.collection);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveTo = async (collectionId: string, title: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${collectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId }),
      });
      if (res.ok) {
        showToast(`Salvat în ${title}`);
        onSaved?.({ id: collectionId, title });
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const createAndSave = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const r1 = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name }),
      });
      if (!r1.ok) return;
      const { collection } = await r1.json();
      await saveTo(collection.id, collection.title);
      setNewName("");
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <button
        type="button"
        onClick={quickSave}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-label="Salvează video"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : saved ? (
          <Check className="h-6 w-6 text-neutral-700" />
        ) : (
          <Bookmark className="h-6 w-6" />
        )}
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 text-[10px] uppercase tracking-wide text-white/70 hover:text-white"
        aria-label="Alege colecția"
      >
        Salvează în…
      </button>

      {saved && savedLabel && (
        <div
          role="status"
          className="pointer-events-none absolute -top-12 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-neutral-700/95 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          {savedLabel}
        </div>
      )}

      {open && (
        <div
          className="absolute right-full top-0 z-50 mr-2 w-60 rounded-xl border border-white/10 bg-neutral-900/95 p-2 text-sm text-white shadow-2xl backdrop-blur"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="mb-1 px-2 py-1 text-[11px] uppercase tracking-wide text-white/50">
            Salvează în…
          </div>
          {collections === null ? (
            <div className="flex items-center gap-2 px-2 py-2 text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă…
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {collections.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => saveTo(c.id, c.title)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/10 disabled:opacity-50"
                  >
                    <span className="text-base">{c.icon ?? "📁"}</span>
                    <span className="flex-1 truncate">{c.title}</span>
                    <span className="text-[10px] text-white/40">
                      {c.item_count ?? 0}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1 border-t border-white/10 pt-1">
            {creating ? (
              <div className="flex items-center gap-2 px-2 py-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createAndSave();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="Nume colecție"
                  className="flex-1 rounded-md bg-white/10 px-2 py-1 text-sm placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-neutral-700"
                />
                <button
                  type="button"
                  onClick={createAndSave}
                  disabled={busy || !newName.trim()}
                  className="rounded-md bg-neutral-700 px-2 py-1 text-xs font-medium text-black disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-neutral-700 hover:bg-white/10"
              >
                <Plus className="h-4 w-4" /> Colecție nouă
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
