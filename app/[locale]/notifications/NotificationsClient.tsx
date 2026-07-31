"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import TopBar from "@/components/TopBar";
import { useTranslations } from "next-intl";

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

export default function NotificationsClient() {
  const t = useTranslations("notificationsPage");

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t("justNow");
    if (m < 60) return t("minutesShort", { count: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t("hoursShort", { count: h });
    const d = Math.floor(h / 24);
    return t("daysShort", { count: d });
  }

  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50", {
        credentials: "include",
        cache: "no-store",
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
  }, [load]);

  const markAll = useCallback(async () => {
    setMarking(true);
    try {
      await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
      });
      const now = new Date().toISOString();
      setItems((rows) => rows.map((r) => ({ ...r, read_at: r.read_at || now })));
      setUnread(0);
    } finally {
      setMarking(false);
    }
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
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <TopBar />

      <div className="mx-auto max-w-lg px-4 py-5 pb-24">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight">{t("title")}</h1>
          <button
            type="button"
            onClick={markAll}
            disabled={marking || unread === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0D0D0D] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#0E906F] disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {t("markAllRead")}
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-[#6E6E80]">
            {t("loading")}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E5E5] bg-[#F9FAFB] px-6 py-16 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#0D0D0D]/10 text-[#0D0D0D]">
              <Bell className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-base font-black">{t("emptyTitle")}</h2>
            <p className="mt-1 text-sm text-[#6E6E80]">{t("emptyBody")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F0F0F0] overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white shadow-sm">
            {items.map((n) => {
              const unreadRow = !n.read_at;
              const url = n.action_url || "#";
              return (
                <li key={n.id}>
                  <Link
                    href={url}
                    onClick={() => {
                      if (unreadRow) markOne(n.id);
                    }}
                    className={`flex gap-3 px-4 py-3 transition hover:bg-[#F9FAFB] ${unreadRow ? "bg-[#0D0D0D]/5" : ""
                      }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${unreadRow ? "bg-[#0D0D0D]" : "bg-transparent"
                        }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[#0D0D0D]">
                        {n.title || n.notification_type}
                      </div>
                      {n.body && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-[#6E6E80]">
                          {n.body}
                        </div>
                      )}
                      <div className="mt-1 text-[11px] font-medium text-[#A1A1AA]">
                        {timeAgo(n.created_at)}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
