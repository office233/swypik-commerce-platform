"use client";

/**
 * OffersFeed — feed-ul social de pe home: doar poze + oferte.
 * Scroll infinit cu IntersectionObserver, filtre în state local.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import OfferCard from "./OfferCard";
import FeedFilterBar, { type FeedFilters } from "./FeedFilterBar";
import type { OfferPost, OffersFeedResponse } from "@/lib/types/feed";

type Props = {
    initialItems?: OfferPost[];
    category?: string | null;
    onOpenProduct: (post: OfferPost) => void;
};

const PAGE_SIZE = 12;

function buildQuery(filters: FeedFilters, category: string | null | undefined, offset: number): string {
    const sp = new URLSearchParams();
    sp.set("limit", String(PAGE_SIZE));
    sp.set("offset", String(offset));
    sp.set("sort", filters.sort);
    if (filters.minPrice != null) sp.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice != null) sp.set("maxPrice", String(filters.maxPrice));
    if (filters.minDiscount) sp.set("minDiscount", String(filters.minDiscount));
    if (filters.minRating) sp.set("minRating", String(filters.minRating));
    if (category) sp.set("category", category);
    return sp.toString();
}

function SkeletonCard() {
    return (
        <div className="animate-pulse overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="flex items-center gap-3 px-4 py-3">
                <div className="h-9 w-9 rounded-full bg-[#EDEDEF]" />
                <div className="h-3 w-32 rounded bg-[#EDEDEF]" />
            </div>
            <div className="aspect-square w-full bg-[#EDEDEF]" />
            <div className="space-y-2 p-4">
                <div className="h-3 w-3/4 rounded bg-[#EDEDEF]" />
                <div className="h-3 w-1/3 rounded bg-[#EDEDEF]" />
            </div>
        </div>
    );
}

export default function OffersFeed({ initialItems = [], category, onOpenProduct }: Props) {
    const t = useTranslations("homeFeed");
    const [filters, setFilters] = useState<FeedFilters>({ sort: "popular" });
    const [items, setItems] = useState<OfferPost[]>(initialItems);
    const [offset, setOffset] = useState(initialItems.length ? PAGE_SIZE * 3 : 0);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const loadingRef = useRef(false);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const isDefault = filters.sort === "popular" && !filters.minPrice && !filters.maxPrice && !filters.minDiscount && !filters.minRating && !category;
    const skipInitialFetch = useRef(isDefault && initialItems.length > 0);

    const load = useCallback(async (reset: boolean, f: FeedFilters, cat: string | null | undefined, off: number) => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        setError(false);
        try {
            const res = await fetch(`/api/feed/offers?${buildQuery(f, cat, off)}`, { credentials: "include" });
            if (!res.ok) throw new Error("feed_failed");
            const data: OffersFeedResponse = await res.json();
            setItems((prev) => {
                if (reset) return data.items;
                const seen = new Set(prev.map((p) => p.id));
                return [...prev, ...data.items.filter((p) => !seen.has(p.id))];
            });
            setOffset(data.nextOffset);
            setHasMore(data.hasMore && data.items.length > 0);
        } catch {
            setError(true);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, []);

    // Reîncarcă la schimbarea filtrelor/categoriei
    useEffect(() => {
        if (skipInitialFetch.current) { skipInitialFetch.current = false; return; }
        setItems([]);
        setHasMore(true);
        load(true, filters, category, 0);
    }, [filters, category, load]);

    // Scroll infinit
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
                    load(false, filters, category, offset);
                }
            },
            { rootMargin: "600px" }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [filters, category, offset, hasMore, load]);

    return (
        <div>
            <FeedFilterBar filters={filters} onChange={setFilters} />
            <div className="mt-2 space-y-4">
                {items.map((post, i) => (
                    <OfferCard key={post.id} post={post} onOpen={onOpenProduct} priority={i === 0} />
                ))}
                {loading && (
                    <>
                        <SkeletonCard />
                        <SkeletonCard />
                    </>
                )}
                {!loading && error && (
                    <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
                        <p className="text-[14px] font-semibold text-[#6E6E80]">{t("error")}</p>
                        <button
                            type="button"
                            onClick={() => load(items.length === 0, filters, category, offset)}
                            className="mt-3 rounded-full bg-[#0D0D0D] px-5 py-2 text-[13px] font-bold text-white"
                        >
                            {t("retry")}
                        </button>
                    </div>
                )}
                {!loading && !error && items.length === 0 && (
                    <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
                        <p className="text-3xl"><ShoppingBag size={30} className="inline" /></p>
                        <p className="mt-2 text-[14px] font-semibold text-[#6E6E80]">{t("empty")}</p>
                    </div>
                )}
                <div ref={sentinelRef} className="h-1" aria-hidden />
            </div>
        </div>
    );
}
