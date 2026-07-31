/**
 * Adaugă cheile i18n pentru verticala Swypik Pay în toate limbile.
 * Idempotent: sare peste cheile existente. Rulare: node scripts/add-pay-i18n.mjs
 */
import { readFileSync, writeFileSync } from "fs";

const T = {
  ro: { pay: "Moneda SWYP", openWallet: "Deschide", groupFinance: "Portofel & Monedă", hook: "Câștigă SWYP zilnic" },
  en: { pay: "SWYP Coin", openWallet: "Open", groupFinance: "Wallet & Coin", hook: "Earn SWYP daily" },
  de: { pay: "SWYP-Münze", openWallet: "Öffnen", groupFinance: "Wallet & Münze", hook: "Täglich SWYP verdienen" },
  es: { pay: "Moneda SWYP", openWallet: "Abrir", groupFinance: "Cartera y Moneda", hook: "Gana SWYP a diario" },
  fr: { pay: "Monnaie SWYP", openWallet: "Ouvrir", groupFinance: "Portefeuille & Monnaie", hook: "Gagnez du SWYP chaque jour" },
  it: { pay: "Moneta SWYP", openWallet: "Apri", groupFinance: "Portafoglio & Moneta", hook: "Guadagna SWYP ogni giorno" },
  pt: { pay: "Moeda SWYP", openWallet: "Abrir", groupFinance: "Carteira & Moeda", hook: "Ganhe SWYP diariamente" },
};

for (const [locale, t] of Object.entries(T)) {
  const file = `messages/${locale}.json`;
  const data = JSON.parse(readFileSync(file, "utf8"));

  data.verticals ??= {};
  data.verticals.actions ??= {};
  data.verticals.actions.openWallet ??= t.openWallet;
  data.verticals.pay ??= { label: t.pay };

  data.home ??= {};
  data.home.groups ??= {};
  data.home.groups.finance ??= t.groupFinance;
  data.home.hooks ??= {};
  data.home.hooks.pay ??= t.hook;

  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`OK ${file}`);
}
