"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, MessageCircle, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";

type Notification = {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

type Conversation = {
  id: string;
  peer?: {
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  last_message?: {
    body?: string;
    created_at?: string;
  } | null;
  last_message_at?: string | null;
  unread_count?: number;
};

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "acum";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}z`;
}

type Tab = "messages" | "notifications";

export default function InboxClient() {
  const t = useTranslations("inbox");
  const [tab, setTab] = useState<Tab>("messages");
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [unreadN, setUnreadN] = useState(0);
  const [unreadM, setUnreadM] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [dmFrozen, setDmFrozen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nRes, cRes] = await Promise.all([
        fetch("/api/notifications?limit=50", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/dm/conversations?limit=50", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      if (nRes.ok) {
        const j = await nRes.json();
        setNotifs(j.items || []);
        setUnreadN(j.unreadCount || 0);
      }

      if (cRes.status === 410) {
        setDmFrozen(true);
      } else if (cRes.ok) {
        const j = await cRes.json();
        const list: Conversation[] = Array.isArray(j.conversations)
          ? j.conversations
          : Array.isArray(j.items)
            ? j.items
            : [];
        setConvs(list);
        setUnreadM(
          list.reduce(
            (s, c) => s + (Number(c.unread_count) > 0 ? 1 : 0),
            0,
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAllNotifs = useCallback(async () => {
    setMarking(true);
    try {
      await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
      });
      const now = new Date().toISOString();
      setNotifs((rows) => rows.map((r) => ({ ...r, read_at: r.read_at || now })));
      setUnreadN(0);
    } finally {
      setMarking(false);
    }
  }, []);

  const markOne = useCallback(async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
      credentials: "include",
    });
    setNotifs((rows) =>
      rows.map((r) =>
        r.id === id ? { ...r, read_at: r.read_at || new Date().toISOString() } : r,
      ),
    );
    setUnreadN((u) => Math.max(0, u - 1));
  }, []);

  return (
    <div className="mx-auto max-w-lg px-4 py-5 pb-[max(96px,calc(80px+env(safe-area-inset-bottom)))]">
      <h1 className="mb-4 text-2xl font-black tracking-tight">Inbox</h1>

      <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#F3F4F6] dark:bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setTab("messages")}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 min-h-[44px] text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none ${
            tab === "messages"
              ? "bg-white dark:bg-[#0D0D0D] text-[#0D0D0D] dark:text-white shadow-sm"
              : "text-[#6E6E80]"
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          Mesaje
          {unreadM > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#7C3AED] px-1 text-[10px] font-semibold text-white">
              {unreadM > 99 ? "99+" : unreadM}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("notifications")}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 min-h-[44px] text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none ${
            tab === "notifications"
              ? "bg-white dark:bg-[#0D0D0D] text-[#0D0D0D] dark:text-white shadow-sm"
              : "text-[#6E6E80]"
          }`}
        >
          <Bell className="h-4 w-4" />
          
          {t("notificari")}
          {unreadN > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#7C3AED] px-1 text-[10px] font-semibold text-white">
              {unreadN > 99 ? "99+" : unreadN}
            </span>
          )}
        </button>
      </div>

      {tab === "messages" && (
        <MessagesTab
          convs={convs}
          loading={loading}
          dmFrozen={dmFrozen}
        />
      )}
      {tab === "notifications" && (
        <NotificationsTab
          notifs={notifs}
          loading={loading}
          unread={unreadN}
          marking={marking}
          markAll={markAllNotifs}
          markOne={markOne}
        />
      )}
    </div>
  );
}

function MessagesTab({
  convs,
  loading,
  dmFrozen,
}: {
  convs: Conversation[];
  loading: boolean;
  dmFrozen: boolean;
}) {
  const t = useTranslations("inbox");
  if (loading) {
    return <div className="py-20 text-center text-sm text-[#6E6E80]">{t("seIncarca")}</div>;
  }
  if (dmFrozen) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E5E5E5] bg-[#F9FAFB] px-6 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#0D0D0D]/10 text-[#0D0D0D]">
          <MessageCircle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-black">{t("mesajeleVorFiDisponibile")}</h2>
        <p className="mt-1 text-sm text-[#6E6E80]">{t("functionalitateaEsteTemporarDezactivata")}</p>
      </div>
    );
  }
  if (convs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E5E5E5] bg-[#F9FAFB] px-6 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#0D0D0D]/10 text-[#0D0D0D]">
          <MessageCircle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-black">{t("nicioConversatieInca")}</h2>
        <p className="mt-1 text-sm text-[#6E6E80]">{t("incepeOConversatieDe")}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[#F0F0F0] overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white shadow-sm">
      {convs.map((c) => {
        const isUnread = Number(c.unread_count) > 0;
        const name =
          c.peer?.display_name || c.peer?.username || "Conversație";
        return (
          <li key={c.id}>
            <Link
              href={`/messages/${c.id}`}
              className={`flex items-center gap-3 px-4 py-3 transition hover:bg-[#F9FAFB] ${
                isUnread ? "bg-[#0D0D0D]/5" : ""
              }`}
            >
              <span className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[#E5E5E5]">
                {c.peer?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.peer.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-bold">{name}</div>
                  <div className="text-[11px] text-[#A1A1AA]">
                    {timeAgo(c.last_message?.created_at || c.last_message_at)}
                  </div>
                </div>
                <div className="truncate text-xs text-[#6E6E80]">
                  {c.last_message?.body || "—"}
                </div>
              </div>
              {isUnread && (
                <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#7C3AED] px-1 text-[10px] font-semibold text-white">
                  {c.unread_count}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NotificationsTab({
  notifs,
  loading,
  unread,
  marking,
  markAll,
  markOne,
}: {
  notifs: Notification[];
  loading: boolean;
  unread: number;
  marking: boolean;
  markAll: () => void;
  markOne: (id: string) => void;
}) {
  const t = useTranslations("inbox");
  if (loading) {
    return <div className="py-20 text-center text-sm text-[#6E6E80]">{t("seIncarca2")}</div>;
  }
  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={markAll}
          disabled={marking || unread === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0D0D0D] px-4 py-2.5 min-h-[40px] text-xs font-bold text-white transition hover:bg-[#1a1a1a] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          
          {t("marcheazaToateCitite")}
        </button>
      </div>

      {notifs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E5E5E5] bg-[#F9FAFB] px-6 py-16 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#0D0D0D]/10 text-[#0D0D0D]">
            <Bell className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-black">{t("nicioNotificareInca")}</h2>
          <p className="mt-1 text-sm text-[#6E6E80]">
            
            {t("aiciVeiVedeaAprecieri")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#F0F0F0] overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white shadow-sm">
          {notifs.map((n) => {
            const unreadRow = !n.read_at;
            const url = n.action_url || "#";
            return (
              <li key={n.id}>
                <Link
                  href={url}
                  onClick={() => {
                    if (unreadRow) markOne(n.id);
                  }}
                  className={`flex gap-3 px-4 py-3 transition hover:bg-[#F9FAFB] ${
                    unreadRow ? "bg-[#0D0D0D]/5" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                      unreadRow ? "bg-[#7C3AED]" : "bg-transparent"
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
    </>
  );
}
