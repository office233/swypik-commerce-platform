export default function CheckoutLoading() {
  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="h-72 animate-pulse rounded-lg bg-white shadow-sm" />
          <div className="h-64 animate-pulse rounded-lg bg-white shadow-sm" />
        </div>
      </div>
    </main>
  );
}
