import Link from "next/link";

/**
 * Boundary 404 pentru segmentul [locale]. Fără el, notFound() apelat din
 * product/[id], v/[id], missions/[slug] etc. cădea pe global-error și
 * utilizatorul vedea un ecran alb (doar <html id="__next_error__">).
 */
export default function LocaleNotFound() {
  return (
    <main className="min-h-dvh bg-white px-6 py-16 text-slate-950">
      <div className="mx-auto flex max-w-xl flex-col items-start gap-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-600">404</p>
        <div className="space-y-3">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Pagina nu a fost gasita</h1>
          <p className="text-base leading-7 text-slate-600">
            Linkul poate fi expirat sau continutul a fost mutat.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white" href="/explore">
            Inapoi la feed
          </Link>
          <Link className="rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-slate-900" href="/search">
            Cauta produse
          </Link>
        </div>
      </div>
    </main>
  );
}
