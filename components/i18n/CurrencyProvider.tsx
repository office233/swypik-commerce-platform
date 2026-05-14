"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { CURRENCIES, type Currency } from "@/lib/i18n/config";

const CurrencyContext = createContext<{
  currency: Currency;
  setCurrency: (c: Currency) => void;
}>({ currency: "RON", setCurrency: () => {} });

export function useCurrency() {
  return useContext(CurrencyContext);
}

export function CurrencyProvider({
  initial,
  children,
}: {
  initial: Currency;
  children: React.ReactNode;
}) {
  const [currency, setCurrencyState] = useState<Currency>(initial);
  const [, startTransition] = useTransition();

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    startTransition(async () => {
      await fetch("/api/i18n/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: c }),
      });
    });
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function CurrencySwitcher({ className }: { className?: string }) {
  const { currency, setCurrency } = useCurrency();
  return (
    <select
      aria-label="Currency"
      value={currency}
      onChange={(e) => setCurrency(e.target.value as Currency)}
      className={className}
    >
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
