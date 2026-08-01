"use client";

/**
 * OfferCard — un „post” din feed-ul social de pe home.
 * Stil Facebook: header brand, poză mare, preț + reducere, like/share.
 */
import { useState } from "react";
import Image from "next/image";
import { Heart, MessageCircle, Share2, ShoppingBag, Star } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useTranslations } from "next-intl";
import { haptic } from "@/lib/haptic";
import type { OfferPost } from "@/lib/types/feed";

type Props = {
    post: OfferPost;
    onOpen: (post: OfferPost) => void;
    priority?: boolean;
};

function formatCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
}

export default function OfferCard({ post, onOpen, priority = false }: Props) {
    const t = useTranslations("homeFeed");
    const [liked, setLiked] = useState(post.viewerLiked);
    const [likeCount, setLikeCount] = useState(post.likeCount);
    const [shareCount, setShareCount] = useState(post.shareCount);
    const [pop, setPop] = useState(false);

    async function toggleLike() {
        haptic("tap");
        const nextLiked = !liked;
        setLiked(nextLiked);
        setLikeCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
        if (nextLiked) { setPop(true); setTimeout(() => setPop(false), 350); }
        try {
            const res = await fetch(`/api/products/${post.id}/like`, { method: "POST", credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setLiked(Boolean(data.liked));
                setLikeCount(Number(data.likeCount) || 0);
            } else {
                setLiked(!nextLiked);
                setLikeCount((c) => Math.max(0, c + (nextLiked ? -1 : 1)));
            }
        } catch {
            setLiked(!nextLiked);
            setLikeCount((c) => Math.max(0, c + (nextLiked ? -1 : 1)));
        }
    }

    async function share() {
        haptic("tap");
        const url = `${window.location.origin}/?product=${post.id}`;
        let channel = "copy_link";
        try {
            if (navigator.share) {
                await navigator.share({ title: post.title, url });
                channel = "native_share";
            } else {
                await navigator.clipboard.writeText(url);
            }
        } catch {
            return; // user a anulat share sheet-ul
        }
        setShareCount((c) => c + 1);
        fetch(`/api/products/${post.id}/share`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel }),
        }).catch(() => { });
    }

    return (
        <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            {/* Header */}
            <header className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-pink-500 text-sm font-extrabold text-white">
                    {post.brand.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-[13px] font-bold text-[#0D0D0D]">
                        <span className="truncate">{post.brand}</span>
                        {post.sellerVerified && <VerifiedBadge size={14} className="shrink-0" />}
                    </p>
                    <p className="truncate text-[11px] text-[#6E6E80]">{post.category}</p>
                </div>
                {post.discountPercent > 0 && (
                    <span className="shrink-0 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-extrabold text-white">
                        -{post.discountPercent}%
                    </span>
                )}
            </header>

            {/* Poza mare */}
            <button
                type="button"
                onClick={() => onOpen(post)}
                className="relative block aspect-square w-full overflow-hidden bg-[#F3F3F5]"
                aria-label={post.title}
            >
                <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 600px"
                    className="object-cover transition duration-300 hover:scale-[1.02]"
                    priority={priority}
                    unoptimized
                />
            </button>

            {/* Corp */}
            <div className="px-4 pt-3">
                <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-[#0D0D0D]">{post.title}</p>
                <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-[18px] font-extrabold text-[#0D0D0D]">
                        {post.price.toFixed(2)} {post.currency}
                    </span>
                    {post.oldPrice > post.price && (
                        <span className="text-[13px] font-semibold text-[#6B6B74] line-through">
                            {post.oldPrice.toFixed(2)}
                        </span>
                    )}
                    {post.rating > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-[#6E6E80]">
                            <Star size={13} className="fill-amber-400 text-amber-400" /> {post.rating.toFixed(1)}
                        </span>
                    )}
                </div>
                {(likeCount > 0 || shareCount > 0) && (
                    <p className="mt-2 text-[11px] font-semibold text-[#A1A1AA]">
                        {likeCount > 0 && <><Heart size={12} className="inline" fill="currentColor" /> {formatCount(likeCount)}</>}
                        {likeCount > 0 && shareCount > 0 && " · "}
                        {shareCount > 0 && t("shares", { count: shareCount })}
                    </p>
                )}
            </div>

            {/* Actiuni */}
            <div className="mt-2 grid grid-cols-4 border-t border-[#F0F0F2] text-[12px] font-bold text-[#6E6E80]">
                <button
                    type="button"
                    onClick={toggleLike}
                    aria-pressed={liked}
                    className="flex items-center justify-center gap-1.5 py-2.5 transition hover:bg-[#F7F7F8] active:scale-95"
                >
                    <Heart
                        size={18}
                        className={`transition-transform ${pop ? "scale-125" : ""} ${liked ? "fill-red-500 text-red-500" : ""}`}
                    />
                    <span className={liked ? "text-red-500" : ""}>{t("like")}</span>
                </button>
                <button
                    type="button"
                    disabled
                    title={t("comingSoon")}
                    className="flex items-center justify-center gap-1.5 py-2.5 opacity-40"
                >
                    <MessageCircle size={18} /> {t("comment")}
                </button>
                <button
                    type="button"
                    onClick={share}
                    className="flex items-center justify-center gap-1.5 py-2.5 transition hover:bg-[#F7F7F8] active:scale-95"
                >
                    <Share2 size={18} /> {t("share")}
                </button>
                <button
                    type="button"
                    onClick={() => onOpen(post)}
                    className="flex items-center justify-center gap-1.5 py-2.5 font-extrabold text-violet-600 transition hover:bg-violet-50 active:scale-95"
                >
                    <ShoppingBag size={18} /> {t("view")}
                </button>
            </div>
        </article>
    );
}
