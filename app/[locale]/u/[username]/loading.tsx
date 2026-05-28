export default function UserProfileLoading() {
  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white">
      <header className="border-b border-white/10 bg-[#0D0D0D]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="h-5 w-20 rounded bg-white/10" />
          <div className="h-9 w-24 rounded-xl bg-white/10" />
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <div className="h-32 w-32 animate-pulse rounded-full bg-white/10" />
          <div className="mt-6 h-8 w-56 animate-pulse rounded bg-white/10" />
          <div className="mt-3 h-4 w-28 animate-pulse rounded bg-white/10" />
          <div className="mt-6 h-4 w-full max-w-md animate-pulse rounded bg-white/10" />
          <div className="mt-8 grid w-full max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-16 animate-pulse rounded-2xl bg-white/10" />
            ))}
          </div>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
            <div key={item} className="aspect-[9/16] animate-pulse rounded-2xl bg-white/10" />
          ))}
        </div>
      </section>
    </main>
  );
}
