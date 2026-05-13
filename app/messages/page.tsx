import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { listConversations } from "@/lib/dm/repository";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString();
}

export default async function MessagesPage() {
  const userId = await getOptionalSocialUserId();
  if (!userId) redirect("/auth/login?next=/messages");

  const conversations = await listConversations(userId, { limit: 50 });

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white">
      <TopBar />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-semibold mb-6">Mesaje</h1>
        {conversations.length === 0 ? (
          <p className="text-gray-400">No conversations yet.</p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-lg border border-white/5">
            {conversations.map((c) => {
              const name =
                c.peer?.display_name ||
                c.peer?.username ||
                "Unknown";
              const preview = c.last_message?.body || "No messages yet";
              const unread = c.unread_count > 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/messages/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition"
                  >
                    <div className="h-10 w-10 rounded-full bg-[#10A37F]/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {c.peer?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.peer.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm text-[#10A37F]">
                          {name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium truncate">{name}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">
                          {fmtTime(c.last_message_at || c.created_at)}
                        </span>
                      </div>
                      <p
                        className={`text-sm truncate ${unread ? "text-white" : "text-gray-400"}`}
                      >
                        {preview}
                      </p>
                    </div>
                    {unread && (
                      <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[#10A37F] text-xs font-semibold">
                        {c.unread_count}
                      </span>
                    )}
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
