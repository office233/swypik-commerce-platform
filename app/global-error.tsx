"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("[Global Error Boundary]:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen bg-[#F7F7F8] flex flex-col items-center justify-center p-6 font-sans">
          <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-lg border border-[#E5E5E5] text-center">
            <div className="w-20 h-20 mx-auto bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            
            <h1 className="text-2xl font-black text-[#0D0D0D] mb-4">
              Oops! Ceva a mers prost.
            </h1>
            
            <p className="text-[#6E6E80] mb-8 leading-relaxed">
              Ne cerem scuze, am întâmpinat o problemă tehnică neașteptată. Echipa noastră a fost notificată (Cod eroare: {error.digest || 'NECUNOSCUT'}).
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => reset()}
                className="w-full py-4 rounded-xl bg-[#0D0D0D] text-white font-bold text-sm hover:bg-[#202020] transition-colors"
              >
                Încearcă din nou
              </button>
              
              <Link
                href="/"
                className="w-full py-4 rounded-xl bg-[#F7F7F8] text-[#0D0D0D] font-bold text-sm hover:bg-[#EFEFEF] transition-colors"
              >
                Întoarce-te la Pagina Principală
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
