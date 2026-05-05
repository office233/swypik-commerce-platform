import ProductCard from "../components/ProductCard";
import ChatBox from "../components/ChatBox";
import { Search } from "lucide-react";

export default function Home() {
  return (
    <main className="p-4">
      <h1 className="text-3xl font-bold mb-4">
        Spune-mi ce vrei, îți găsesc <span className="text-purple-500">cea mai bună ofertă</span>
      </h1>

      <div className="bg-zinc-900 p-4 rounded-2xl flex items-center gap-2">
        <Search />
        <input className="bg-transparent outline-none flex-1" placeholder="Ex: căști wireless" />
      </div>

      <button className="mt-4 w-full bg-gradient-to-r from-purple-500 to-blue-500 p-4 rounded-2xl font-semibold">
        Caută cu AI
      </button>

      <ChatBox />

      <h2 className="mt-6 mb-2 font-semibold">🔥 Reduceri azi</h2>
      <div className="grid grid-cols-2 gap-3">
        <ProductCard />
        <ProductCard />
        <ProductCard />
        <ProductCard />
      </div>
    </main>
  );
}
