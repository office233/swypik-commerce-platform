import CheckoutForm from "@/components/CheckoutForm";

export const metadata = {
  title: "Checkout — Swypik",
};

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-white text-[#0D0D0D]">
      <CheckoutForm />
    </div>
  );
}
