"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-dvh bg-white px-6 py-16 text-slate-950">
      <div className="mx-auto flex max-w-xl flex-col items-start gap-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-rose-600">Eroare</p>
        <div className="space-y-3">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Ceva nu a mers bine</h1>
          <p className="text-base leading-7 text-slate-600">
            Reincearca acum. Daca problema continua, echipa poate investiga din logs.
          </p>
        </div>
        <button
          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white"
          onClick={() => reset()}
          type="button"
        >
          Reincearca
        </button>
      </div>
    </main>
  );
}
