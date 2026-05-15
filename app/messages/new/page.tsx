import { redirect } from "next/navigation";
import { getOrCreateSocialUser } from "@/lib/social/session";
import { getOrCreateDmConversation } from "@/lib/dm/repository";
import { isEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = { user?: string };

export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!isEnabled("dm")) {
    redirect("/inbox");
  }

  const peerId = (searchParams?.user || "").trim();
  if (!peerId) {
    redirect("/inbox");
  }

  const session = await getOrCreateSocialUser();
  if (!session.userId) {
    redirect(`/auth?next=${encodeURIComponent(`/messages/new?user=${peerId}`)}`);
  }

  if (peerId === session.userId) {
    redirect("/inbox");
  }

  try {
    const { conversationId } = await getOrCreateDmConversation(
      session.userId,
      peerId,
    );
    redirect(`/messages/${conversationId}`);
  } catch (err) {
    redirect("/inbox");
  }
}
