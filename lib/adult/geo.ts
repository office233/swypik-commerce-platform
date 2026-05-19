/**
 * Geo detection for the Swypik 18+ surface.
 *
 * Cloudflare proxies `18.swypik.com` and injects these headers on every
 * request to the origin:
 *   - cf-ipcountry        ISO-3166-1 alpha-2 (e.g. "US", "RO")
 *   - cf-region-code      ISO-3166-2 sub-division code WITHOUT prefix
 *                         (e.g. "TX", "CA"). Requires Enterprise plan in
 *                         some cases — fall back to "cf-region" if needed.
 *   - cf-region           Full sub-division name (e.g. "Texas").
 *
 * We DO NOT use geo to BLOCK access — the project policy is full
 * US compliance (no geo-block). Geo is used to:
 *   - Show a US-state-specific health warning banner (Texas HB 1181, etc.)
 *   - Surface the correct legal links per region (DSA art. 28 for EU)
 *   - Tag audit log rows for incident response
 */

import { headers as nextHeaders } from "next/headers";

export interface GeoInfo {
  country: string | null;
  regionCode: string | null;
  regionName: string | null;
  /** True for US states with a content-warning statute we honour. */
  requiresHealthWarning: boolean;
  /** True for EU/EEA — surfaces additional DSA links. */
  isEuEea: boolean;
  /** Raw CF-Ray ID for debugging. */
  rayId: string | null;
}

const HEALTH_WARNING_US_STATES = new Set(["TX", "UT", "LA", "MS", "VA", "AR", "MT", "NC", "FL"]);

const EU_EEA = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
  "IS","LI","NO",
]);

export function geoFromHeaders(h: Headers): GeoInfo {
  const country = (h.get("cf-ipcountry") || "").toUpperCase() || null;
  const regionCode = (h.get("cf-region-code") || "").toUpperCase() || null;
  const regionName = h.get("cf-region") || null;
  const rayId = h.get("cf-ray") || null;

  const requiresHealthWarning =
    country === "US" && regionCode !== null && HEALTH_WARNING_US_STATES.has(regionCode);

  const isEuEea = country !== null && EU_EEA.has(country);

  return { country, regionCode, regionName, requiresHealthWarning, isEuEea, rayId };
}

export async function currentGeo(): Promise<GeoInfo> {
  const h = await nextHeaders();
  return geoFromHeaders(h);
}
