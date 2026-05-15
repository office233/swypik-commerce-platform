import { notFound, redirect } from "next/navigation";
import { listMessages, assertParticipant } from "@/lib/dm/repository";
import { getOptionalSocialUserId } from "@/lib/social/session";
import ConversationView from "@/components/messages/ConversationView";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getOptionalSocialUserId();
  if (!userId) {
    redirect(`/auth/login?next=/messages/${id}`);
  }
  const ok = await assertParticipant(id, userId).catch(() => false);
  if (!ok) notFound();

  const messages = await listMessages(id, userId, { limit: 50 }).catch(() => []);

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl">
        <Link href="/inbox" aria-label="Înapoi" className="rounded-full p-1 hover:bg-white/10">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-base font-bold">Conversație</h1>
      </header>
      <div className="mx-auto max-w-md">
        <ConversationView
          conversationId={id}
          viewerId={userId}
          initialMessages={messages as any}
        />
      </div>
    </main>
  );
}
