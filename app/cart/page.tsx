"use client";

import { useState } from "react";

export default function CartPage() {
  const [items] = useState([
    { title: "Casti Wireless", price: 129 }
  ]);

  const total = items.reduce((sum, i) => sum + i.price, 0);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Cos</h1>

      {items.map((item, i) => (
        <div key={i} className="flex justify-between mb-2">
          <span>{item.title}</span>
          <span>{item.price} lei</span>
        </div>
      ))}

      <div className="mt-4 font-bold">Total: {total} lei</div>

      <button className="mt-4 w-full bg-black text-white p-4 rounded-lg">
        Finalizeaza comanda
      </button>
    </div>
  );
}
