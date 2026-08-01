"use client";

/** Imaginea unui produs din coș, cu fallback Package. Extras din CheckoutForm.tsx (Faza C). */
import Image from "next/image";
import type { CartItem } from "./types";

export default function CheckoutProductImage({
    item,
    fallbackAlt,
    width,
    height,
    className,
    placeholderClassName,
}: {
    item: CartItem;
    fallbackAlt: string;
    width: number;
    height: number;
    className: string;
    placeholderClassName: string;
}) {
    const imageSrc = item.product.images?.[0] || item.product.image;
    if (!imageSrc) {
        return <div className={`w-full h-full flex items-center justify-center ${placeholderClassName}`}>📦</div>;
    }

    return (
        <Image
            src={imageSrc}
            alt={item.product.title || fallbackAlt}
            width={width}
            height={height}
            sizes={`${width}px`}
            className={className}
            unoptimized={/\.gif($|\?)/i.test(imageSrc)}
        />
    );
}
