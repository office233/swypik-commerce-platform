export default function ExploreLoading() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white">
      <div className="relative h-full w-full">
        {/* Video placeholder shimmer */}
        <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-[#141414] via-[#1c1c1c] to-[#0a0a0a]" />

        {/* Top score chip */}
        <div className="absolute left-4 top-4 h-8 w-20 animate-pulse rounded-full bg-white/10" />

        {/* Right action rail */}
        <div className="absolute bottom-32 right-3 flex flex-col items-center gap-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="h-11 w-11 animate-pulse rounded-full bg-white/15" />
              <div className="h-2.5 w-7 animate-pulse rounded bg-white/10" />
            </div>
          ))}
        </div>

        {/* Bottom product card */}
        <div className="absolute bottom-24 left-4 right-20 space-y-2.5">
          <div className="h-3.5 w-1/3 animate-pulse rounded bg-white/15" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
          <div className="mt-3 flex items-center gap-2">
            <div className="h-9 w-28 animate-pulse rounded-xl bg-white/20" />
            <div className="h-9 w-9 animate-pulse rounded-xl bg-white/15" />
          </div>
        </div>

        {/* Centered subtle spinner so user sees progress */}
        <div className="absolute inset-0 grid place-items-center">
          <div
            className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/80"
            aria-label="Se încarcă"
            role="status"
          />
        </div>
      </div>
    </main>
  );
}
