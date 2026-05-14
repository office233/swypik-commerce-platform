"use client";

import Link from "next/link";

type Props = {
  active: "login" | "signup";
  nextPath: string;
};

export default function AuthTabs({ active, nextPath }: Props) {
  const next = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
  return (
    <div className="sticky top-0 z-30 -mx-5 mb-6 bg-[#0D0D0D]/95 backdrop-blur-md px-5 pt-3 pb-2 border-b border-white/5">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1">
        <Link
          href={`/auth/login${next}`}
          className={`grid h-12 place-items-center rounded-xl text-sm font-bold transition ${
            active === "login"
              ? "bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-lg"
              : "text-white/60 hover:text-white"
          }`}
          aria-current={active === "login" ? "page" : undefined}
        >
          Autentificare
        </Link>
        <Link
          href={`/auth/signup${next}`}
          className={`grid h-12 place-items-center rounded-xl text-sm font-bold transition ${
            active === "signup"
              ? "bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-lg"
              : "text-white/60 hover:text-white"
          }`}
          aria-current={active === "signup" ? "page" : undefined}
        >
          Înregistrare
        </Link>
      </div>
    </div>
  );
}
