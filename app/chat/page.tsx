"use client";

import { useState } from "react";
import { searchProducts } from "@/lib/products";

export default function ChatPage() {
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<any[]>([]);

  function handleSearch() {
    const products = searchProducts(message);
    setResults(products);
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Chat AI</h1>

      <div className="mb-4">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Scrie ce produs cauti..."
          className="w-full p-3 border rounded-lg"
        />
        <button onClick={handleSearch} className="mt-2 w-full bg-black text-white p-3 rounded-lg">
          Cauta
        </button>
      </div>

      <div className="space-y-3">
        {results.map((p) => (
          <div key={p.id} className="p-3 border rounded-lg">
            <div className="font-bold">{p.title}</div>
            <div>{p.price} lei</div>
          </div>
        ))}
      </div>
    </div>
  );
}
