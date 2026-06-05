"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Link } from "@/lib/i18n/navigation";
import { ShoppingCart, Star, Truck } from "lucide-react";
import type { Product } from "@/types/product";
import { THEME } from "@/lib/ui/theme";

type Variant = "compact" | "featured" | "comparison";

type Props = {
  productId: number | string;
  variant?: Variant;
  /** Optional: pre-loaded product to skip the fetch (used by server components). */
  initialProduct?: Product | null;
  /** Optional: badge text override (e.g. "CÂȘTIGĂTOR #1"). */
  badge?: string;
  /** Optional callback for cart add — defaults to /api/cart POST. */
  onAddToCart?: (product: Product) => void;
};

/**
 * InlineProductCard — embedded inside article body via MDX:
 *   <InlineProductCard productId={62} variant="featured" badge="CÂȘTIGĂTOR #1" />
 *
 * Three visual variants:
 *   - compact:    horizontal mini card with thumbnail + price + button
 *   - featured:   big purple-bordered card (article winner / recommendation)
 *   - comparison: half-width card (used in 2-up comparison blocks)
 *
 * Fetches /api/products/[id] on mount unless initialProduct provided.
 */
export default function InlineProductCard({
  productId,
  variant = "compact",
  initialProduct = null,
  badge,
  onAddToCart,
}: Props) {
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (initialProduct) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/products/${productId}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) setProduct(data.product || data);
      } catch (err) {
        console.warn("[InlineProductCard] fetch failed", productId, err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId, initialProduct]);

  const handleAddToCart = async () => {
    if (!product) return;
    if (onAddToCart) { onAddToCart(product); return; }

    setAdding(true);
    try {
      await fetch("/api/cart", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.pgId || product.id,
          quantity: 1,
          source: "blog_inline_card",
        }),
      });
    } catch (err) {
      console.warn("[InlineProductCard] cart add failed", err);
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return <InlineProductSkeleton variant={variant} />;
  }
  if (!product) {
    return null; // silently hide broken refs rather than breaking article render
  }

  const price = Number(product.price) || 0;
  const oldPrice = Number((product as any).oldPrice) || 0;
  const discount = oldPrice > price && price > 0
    ? Math.round(((oldPrice - price) / oldPrice) * 100)
    : 0;
  const image = (product.images?.[0] as string) || (product as any).imageUrl;
  const rating = Number((product as any).rating) || 0;
  const reviewCount = Number((product as any).reviewCount) || 0;
  const slug = (product as any).slug || product.id;
  const href = `/product/${slug}` as any;

  // ===== FEATURED variant (full-width, big purple border) =====
  if (variant === "featured") {
    return (
      <div className="not-prose my-8 rounded-2xl border-2 p-2 shadow-lg"
        style={{
          background: "linear-gradient(135deg, rgba(124,58,237,.06), rgba(236,72,153,.06))",
          borderColor: "rgba(124,58,237,.2)",
          boxShadow: "0 10px 40px -10px rgba(124,58,237,.35)",
        }}
      >
        <div className="rounded-xl bg-white p-5 sm:p-6 grid sm:grid-cols-[160px_1fr_auto] gap-5 items-center">
          <Link href={href} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100">
            {image ? (
              <Image src={image} alt={product.title} fill sizes="160px" className="object-cover" />
            ) : null}
            {badge ? (
              <span
                className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-white text-[10px] font-bold"
                style={{ background: "linear-gradient(135deg,#7C3AED,#EC4899)" }}
              >
                {badge}
              </span>
            ) : null}
          </Link>

          <div>
            {badge ? (
              <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#7C3AED" }}>
                🏆 Recomandarea noastră
              </div>
            ) : null}
            <Link href={href}>
              <h3 className="text-xl font-bold leading-tight text-[#0D0D0D] hover:underline">
                {product.title}
              </h3>
            </Link>
            {(rating > 0 || reviewCount > 0) ? (
              <div className="mt-2 flex items-center gap-3 text-sm">
                {rating > 0 ? (
                  <span className="font-bold flex items-center gap-1" style={{ color: "#F59E0B" }}>
                    <Star size={14} fill="currentColor" /> {rating.toFixed(1)}
                  </span>
                ) : null}
                {reviewCount > 0 ? (
                  <span className="text-zinc-500">({reviewCount} review)</span>
                ) : null}
                <span className="font-semibold text-emerald-600">✓ Stoc</span>
              </div>
            ) : null}
            <div className="mt-3 flex items-baseline gap-2">
              <span
                className="text-3xl font-extrabold"
                style={{
                  background: "linear-gradient(135deg,#7C3AED,#EC4899)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {price} lei
              </span>
              {oldPrice > price ? (
                <span className="text-sm text-zinc-400 line-through">{oldPrice} lei</span>
              ) : null}
              {discount > 0 ? (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                  -{discount}%
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-xs text-zinc-500 flex items-center gap-3">
              <Truck size={12} /> Livrare 2-4 zile
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Link
              href={href}
              className="px-5 h-12 rounded-xl text-white font-semibold whitespace-nowrap grid place-items-center transition active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg,#7C3AED,#EC4899)",
                boxShadow: "0 8px 24px -8px rgba(124,58,237,.5)",
              }}
            >
              Vezi produsul →
            </Link>
            <button
              onClick={handleAddToCart}
              disabled={adding}
              className="px-5 h-10 rounded-xl border border-zinc-200 text-sm font-medium hover:border-violet-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <ShoppingCart size={14} /> {adding ? "Adăugat..." : "Adaugă în coș"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== COMPARISON variant (half-width, used inside 2-col grids) =====
  if (variant === "comparison") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <Link href={href} className="block relative aspect-square rounded-lg overflow-hidden bg-zinc-100 mb-3">
          {image ? <Image src={image} alt={product.title} fill sizes="200px" className="object-cover" /> : null}
          {badge ? (
            <span
              className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-white text-[10px] font-bold"
              style={{ background: "linear-gradient(135deg,#7C3AED,#EC4899)" }}
            >
              {badge}
            </span>
          ) : null}
        </Link>
        <Link href={href}>
          <h4 className="font-bold text-sm leading-tight text-[#0D0D0D] hover:underline">
            {product.title}
          </h4>
        </Link>
        {rating > 0 ? (
          <div className="mt-1 text-xs flex items-center gap-1" style={{ color: "#F59E0B" }}>
            <Star size={12} fill="currentColor" /> {rating.toFixed(1)} {reviewCount > 0 ? `(${reviewCount})` : ""}
          </div>
        ) : null}
        <div
          className="mt-2 text-2xl font-extrabold"
          style={{
            background: "linear-gradient(135deg,#7C3AED,#EC4899)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {price} lei
        </div>
        <button
          onClick={handleAddToCart}
          disabled={adding}
          className="mt-3 w-full h-10 rounded-lg text-white text-sm font-semibold transition active:scale-[0.97] disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#7C3AED,#EC4899)" }}
        >
          {adding ? "Adăugat..." : "Adaugă în coș"}
        </button>
      </div>
    );
  }

  // ===== COMPACT variant (default — small horizontal card) =====
  return (
    <div className="not-prose my-6 rounded-2xl border border-zinc-200 bg-white p-4 grid grid-cols-[80px_1fr_auto] gap-4 items-center hover:border-violet-500 transition">
      <Link href={href} className="relative w-20 h-20 rounded-lg overflow-hidden bg-zinc-100">
        {image ? <Image src={image} alt={product.title} fill sizes="80px" className="object-cover" /> : null}
      </Link>
      <div className="min-w-0">
        <Link href={href}>
          <h4 className="font-semibold text-sm sm:text-base leading-tight text-[#0D0D0D] line-clamp-2 hover:underline">
            {product.title}
          </h4>
        </Link>
        {(rating > 0 || reviewCount > 0) ? (
          <div className="mt-1 flex items-center gap-2 text-xs">
            {rating > 0 ? (
              <span className="font-bold flex items-center gap-1" style={{ color: "#F59E0B" }}>
                <Star size={11} fill="currentColor" /> {rating.toFixed(1)}
              </span>
            ) : null}
            {reviewCount > 0 ? (
              <span className="text-zinc-500">({reviewCount}+)</span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className="text-lg font-bold"
            style={{
              background: "linear-gradient(135deg,#7C3AED,#EC4899)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {price} lei
          </span>
          {oldPrice > price ? (
            <span className="text-xs text-zinc-400 line-through">{oldPrice} lei</span>
          ) : null}
        </div>
      </div>
      <Link
        href={href}
        className="px-4 h-10 rounded-lg text-white text-sm font-semibold whitespace-nowrap grid place-items-center transition active:scale-[0.97]"
        style={{ background: "linear-gradient(135deg,#7C3AED,#EC4899)" }}
      >
        Vezi →
      </Link>
    </div>
  );
}

// ================================================================
// Skeleton placeholder while product loads
// ================================================================
function InlineProductSkeleton({ variant }: { variant: Variant }) {
  if (variant === "featured") {
    return (
      <div className="my-8 rounded-2xl border-2 p-2" style={{ borderColor: "rgba(124,58,237,.2)" }}>
        <div className="rounded-xl bg-white p-6 grid sm:grid-cols-[160px_1fr_auto] gap-5 animate-pulse">
          <div className="aspect-square rounded-xl bg-zinc-100" />
          <div className="space-y-3">
            <div className="h-3 bg-zinc-100 rounded w-1/3" />
            <div className="h-5 bg-zinc-100 rounded w-3/4" />
            <div className="h-4 bg-zinc-100 rounded w-1/2" />
          </div>
          <div className="space-y-2">
            <div className="h-12 w-32 bg-zinc-100 rounded-xl" />
            <div className="h-10 w-32 bg-zinc-100 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="my-6 rounded-2xl border border-zinc-200 bg-white p-4 grid grid-cols-[80px_1fr_auto] gap-4 items-center animate-pulse">
      <div className="w-20 h-20 rounded-lg bg-zinc-100" />
      <div className="space-y-2">
        <div className="h-4 bg-zinc-100 rounded w-3/4" />
        <div className="h-3 bg-zinc-100 rounded w-1/3" />
        <div className="h-4 bg-zinc-100 rounded w-1/4" />
      </div>
      <div className="w-20 h-10 bg-zinc-100 rounded-lg" />
    </div>
  );
}
