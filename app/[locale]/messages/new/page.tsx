import { redirect } from "next/navigation";
import { getAccountUserId } from "@/lib/social/session";
import { getOrCreateDmConversation } from "@/lib/dm/repository";
import { isEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = { user?: string };

export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!isEnabled("dm") && !isEnabled("messenger")) {
    redirect("/inbox");
  }

  const sp = await searchParams;
  const peerId = (sp?.user || "").trim();
  if (!peerId) {
    redirect("/inbox");
  }

  // Cont real obligatoriu (fără shell anonim creat la randare).
  const userId = await getAccountUserId();
  if (!userId) {
    redirect(`/auth?next=${encodeURIComponent(`/messages/new?user=${peerId}`)}`);
  }

  if (peerId === userId) {
    redirect("/inbox");
  }

  try {
    const { conversationId } = await getOrCreateDmConversation(
      userId,
      peerId,
    );
    // Single messenger surface: [id] redirects into /messages with the
    // conversation preselected instead of duplicating the chat UI.
    redirect(isEnabled("messenger") ? `/messages?c=${conversationId}` : `/messages/${conversationId}`);
  } catch (err) {
    redirect("/inbox");
  }
}
