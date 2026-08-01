import { dbQuery } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { MapPin, Zap, CheckCircle2, Ban } from "lucide-react";
import PricingActions from "./PricingActions";

export const dynamic = "force-dynamic";

type Zone = {
  id: string;
  city: string;
  country: string;
  kind: string;
  vehicle_class: string;
  base_cents: number;
  per_km_cents: number;
  per_min_cents: number;
  min_fare_cents: number;
  booking_fee_cents: number;
  platform_commission_pct: string;
  courier_share_pct: string;
  currency: string;
  active: boolean;
};

type Surge = {
  id: string;
  zone_id: string;
  multiplier: string;
  starts_at: string;
  ends_at: string | null;
  auto: boolean;
  city: string;
  kind: string;
  vehicle_class: string;
};

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export default async function AdminPricingPage() {
    const t = await getTranslations("adminPricing");
  const [{ rows: zones }, { rows: surges }] = await Promise.all([
    dbQuery<Zone>(
      `SELECT * FROM pricing_zones ORDER BY country, lower(city), kind, vehicle_class`,
    ),
    dbQuery<Surge>(
      `SELECT sr.*, pz.city, pz.kind, pz.vehicle_class
         FROM surge_rules sr JOIN pricing_zones pz ON pz.id = sr.zone_id
        WHERE sr.ends_at IS NULL OR sr.ends_at > now()
        ORDER BY sr.starts_at DESC LIMIT 50`,
    ),
  ]);

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center gap-2">
        <MapPin className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Pricing — zone & surge</h1>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">Zone tarifare ({zones.length})</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-left dark:bg-neutral-800">
              <tr>
                <th className="p-2">{t("thCity")}</th>
                <th className="p-2">Tip</th>
                <th className="p-2">{t("thClass")}</th>
                <th className="p-2">{t("thBase")}</th>
                <th className="p-2">/km</th>
                <th className="p-2">/min</th>
                <th className="p-2">Min</th>
                <th className="p-2">Booking</th>
                <th className="p-2">Comision</th>
                <th className="p-2">Curier %</th>
                <th className="p-2">Activ</th>
                <th className="p-2">{t("thActions")}</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zn) => (
                <tr key={zn.id} className="border-t">
                  <td className="p-2">
                    {zn.city} <span className="text-neutral-400">{zn.country}</span>
                  </td>
                  <td className="p-2">{zn.kind}</td>
                  <td className="p-2">{zn.vehicle_class}</td>
                  <td className="p-2">{money(zn.base_cents, zn.currency)}</td>
                  <td className="p-2">{money(zn.per_km_cents, zn.currency)}</td>
                  <td className="p-2">{money(zn.per_min_cents, zn.currency)}</td>
                  <td className="p-2">{money(zn.min_fare_cents, zn.currency)}</td>
                  <td className="p-2">{money(zn.booking_fee_cents, zn.currency)}</td>
                  <td className="p-2">{Number(zn.platform_commission_pct).toFixed(0)}%</td>
                  <td className="p-2">{Number(zn.courier_share_pct).toFixed(0)}%</td>
                  <td className="p-2">{zn.active ? <CheckCircle2 size={16} className="text-green-600" /> : <Ban size={16} className="text-red-600" />}</td>
                  <td className="p-2">
                    <PricingActions zone={{ id: zn.id, active: zn.active }} />
                  </td>
                </tr>
              ))}
              {zones.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-4 text-center text-neutral-500">
                    Nicio zonă. Rulează migrarea 20260730_0008_pricing.sql pentru seed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-medium">Surge activ ({surges.length})</h2>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-left dark:bg-neutral-800">
              <tr>
                <th className="p-2">{t("thZone")}</th>
                <th className="p-2">Multiplicator</th>
                <th className="p-2">{t("thStart")}</th>
                <th className="p-2">{t("thEnd")}</th>
                <th className="p-2">{t("thSource")}</th>
                <th className="p-2">{t("thActions")}</th>
              </tr>
            </thead>
            <tbody>
              {surges.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-2">
                    {s.city} / {s.kind} / {s.vehicle_class}
                  </td>
                  <td className="p-2 font-semibold">×{Number(s.multiplier).toFixed(2)}</td>
                  <td className="p-2">{new Date(s.starts_at).toLocaleString("ro-RO")}</td>
                  <td className="p-2">
                    {s.ends_at ? new Date(s.ends_at).toLocaleString("ro-RO") : "—"}
                  </td>
                  <td className="p-2">{s.auto ? "auto" : "manual"}</td>
                  <td className="p-2">
                    <PricingActions surge={{ id: s.id }} />
                  </td>
                </tr>
              ))}
              {surges.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-neutral-500">
                    Niciun surge manual activ.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <PricingActions addSurgeZones={zones.filter((z) => z.active).map((z) => ({
            id: z.id,
            label: `${z.city} / ${z.kind} / ${z.vehicle_class}`,
          }))} />
        </div>
      </section>
    </div>
  );
}
