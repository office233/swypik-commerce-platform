import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Autentificare – Swypik",
  description: "Intră în cont sau creează unul nou cu un cod trimis pe email.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-[#0D0D0D] text-white">{children}</div>;
}
