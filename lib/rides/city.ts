/**
 * Orașul unei curse — derivat EXCLUSIV server-side din coordonatele de pickup
 * (reverse geocoding Nominatim, cache Redis 24h). Clientul nu poate impune
 * orașul (altfel ar putea alege o zonă de pricing mai ieftină).
 *
 * Fără oraș rezolvabil sau fără pricing_zone activă → caller răspunde 422.
 */
import { cityFromCoords } from "@/lib/geo/nominatim";
import { findZone } from "@/lib/pricing/engine";
import { logger } from "@/lib/logger";

const log = logger.child({ mod: "rides-city" });

export class NoZoneError extends Error {
  constructor(public readonly city: string | null) {
    super("no_zone");
    this.name = "NoZoneError";
  }
}

/**
 * Derivă orașul din pickup și verifică existența unei pricing_zone active
 * pentru (oraș, ride, clasă). Aruncă NoZoneError dacă nu există.
 */
export async function resolveRideCity(
  pickup: { lat: number; lng: number },
  vehicleClass: string,
  country = "RO",
): Promise<string> {
  const city = await cityFromCoords(pickup.lat, pickup.lng);
  if (!city) {
    log.info({ pickup }, "reverse geocoding nu a returnat oraș");
    throw new NoZoneError(null);
  }
  const zone = await findZone(city, "ride", vehicleClass, country);
  if (!zone) throw new NoZoneError(city);
  return city;
}
