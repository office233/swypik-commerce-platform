"use client";

/** RoutePolyline — linia pickup → dropoff (linie dreaptă stilizată; OSM nu dă rutare gratuită fără server extern). */
import { Polyline } from "react-leaflet";

export default function RoutePolyline({
  points,
  color = "#0D0D0D",
}: {
  points: { lat: number; lng: number }[];
  color?: string;
}) {
  if (points.length < 2) return null;
  return (
    <Polyline
      positions={points.map((p) => [p.lat, p.lng] as [number, number])}
      pathOptions={{ color, weight: 4, opacity: 0.75, dashArray: "8 10" }}
    />
  );
}
