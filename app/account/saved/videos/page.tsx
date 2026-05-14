import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import SavedVideosTab from "../../SavedVideosTab";

export const dynamic = "force-dynamic";

export default async function SavedVideosPage() {
  const user = await getAuthUser();
  if (!user.userId) redirect("/account?redirect=/account/saved/videos");

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/account" aria-label="Înapoi" className="p-1 -ml-1 hover:bg-white/10 rounded">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-base font-semibold">Clipuri salvate</h1>
        </div>
      </header>
      <SavedVideosTab limit={30} enableInfiniteScroll />
    </main>
  );
}
