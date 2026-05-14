"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export default function StripeConnectButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/seller/stripe-connect", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Eroare la conectare.");
    } catch (e: any) {
      setError(e?.message || "Eroare la conectare.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        variant="accent"
        size="md"
        loading={loading}
        onClick={handleClick}
        className="w-full sm:w-auto"
      >
        Conectează contul cu Stripe
      </Button>
      {error && (
        <p role="alert" className="text-xs font-medium text-[var(--swp-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
