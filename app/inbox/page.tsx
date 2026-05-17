import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth/session";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await getAuthSession();
  if (!session) redirect("/auth?next=/inbox");
  return (
    <main className="min-h-screen bg-white text-[#0D0D0D] dark:bg-[#0D0D0D] dark:text-white">
      <InboxClient />
    </main>
  );
}
