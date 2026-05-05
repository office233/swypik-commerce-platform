import { Search } from "lucide-react";

export default function Home() {
  return (
    <main className="p-4">
      <h1 className="text-3xl font-bold mb-4">
        Spune-mi ce vrei, îți găsesc <span className="text-purple-500">cea mai bună ofertă</span>
      </h1>

      <div className="bg-zinc-900 p-4 rounded-2xl flex items-center gap-2">
        <Search />
        <input
          className="bg-transparent outline-none flex-1"
          placeholder="Ex: căști wireless sub 150 lei"
        />
      </div>

      <button className="mt-4 w-full bg-gradient-to-r from-purple-500 to-blue-500 p-4 rounded-2xl font-semibold">
        Caută cu AI
      </button>

      <div className="mt-6 grid grid-cols-2 gap-4">
        {[
          "Reduceri",
          "Tech",
          "Casă",
          "Beauty",
          "Fitness",
          "Auto"
        ].map((cat) => (
          <div key={cat} className="bg-zinc-900 p-4 rounded-xl text-center">
            {cat}
          </div>
        ))}
      </div>
    </main>
  );
}
