import type Stripe from "stripe";
import { markStayBookingAuthorized } from "@/lib/stays/stripe-payment";

/**
 * `payment_intent.amount_capturable_updated` — hold autorizat pe card
 * (capture_method=manual). Folosit de Stays (cererea ajunge la gazdă) și
 * ignorat pentru celelalte tipuri (Go își sincronizează singur autorizarea).
 */
export async function handlePaymentIntentCapturable(event: Stripe.Event): Promise<void> {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (intent.metadata?.kind === "stay_booking" && intent.metadata?.stay_booking_id) {
        await markStayBookingAuthorized(intent.metadata.stay_booking_id);
    }
}
