"use client";

/**
 * LiveMarker — marker pe hartă (pickup, dropoff, șofer live).
 * SVG inline ca DivIcon: fără asset-uri externe, distinct vizual per rol.
 */
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";

export type LiveMarkerProps = {
  position: { lat: number; lng: number };
  kind?: "pickup" | "dropoff" | "driver";
  label?: string;
};

// SVG-uri statice (lucide-style): punct verde/roșu pentru pickup/dropoff, mașină pentru șofer.
const dot = (color: string) =>
  `<svg width="26" height="26" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="${color}" stroke="white" stroke-width="2.5"/></svg>`;
// Lucide "car" path, inline static (nu putem randa componente React în divIcon).
const carSvg =
  `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`;
const ICON_HTML: Record<string, string> = {
  pickup: dot("#16A34A"),
  dropoff: dot("#DC2626"),
  driver: carSvg,
};

export default function LiveMarker({ position, kind = "pickup", label }: LiveMarkerProps) {
  const icon = useMemo(
    () =>
      L.divIcon({
        html: `<div style="line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">${ICON_HTML[kind]}</div>`,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 24],
      }),
    [kind],
  );
  return (
    <Marker position={[position.lat, position.lng]} icon={icon}>
      {label ? <Popup>{label}</Popup> : null}
    </Marker>
  );
}
