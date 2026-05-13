import Link from "next/link";
import { UserRound } from "lucide-react";

export default function UserProfileNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0D0D0D] px-4 text-white">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-white/55">
          <UserRound size={32} strokeWidth={1.5} />
        </div>
        <h1 className="mt-5 text-2xl font-black">Profil negasit</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">
          Utilizatorul nu exista sau profilul nu este disponibil public.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/explore" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#0D0D0D]">
            Exploreaza feed-ul
          </Link>
          <Link href="/" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-black text-white">
            Acasa
          </Link>
        </div>
      </div>
    </main>
  );
}
