"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import type { PiShopProduct } from "./types";

export default function PiFeedClient({ products }: { products: PiShopProduct[] }) {
  if (!products.length) {
    return (
      <p className="py-10 text-center text-sm text-white/50">
        No products available right now.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {products.map((p) => (
        <Link
          key={p.id}
          href={`/pi/p/${p.id}`}
          className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition active:scale-[0.98]"
        >
          <div className="aspect-square w-full overflow-hidden bg-white/5">
            {p.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.images[0]}
                alt={p.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : null}
          </div>
          <div className="p-3">
            <p className="line-clamp-2 text-xs text-white/80">{p.title}</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm font-black text-[#C9A2DC]">
                {p.amountPi == null ? "π —" : `π ${p.amountPi.toFixed(4)}`}
              </span>
              {p.rating != null && p.rating > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-white/50">
                  <Star className="h-3 w-3 fill-current" />
                  {p.rating.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
