export default function ProductCard() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-3 shadow-glow">
      <div className="h-32 bg-zinc-800 rounded-xl mb-2" />
      <div className="text-sm font-semibold">Căști Wireless Premium</div>
      <div className="text-xs text-gray-400">-34% reducere</div>
      <div className="flex justify-between items-center mt-2">
        <span className="font-bold text-purple-400">129 lei</span>
        <button className="text-xs bg-purple-600 px-2 py-1 rounded-lg">Vezi</button>
      </div>
    </div>
  );
}
