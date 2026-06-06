import Link from "next/link";
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <div className="max-w-3xl mx-auto px-4 py-10 pb-24 prose prose-neutral dark:prose-invert prose-headings:font-bold prose-h1:text-3xl prose-h2:text-xl prose-h2:mt-8">
        {children}
        <div className="mt-12 pt-6 border-t border-neutral-200 dark:border-neutral-800 text-sm flex gap-4 flex-wrap">
          <Link href="/terms" className="underline">Termeni</Link>
          <Link href="/privacy" className="underline">Confidentialitate</Link>
          <Link href="/legal/cookies" className="underline">Cookie-uri</Link>
          <Link href="/" className="underline">Inapoi acasa</Link>
        </div>
      </div>
    </div>
  );
}
