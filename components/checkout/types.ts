/** Tipuri partajate pentru checkout. Extras din CheckoutForm.tsx (Faza C). */

export type CartItem = {
    product: {
        id?: string;
        pgId?: string;
        productId?: string;
        title: string;
        price: number;
        image?: string;
        images?: string[];
        color?: string;
        selectedColor?: string;
        selectedSize?: string;
        skuId?: string;
        videoId?: string;
    };
    qty: number;
};
