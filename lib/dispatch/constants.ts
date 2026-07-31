/**
 * Constante dispatch partajate client + server (fără importuri de server).
 * Sursa unică pentru viteze/raze — importate de engine (server) și de
 * componentele de tracking (client).
 */
export const OFFER_TTL_SECONDS = 45;
export const MAX_COURIERS_PER_WAVE = 5;

/** raza (km) per val; după ultimul val fără accept → no_courier */
export const WAVE_RADII_KM = [2, 5, 10] as const;

/** Viteze medii km/h per tip vehicul — folosite pentru ETA post-pickup. */
export const VEHICLE_SPEED_KMH: Record<string, number> = {
  foot: 5,
  bike: 15,
  scooter: 25,
  motorcycle: 30,
  car: 30,
  van: 28,
};
