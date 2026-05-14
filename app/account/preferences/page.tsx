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
    </main>
  );
}
