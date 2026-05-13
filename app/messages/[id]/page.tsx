import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { assertParticipant, listMessages } from "@/lib/dm/repository";
import { dbQuery } from "@/lib/db";
import ConversationView from "@/components/messages/ConversationView";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await getOptionalSocialUserId();
  const { id } = await params;
  if (!userId) redirect(`/auth/login?next=/messages/${id}`);

  const ok = await assertParticipant(id, userId);
  if (!ok) notFound();

  const { rows } = await dbQuery<{
    user_id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  }>(
    `SELECT u.id AS user_id, u.username, u.display_name, cpr.avatar_url
       FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id
       LEFT JOIN creator_profiles cpr ON cpr.user_id = u.id
      WHERE cp.conversation_id = $1 AND cp.user_id <> $2
      LIMIT 1`,
    [id, userId],
  );
  const peer = rows[0] || null;
  const peerName = peer?.display_name || peer?.username || "Conversation";

  const initialMessages = await listMessages(id, userId, { limit: 50 });

  return (
    <main className="min-h-screen flex flex-col bg-[#0D0D0D] text-white">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/5 sticky top-0 bg-[#0D0D0D]/95 backdrop-blur z-10">
        <Link
          href="/messages"
          className="text-gray-400 hover:text-white text-sm"
          aria-label="Back"
        >
          &larr;
        </Link>
        <div className="h-9 w-9 rounded-full bg-[#10A37F]/20 flex items-center justify-center overflow-hidden">
          {peer?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={peer.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm text-[#10A37F]">
              {peerName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="font-medium">{peerName}</span>
          {peer?.username && (
            <span className="text-xs text-gray-500">@{peer.username}</span>
          )}
        </div>
      </header>

      <ConversationView
        conversationId={id}
        viewerId={userId}
        initialMessages={initialMessages}
      />
    </main>
  );
}
