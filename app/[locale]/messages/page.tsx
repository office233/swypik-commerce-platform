import { notFound, redirect } from "next/navigation";
import { isEnabled } from "@/lib/feature-flags";
import { getOptionalSocialUserId } from "@/lib/social/session";
import MessengerClient from "./MessengerClient";

export const dynamic = "force-dynamic";

type SearchParams = { c?: string };

/**
 * Server wrapper: gates the whole messenger UI behind FEATURE_MESSENGER and
 * resolves the viewer before handing off to the client component. `?c=` lets
 * /messages/[id] and /messages/new deep-link into a specific conversation
 * without duplicating the chat UI.
 */
export default async function SwypikMessengerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!isEnabled("messenger")) notFound();

  const userId = await getOptionalSocialUserId();
  if (!userId) {
    redirect("/auth/login?next=/messages");
  }

  const sp = await searchParams;
  return <MessengerClient viewerId={userId} initialConversationId={sp?.c} />;
}
