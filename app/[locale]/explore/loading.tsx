export default function ExploreLoading() {
  return (
    <main className="fixed inset-0 grid place-items-center bg-black text-white">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-label="Se incarca" />
    </main>
  );
}
