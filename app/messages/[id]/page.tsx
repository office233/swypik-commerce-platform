import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function ConversationPage() {
  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white">
      <TopBar />
      <div className="mx-auto max-w-md px-4 py-24 flex items-center justify-center">
        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center shadow-lg">
          <h1 className="text-2xl font-semibold mb-3">
            Mesajele vor fi disponibile curand
          </h1>
          <p className="text-sm text-gray-400">
            Functionalitatea este temporar dezactivata pentru MVP.
          </p>
        </div>
      </div>
    </main>
  );
}
