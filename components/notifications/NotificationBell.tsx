"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

type Notification = {
  id: string;
  notification_type: string;
  actor_user_id: string | null;
  title: string;
  body: string | null;
  video_id: string | null;
  comment_id: string | null;
  action_url: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

type FetchResponse = {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "acum";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}z`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as FetchResponse;
      setItems(data.items || []);
      setUnread(data.unreadCount || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const toggle = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      if (next) load();
      return next;
    });
  }, [load]);

  const markAll = useCallback(async () => {
    await fetch("/api/notifications/mark-all-read", {
      method: "POST",
      credentials: "include",
    });
    setItems((rows) => rows.map((r) => ({ ...r, read_at: r.read_at || new Date().toISOString() })));
    setUnread(0);
  }, []);

  const markOne = useCallback(async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
      credentials: "include",
    });
    setItems((rows) =>
      rows.map((r) =>
        r.id === id ? { ...r, read_at: r.read_at || new Date().toISOString() } : r,
      ),
    );
    setUnread((u) => Math.max(0, u - 1));
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notificari"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#0D0D0D] text-white hover:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#10A37F]"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#10A37F] px-1 text-[11px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[90vw] overflow-hidden rounded-xl border border-white/10 bg-[#0D0D0D] text-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-sm font-semibold">Notificari</span>
            <button
              type="button"
              onClick={markAll}
              disabled={unread === 0}
              className="text-xs text-[#10A37F] hover:underline disabled:opacity-40"
            >
              Marcheaza toate citite
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-white/60">
                Se incarca...
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-white/60">
                Nicio notificare inca.
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map((n) => {
                  const unreadRow = !n.read_at;
                  const title = n.title || n.notification_type;
                  const body = n.body || "";
                  const url = n.action_url || "#";
                  return (
                    <li key={n.id}>
                      <a
                        href={url}
                        onClick={() => markOne(n.id)}
                        className={`flex gap-3 px-4 py-3 transition hover:bg-white/5 ${
                          unreadRow ? "bg-white/[0.03]" : ""
                        }`}
                      >
                        <span
                          className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                            unreadRow ? "bg-[#10A37F]" : "bg-transparent"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {String(title)}
                          </div>
                          {body && (
                            <div className="mt-0.5 line-clamp-2 text-xs text-white/70">
                              {String(body)}
                            </div>
                          )}
                          <div className="mt-1 text-[11px] text-white/40">
                            {timeAgo(n.created_at)}
                          </div>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
