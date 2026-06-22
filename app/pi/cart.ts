"use client";

// Minimal client-side cart for the Pi shell, persisted in localStorage.
// No server calls, no external data — just the user's local selection until
// they pay with Pi (the order is created server-side at payment completion).

import { useCallback, useEffect, useState } from "react";

export type PiCartItem = {
  id: string;
  title: string;
  image: string;
  amountPi: number;
  qty: number;
};

const KEY = "swypik_pi_cart";

function read(): PiCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(items: PiCartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("pi-cart-changed"));
  } catch {
    /* ignore */
  }
}

export function usePiCart() {
  const [items, setItems] = useState<PiCartItem[]>([]);

  useEffect(() => {
    setItems(read());
    const onChange = () => setItems(read());
    window.addEventListener("pi-cart-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("pi-cart-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const add = useCallback((item: Omit<PiCartItem, "qty">, qty = 1) => {
    const cur = read();
    const idx = cur.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      cur[idx].qty = Math.min(cur[idx].qty + qty, 10);
    } else {
      cur.push({ ...item, qty: Math.min(qty, 10) });
    }
    write(cur);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((i) => i.id !== id));
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    const cur = read();
    const idx = cur.findIndex((i) => i.id === id);
    if (idx >= 0) {
      if (qty <= 0) {
        write(cur.filter((i) => i.id !== id));
      } else {
        cur[idx].qty = Math.min(qty, 10);
        write(cur);
      }
    }
  }, []);

  const clear = useCallback(() => write([]), []);

  const totalPi = items.reduce((s, i) => s + i.amountPi * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);

  return { items, add, remove, setQty, clear, totalPi, count };
}

export function piCartAdd(item: Omit<PiCartItem, "qty">, qty = 1) {
  const cur = read();
  const idx = cur.findIndex((i) => i.id === item.id);
  if (idx >= 0) cur[idx].qty = Math.min(cur[idx].qty + qty, 10);
  else cur.push({ ...item, qty: Math.min(qty, 10) });
  write(cur);
}
