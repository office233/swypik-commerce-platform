import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import { CurrencySwitcher } from "@/components/i18n/CurrencyProvider";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  // Doar pentru a se asigura că rulează server-side cu acces la cookies / locale.
  await cookies();
  const tCommon = await getTranslations("common");
  const tSettings = await getTranslations("settings");

  return (
    <main className="mx-auto max-w-lg p-4 text-white">
      <h1 className="text-xl font-semibold mb-6">{tSettings("preferences")}</h1>

      <section className="space-y-5">
        <div>
          <label className="block text-sm text-white/70 mb-1">
            {tSettings("selectLanguage")}
          </label>
          <LocaleSwitcher className="w-full rounded-lg bg-white/10 px-3 py-2 text-white" />
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-1">
            {tSettings("selectCurrency")}
          </label>
          <CurrencySwitcher className="w-full rounded-lg bg-white/10 px-3 py-2 text-white" />
        </div>

        <p className="text-xs text-white/40">
          {tCommon("language")} / {tCommon("currency")}
        </p>
      </section>

      {/* Swypik 18+ runs on a separate site/app (18.swypik.com).
          The activation card lives there; from here we just link out. */}
      <section className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold mb-1">Swypik 18+</h2>
        <p className="text-xs text-white/60 mb-3">
          {tSettings("adultInfo")}
        </p>
        <a
          href="https://18.swypik.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
        >
          {tSettings("adultGo")} →
        </a>
      </section>
    </main>
  );
}
